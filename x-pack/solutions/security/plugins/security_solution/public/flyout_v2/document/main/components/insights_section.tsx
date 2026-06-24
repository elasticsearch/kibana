/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type DataTableRecord, getFieldValue } from '@kbn/discover-utils';
import { i18n } from '@kbn/i18n';
import React, { memo, useCallback, useMemo } from 'react';
import { EVENT_KIND } from '@kbn/rule-data-utils';
import { useHistory } from 'react-router-dom';
import { useStore } from 'react-redux';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { documentFlyoutHistoryKey } from '../../../shared/constants/flyout_history';
import { DocumentFlyoutWrapper } from '../document_flyout_wrapper';
import { type CellActionRenderer } from '../../../shared/components/cell_actions';
import { EventKind } from '../constants/event_kinds';
import { getColumns } from '../../tools/prevalence/utils/get_columns';
import { useRuleWithFallback } from '../../../../detection_engine/rule_management/logic/use_rule_with_fallback';
import { FLYOUT_STORAGE_KEYS } from '../constants/local_storage';
import { PREFIX } from '../../../../flyout/shared/test_ids';
import { useKibana } from '../../../../common/lib/kibana';
import { ExpandableSection } from '../../../shared/components/expandable_section';
import { useExpandSection } from '../../../shared/hooks/use_expand_section';
import { ThreatIntelligenceOverview } from './threat_intelligence_overview';
import { CorrelationsOverview } from './correlations_overview';
import { PrevalenceOverview } from './prevalence_overview';
import { EntitiesOverview } from './entities_overview';
import { PrevalenceDetails } from '../../tools/prevalence';
import { flyoutProviders } from '../../../shared/components/flyout_provider';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import { CorrelationsDetails } from '../../tools/correlations';
import { ThreatIntelligenceDetails } from '../../tools/threat_intelligence';
import {
  defaultToolsFlyoutProperties,
  useDefaultDocumentFlyoutProperties,
} from '../../../shared/hooks/use_default_flyout_properties';
import type { OpenFlyoutLinkProps } from '../../../shared/components/open_flyout_link';
import { OpenFlyoutLink } from '../../../shared/components/open_flyout_link';
import { HOST_NAME_FIELD_NAME } from '../../../../timelines/components/timeline/body/renderers/constants';

export const INSIGHTS_SECTION_TEST_ID = `${PREFIX}InsightsSection` as const;

export const INSIGHTS_SECTION_TITLE = i18n.translate(
  'xpack.securitySolution.flyout.document.insights.sectionTitle',
  {
    defaultMessage: 'Insights',
  }
);

const LOCAL_STORAGE_SECTION_KEY = 'insights';

export interface InsightsSectionProps {
  /**
   * Document to display in the overview tab
   */
  hit: DataTableRecord;
  /**
   * Renderer for cell actions on field values. Falls back to the Security default when not provided.
   */
  renderCellActions: CellActionRenderer;
  /**
   * Callback invoked after alert mutations to refresh parent flyout content.
   */
  onAlertUpdated: () => void;
}

/**
 * Insights section of the overview tab.
 * Content to be added soon.
 */
export const InsightsSection = memo(
  ({ hit, renderCellActions, onAlertUpdated }: InsightsSectionProps) => {
    const { services } = useKibana();
    const { overlays } = services;
    const store = useStore();
    const history = useHistory();
    const defaultFlyoutProperties = useDefaultDocumentFlyoutProperties();
    const isInSecurityApp = useIsInSecurityApp();
    const historyKey = isInSecurityApp ? documentFlyoutHistoryKey : DOC_VIEWER_FLYOUT_HISTORY_KEY;

    const expanded = useExpandSection({
      storageKey: FLYOUT_STORAGE_KEYS.OVERVIEW_TAB_EXPANDED_SECTIONS,
      title: LOCAL_STORAGE_SECTION_KEY,
      defaultValue: true,
    });

    const isAlert = useMemo(
      () => (getFieldValue(hit, EVENT_KIND) as string) === EventKind.signal,
      [hit]
    );
    const ruleId = useMemo(
      () =>
        isAlert
          ? (getFieldValue(hit, 'kibana.alert.rule.uuid') as string)
          : (getFieldValue(hit, 'signal.rule.id') as string),
      [hit, isAlert]
    );
    const { rule } = useRuleWithFallback(ruleId);
    const investigationFields = useMemo(
      () => rule?.investigation_fields?.field_names ?? [],
      [rule?.investigation_fields?.field_names]
    );

    const onShowThreatIntelligenceDetails = useCallback(() => {
      overlays.openSystemFlyout(
        flyoutProviders({
          services,
          store,
          history,
          children: <ThreatIntelligenceDetails hit={hit} />,
        }),
        {
          ...defaultToolsFlyoutProperties,
          historyKey,
          session: 'start',
        }
      );
    }, [history, historyKey, hit, overlays, services, store]);

    const onShowAlert = useCallback(
      (id: string, indexName: string) =>
        overlays.openSystemFlyout(
          flyoutProviders({
            services,
            store,
            history,
            children: (
              <DocumentFlyoutWrapper
                documentId={id}
                indexName={indexName}
                renderCellActions={renderCellActions}
                onAlertUpdated={onAlertUpdated}
              />
            ),
          }),
          {
            ...defaultFlyoutProperties,
            session: 'inherit',
          }
        ),
      [
        defaultFlyoutProperties,
        renderCellActions,
        history,
        onAlertUpdated,
        overlays,
        services,
        store,
      ]
    );

    const onShowCorrelationsDetails = useCallback(() => {
      overlays.openSystemFlyout(
        flyoutProviders({
          services,
          store,
          history,
          children: (
            <CorrelationsDetails
              hit={hit}
              scopeId=""
              isRulePreview={false}
              onShowAlert={onShowAlert}
            />
          ),
        }),
        {
          ...defaultToolsFlyoutProperties,
          historyKey,
          session: 'start',
        }
      );
    }, [history, historyKey, hit, onShowAlert, overlays, services, store]);

    const renderFlyoutLink = useCallback(
      (props: OpenFlyoutLinkProps) => (
        <OpenFlyoutLink {...props} asParent={props.field === HOST_NAME_FIELD_NAME} />
      ),
      []
    );

    const onShowPrevalenceDetails = useCallback(() => {
      overlays.openSystemFlyout(
        flyoutProviders({
          services,
          store,
          history,
          children: (
            <PrevalenceDetails
              hit={hit}
              investigationFields={investigationFields}
              scopeId={''}
              columns={getColumns(renderCellActions, isInSecurityApp, '', renderFlyoutLink)}
            />
          ),
        }),
        {
          ...defaultToolsFlyoutProperties,
          historyKey,
          session: 'start',
        }
      );
    }, [
      renderCellActions,
      history,
      historyKey,
      hit,
      investigationFields,
      isInSecurityApp,
      overlays,
      services,
      store,
      renderFlyoutLink,
    ]);

    return (
      <ExpandableSection
        data-test-subj={INSIGHTS_SECTION_TEST_ID}
        expanded={expanded}
        gutterSize="m"
        localStorageKey={FLYOUT_STORAGE_KEYS.OVERVIEW_TAB_EXPANDED_SECTIONS}
        sectionId={LOCAL_STORAGE_SECTION_KEY}
        title={INSIGHTS_SECTION_TITLE}
      >
        <EntitiesOverview hit={hit} renderCellActions={renderCellActions} showIcon={false} />
        {isAlert && (
          <ThreatIntelligenceOverview
            hit={hit}
            onShowThreatIntelligence={onShowThreatIntelligenceDetails}
            showIcon={false}
          />
        )}
        <CorrelationsOverview
          hit={hit}
          scopeId=""
          isRulePreview={false}
          showIcon={false}
          onShowCorrelationsDetails={onShowCorrelationsDetails}
        />
        <PrevalenceOverview
          hit={hit}
          investigationFields={investigationFields}
          showIcon={false}
          onShowPrevalenceDetails={onShowPrevalenceDetails}
        />
      </ExpandableSection>
    );
  }
);

InsightsSection.displayName = 'InsightsSection';
