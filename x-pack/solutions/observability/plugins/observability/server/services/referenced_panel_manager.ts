/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardPanel } from '@kbn/dashboard-plugin/server';
import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import type { Reference } from '@kbn/content-management-utils';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import type { ReferencedPanelAttributes, ReferencedPanelAttributesWithReferences } from './helpers';

// Dashboard panels carry an embeddable `type` while the entries in
// `dashboard.references` carry the underlying saved object content type. They
// happened to be the same string before the Lens / Visualize embeddable rename
// (https://github.com/elastic/kibana/pull/260040), but after that change the
// embeddable type for Lens became `vis` while the saved object content type
// stayed as `lens` (see `LENS_CONTENT_TYPE` in `@kbn/lens-common`). The same
// pattern applies to the legacy visualization embeddable (`legacy_vis`
// embeddable, `visualization` saved object). This map translates an embeddable
// type into the saved object type used inside dashboard references so we can
// look up the right entry in `dashboard.references` and call `bulkGet` with a
// valid saved object type.
const EMBEDDABLE_TYPE_TO_SAVED_OBJECT_TYPE: Readonly<Record<string, string>> = {
  [LENS_EMBEDDABLE_TYPE]: 'lens',
};

const toReferenceSavedObjectType = (embeddableType: string): string =>
  EMBEDDABLE_TYPE_TO_SAVED_OBJECT_TYPE[embeddableType] ?? embeddableType;

export class ReferencedPanelManager {
  // The uid refers to the ID of the saved object reference, while the panelId refers to the ID of the saved object itself (the panel).
  // So, if the same saved object panel is referenced in two different dashboards, it will have different uid values in each dashboard, but the same panelId, since they're both referencing the same panel.
  private panelsById = new Map<string, ReferencedPanelAttributesWithReferences>();
  private panelUidToId = new Map<string, string>();
  private panelsTypeById = new Map<string, string>();

  constructor(private logger: Logger, private soClient: SavedObjectsClientContract) {}

  async fetchReferencedPanels(): Promise<void> {
    if (this.panelsTypeById.size === 0) {
      return;
    }

    const panelsToFetch = [...this.panelsTypeById.entries()].map(([id, type]) => ({ id, type }));

    try {
      const { saved_objects: savedObjects } =
        await this.soClient.bulkGet<ReferencedPanelAttributes>(panelsToFetch);

      savedObjects.forEach((so) => {
        if (isSavedObjectErrorResult(so)) {
          return;
        }
        this.panelsById.set(so.id, {
          ...so.attributes,
          references: so.references,
        });
      });
    } catch (error) {
      this.logger.error(`Error fetching ${panelsToFetch.length} panels : ${error.message}`);
    }
  }

  getByUid(uid: string): ReferencedPanelAttributesWithReferences | undefined {
    const panelId = this.panelUidToId.get(uid);
    return panelId ? this.panelsById.get(panelId) : undefined;
  }

  // This method adds the panel type to the map, so that we can fetch the panel later and it links the panel uid to the panelId.
  addReferencedPanel({
    dashboardId,
    references,
    panel,
  }: {
    dashboardId: string;
    references: Reference[];
    panel: DashboardPanel;
  }) {
    const { id: uid, type } = panel;
    if (!uid) return;

    const savedObjectType = toReferenceSavedObjectType(type);
    const panelReference = references.find(
      (r) => r.name.includes(uid) && r.type === savedObjectType
    );
    // A reference of the panel was not found.
    //
    // This is a recoverable condition: the panel is silently skipped from
    // suggested-dashboards scoring and the endpoint still returns
    // successfully. We log at `warn` (not `error`) to avoid inflating the
    // server error metric, and we keep panel/dashboard identifiers out of
    // the message string so the log can be aggregated by message without
    // exploding cardinality. The identifiers stay searchable via `labels`.
    if (!panelReference) {
      this.logger.warn(`Reference for dashboard panel not found in dashboard.references`, {
        labels: {
          panel_embeddable_type: type,
          panel_saved_object_type: savedObjectType,
          panel_uid: uid,
          dashboard_id: dashboardId,
        },
      });
      return;
    }

    const panelId = panelReference.id;

    this.panelUidToId.set(uid, panelId);

    if (!this.panelsTypeById.has(panelId)) {
      this.panelsTypeById.set(panelId, savedObjectType);
    }
  }
}
