/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { isEmpty, omit } from 'lodash';
import type { Logger } from '@kbn/core/server';
import { isDashboardPanel } from '@kbn/dashboard-plugin/common';
import type { ScanDashboardsResult, DashboardReadResponseBody } from '@kbn/dashboard-plugin/server';
import type { DashboardState, DashboardPanel } from '@kbn/as-code-dashboard-schema';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import type {
  FieldBasedIndexPatternColumn,
  GenericIndexPatternColumn,
} from '@kbn/lens-plugin/public';
import type { LensAttributes } from '@kbn/lens-embeddable-utils';
import type {
  RelatedDashboard,
  SuggestedDashboard,
  LinkedDashboard,
} from '@kbn/observability-schema';
import type { InvestigateAlertsClient } from './investigate_alerts_client';
import type { AlertData } from './alert_data';
import type { SuggestedDashboardsValidPanelType } from './helpers';
import {
  isSuggestedDashboardsValidPanelType,
  isSuggestedDashboardsValidRuleTypeId,
} from './helpers';
import type { ReferencedPanelManager } from './referenced_panel_manager';

export class RelatedDashboardsClient {
  public dashboardsById = new Map<
    string,
    Pick<DashboardState, 'description' | 'panels' | 'tags' | 'title'>
  >();
  private alert: AlertData | null = null;

  constructor(
    private logger: Logger,
    private getDashboard: (id: string) => Promise<DashboardReadResponseBody>,
    private scanDashboards: (page: number, perPage: number) => Promise<ScanDashboardsResult>,
    private alertsClient: InvestigateAlertsClient,
    private alertId: string,
    private referencedPanelManager: ReferencedPanelManager
  ) {}

  public async fetchRelatedDashboards(): Promise<{
    suggestedDashboards: SuggestedDashboard[];
    linkedDashboards: LinkedDashboard[];
  }> {
    const [alertDocument] = await Promise.all([
      this.alertsClient.getAlertById(this.alertId),
      this.fetchFirst500Dashboards(),
    ]);
    this.setAlert(alertDocument);
    const [suggestedDashboards, linkedDashboards] = await Promise.all([
      this.fetchSuggestedDashboards(),
      this.getLinkedDashboards(),
    ]);
    const filteredSuggestedDashboards = suggestedDashboards.filter(
      (suggested) => !linkedDashboards.some((linked) => linked.id === suggested.id)
    );
    return {
      suggestedDashboards: filteredSuggestedDashboards.slice(0, 10), // limit to 10 suggested dashboards
      linkedDashboards,
    };
  }

  private getPanelIndicesMap: Record<
    SuggestedDashboardsValidPanelType,
    (panel: DashboardPanel) => Set<string> | undefined
  > = {
    [LENS_EMBEDDABLE_TYPE]: (panel: DashboardPanel) => {
      let references = this.isLensVizAttributes(panel.type, panel.config)
        ? panel.config.attributes.references
        : undefined;
      if (!references && panel.id) {
        references = this.referencedPanelManager.getByUid(panel.id)?.references;
      }
      if (references?.length) {
        return new Set(
          references.filter((r) => r.name.match(`indexpattern`)).map((reference) => reference.id)
        );
      }
    },
  };

  private getPanelFieldsMap: Record<
    SuggestedDashboardsValidPanelType,
    (panel: DashboardPanel) => Set<string> | undefined
  > = {
    [LENS_EMBEDDABLE_TYPE]: (panel: DashboardPanel) => {
      let state: unknown = this.isLensVizAttributes(panel.type, panel.config)
        ? panel.config.attributes.state
        : undefined;
      if (!state && panel.id) {
        state = this.referencedPanelManager.getByUid(panel.id)?.state;
      }
      if (this.isLensAttributesState(state)) {
        const fields = new Set<string>();
        const dataSourceLayers = state.datasourceStates.formBased?.layers || {};
        Object.values(dataSourceLayers).forEach((ds) => {
          const columns = ds.columns;
          Object.values(columns).forEach((col) => {
            if (this.hasSourceField(col)) {
              fields.add(col.sourceField);
            }
          });
        });
        return fields;
      }
    },
  };

  private hasSourceField(c: GenericIndexPatternColumn): c is FieldBasedIndexPatternColumn {
    return 'sourceField' in c;
  }

  private isLensAttributesState(state: unknown): state is LensAttributes['state'] {
    return typeof state === 'object' && state !== null && 'datasourceStates' in state;
  }

  private setAlert(alert: AlertData) {
    this.alert = alert;
  }

  private checkAlert(): AlertData {
    if (!this.alert)
      throw new Error(
        `Alert with id ${this.alertId} not found. Could not fetch related dashboards.`
      );
    return this.alert;
  }

  private async fetchSuggestedDashboards(): Promise<SuggestedDashboard[]> {
    const alert = this.checkAlert();
    if (!isSuggestedDashboardsValidRuleTypeId(alert.getRuleTypeId())) return [];

    const allSuggestedDashboards = new Set<SuggestedDashboard>();
    const relevantDashboardsById = new Map<string, SuggestedDashboard>();
    const index = this.getRuleQueryIndex();
    const allRelevantFields = alert.getAllRelevantFields();

    if (index) {
      const { dashboards } = this.getDashboardsByIndex(index);
      dashboards.forEach((dashboard) => allSuggestedDashboards.add(dashboard));
    }
    if (allRelevantFields.length > 0) {
      const { dashboards } = this.getDashboardsByField(allRelevantFields);
      dashboards.forEach((dashboard) => allSuggestedDashboards.add(dashboard));
    }
    allSuggestedDashboards.forEach((dashboard) => {
      relevantDashboardsById.set(dashboard.id, {
        ...dashboard,
        matchedBy: {
          ...relevantDashboardsById.get(dashboard.id)?.matchedBy,
          ...dashboard.matchedBy,
        },
        score: this.getScore(dashboard),
      });
    });
    const sortedDashboards = Array.from(relevantDashboardsById.values()).sort((a, b) => {
      return b.score - a.score;
    });
    return sortedDashboards;
  }

  private async fetchDashboards({
    page,
    perPage = 20,
    limit,
  }: {
    page: number;
    perPage?: number;
    limit?: number;
  }) {
    const results = await this.scanDashboards(page, perPage);
    for (const dashboard of results.dashboards) {
      for (const panel of dashboard.panels ?? []) {
        if (
          isDashboardPanel(panel) &&
          isSuggestedDashboardsValidPanelType(panel.type) &&
          (isEmpty(panel.config) || !(panel.config as Record<string, unknown>).attributes)
        ) {
          this.referencedPanelManager.addReferencedPanel({
            dashboardId: dashboard.id,
            references: dashboard.references,
            panel,
          });
        }
      }
      this.dashboardsById.set(dashboard.id, dashboard);
    }

    await this.referencedPanelManager.fetchReferencedPanels();

    const fetchedUntil = (page - 1) * perPage + results.dashboards.length;

    if (results.total <= fetchedUntil) {
      return;
    }
    if (limit && fetchedUntil >= limit) {
      return;
    }
    await this.fetchDashboards({ page: page + 1, perPage, limit });
  }

  private async fetchFirst500Dashboards() {
    await this.fetchDashboards({ page: 1, perPage: 500, limit: 500 });
  }

  private getDashboardsByIndex(index: string): {
    dashboards: SuggestedDashboard[];
  } {
    const relevantDashboards: SuggestedDashboard[] = [];
    this.dashboardsById.forEach((d, id) => {
      const panels = (d.panels ?? []).filter(isDashboardPanel);
      const matchingPanels = this.getPanelsByIndex(index, panels);
      if (matchingPanels.length > 0) {
        this.logger.debug(
          () => `Found ${matchingPanels.length} panel(s) in dashboard ${id} using index ${index}`
        );
        relevantDashboards.push({
          id,
          title: d.title,
          description: d.description,
          tags: d.tags,
          matchedBy: { index: [index] },
          score: 0, // scores are computed when dashboards are deduplicated
        });
      }
    });
    return { dashboards: relevantDashboards };
  }

  private getDashboardsByField(fields: string[]): {
    dashboards: SuggestedDashboard[];
  } {
    const relevantDashboards: SuggestedDashboard[] = [];
    this.dashboardsById.forEach((d, id) => {
      const panels = (d.panels ?? []).filter(isDashboardPanel);
      const matchingPanels = this.getPanelsByField(fields, panels);
      const allMatchingFields = new Set(
        matchingPanels.map((p) => Array.from(p.matchingFields)).flat()
      );
      if (matchingPanels.length > 0) {
        this.logger.debug(
          () =>
            `Found ${matchingPanels.length} panel(s) in dashboard ${id} using field(s) ${Array.from(
              allMatchingFields
            ).toString()}`
        );
        relevantDashboards.push({
          id,
          title: d.title,
          description: d.description,
          tags: d.tags,
          matchedBy: { fields: Array.from(allMatchingFields) },
          score: 0, // scores are computed when dashboards are deduplicated
        });
      }
    });
    return { dashboards: relevantDashboards };
  }

  private getPanelsByIndex(index: string, panels: DashboardPanel[]): DashboardPanel[] {
    const panelsByIndex = panels.filter((p) => this.getPanelIndices(p).has(index));
    return panelsByIndex;
  }

  private getPanelsByField(
    fields: string[],
    panels: DashboardPanel[]
  ): Array<{ matchingFields: Set<string>; panel: DashboardPanel }> {
    const panelsByField = panels.reduce((acc, p) => {
      const matchingFields = fields.filter((f) => this.getPanelFields(p).has(f));
      if (matchingFields.length) {
        acc.push({ matchingFields: new Set(matchingFields), panel: p });
      }
      return acc;
    }, [] as Array<{ matchingFields: Set<string>; panel: DashboardPanel }>);
    return panelsByField;
  }

  private getPanelIndices(panel: DashboardPanel): Set<string> {
    const indices = isSuggestedDashboardsValidPanelType(panel.type)
      ? this.getPanelIndicesMap[panel.type](panel)
      : undefined;
    return indices ?? new Set<string>();
  }

  private getPanelFields(panel: DashboardPanel): Set<string> {
    const fields = isSuggestedDashboardsValidPanelType(panel.type)
      ? this.getPanelFieldsMap[panel.type](panel)
      : undefined;
    return fields ?? new Set<string>();
  }

  private isLensVizAttributes(
    type: string,
    config: object
  ): config is { attributes: LensAttributes } {
    const { attributes } = (config ?? {}) as Record<string, unknown>;
    if (!attributes || type !== LENS_EMBEDDABLE_TYPE) {
      return false;
    }
    return typeof attributes === 'object';
  }

  private getRuleQueryIndex(): string | null {
    const alert = this.checkAlert();
    const index = alert.getRuleQueryIndex();
    return index;
  }

  private async getLinkedDashboards(): Promise<LinkedDashboard[]> {
    const alert = this.checkAlert();
    const ruleId = alert.getRuleId();
    if (!ruleId) {
      throw new Error(
        `Alert with id ${this.alertId} does not have a rule ID. Could not fetch linked dashboards.`
      );
    }
    const rule = await this.alertsClient.getRuleById(ruleId);
    if (!rule) {
      throw new Error(
        `Rule with id ${ruleId} not found. Could not fetch linked dashboards for alert with id ${this.alertId}.`
      );
    }
    const linkedDashboardsArtifacts = rule.artifacts?.dashboards || [];
    const linkedDashboards = await this.getLinkedDashboardsByIds(
      linkedDashboardsArtifacts.map((d) => d.id)
    );
    return linkedDashboards;
  }

  private async getLinkedDashboardsByIds(ids: string[]): Promise<LinkedDashboard[]> {
    const linkedDashboardsResponse = await Promise.all(
      ids.map((id) => this.getLinkedDashboardById(id))
    );
    return linkedDashboardsResponse.filter((dashboard): dashboard is LinkedDashboard =>
      Boolean(dashboard)
    );
  }

  private async getLinkedDashboardById(id: string): Promise<LinkedDashboard | null> {
    try {
      const { id: dashboardId, data: dashboard } = await this.getDashboard(id);
      return {
        id: dashboardId,
        title: dashboard.title,
        description: dashboard.description,
        tags: dashboard.tags,
        matchedBy: { linked: true },
      };
    } catch (error) {
      if (error.output.statusCode === 404) {
        this.logger.warn(`Linked dashboard with id ${id} not found. Skipping.`);
        return null;
      }
      throw new Error(`Error fetching dashboard with id ${id}: ${error.message || error}`);
    }
  }

  private getMatchingFields(dashboard: RelatedDashboard): string[] {
    const matchingFields = new Set<string>();
    // grab all the top level arrays from the matchedBy object via Object.values
    Object.values(omit(dashboard.matchedBy, 'linked')).forEach((match) => {
      // add the values of each array to the matchingFields set
      match.forEach((value) => {
        matchingFields.add(value);
      });
    });
    return Array.from(matchingFields);
  }

  private getScore(dashboard: RelatedDashboard): number {
    const alert = this.checkAlert();
    const allRelevantFields = alert.getAllRelevantFields();
    const index = this.getRuleQueryIndex();
    const setA = new Set<string>([...allRelevantFields, ...(index ? [index] : [])]);
    const setB = new Set<string>(this.getMatchingFields(dashboard));
    const intersection = new Set([...setA].filter((item) => setB.has(item)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
  }
}
