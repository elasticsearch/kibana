/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { uniqBy } from 'lodash';

import type { SavedObjectReference } from '@kbn/core-saved-objects-api-server';
import type { RequestTiming } from '@kbn/core-http-server';
import { toStoredTags } from '@kbn/as-code-shared-transforms';
import type { DashboardState } from '../../types';
import type { DashboardSavedObjectAttributes } from '../../../dashboard_saved_object';
import { transformPanelsIn } from './transform_panels_in';
import { transformPinnedPanelsIn } from './transform_pinned_panels_in';
import { transformSearchSourceIn } from './transform_search_source_in';
import { transformOptionsIn } from './transform_options_in';

export const transformDashboardIn = (
  dashboardState: Partial<DashboardState>,
  isDashboardAppRequest: boolean = false,
  serverTiming?: RequestTiming
): {
  attributes: DashboardSavedObjectAttributes;
  references: SavedObjectReference[];
} => {
  const timer = serverTiming?.start('transform-dashboard-in');

  try {
    const {
      pinned_panels,
      options,
      filters,
      panels,
      query,
      tags,
      time_range,
      refresh_interval,
      project_routing,
      ...rest
    } = dashboardState;

    const { references: tagReferences } = toStoredTags({ tags });

    const {
      panelsJSON,
      sections,
      references: panelReferences,
    } = panels
      ? transformPanelsIn(panels, isDashboardAppRequest)
      : {
          panelsJSON: '',
          sections: undefined,
          references: [],
        };

    const { searchSourceJSON, references: searchSourceReferences } = transformSearchSourceIn(
      filters,
      query
    );

    const { pinnedPanels, references: controlGroupReferences } = transformPinnedPanelsIn(
      pinned_panels ?? []
    );

    const attributes = {
      description: '',
      title: '',
      ...rest,
      ...(Object.keys(pinnedPanels).length && {
        pinned_panels: { panels: pinnedPanels },
      }),
      optionsJSON: transformOptionsIn(options ?? {}),
      panelsJSON,
      ...(refresh_interval && { refreshInterval: refresh_interval }),
      ...(sections?.length && { sections }),
      ...(time_range
        ? { timeFrom: time_range.from, timeTo: time_range.to, timeRestore: true }
        : { timeRestore: false }),
      kibanaSavedObjectMeta: { searchSourceJSON },
      ...(project_routing !== undefined && { projectRouting: project_routing }),
    };

    return {
      attributes,
      references: uniqBy(
        [
          ...tagReferences,
          ...panelReferences,
          ...controlGroupReferences,
          ...searchSourceReferences,
        ],
        'name'
      ),
    };
  } finally {
    timer?.end();
  }
};
