/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  AS_CODE_DATA_VIEW_SPEC_TYPE,
  AS_CODE_ESQL_DATA_SOURCE_TYPE,
} from '@kbn/as-code-data-views-schema';
import { toStoredTags } from '@kbn/as-code-shared-transforms';
import type { SavedObjectReference } from '@kbn/core/server';
import type { DiscoverSessionAttributes } from '@kbn/saved-search-plugin/server';
import { toStoredTab } from '../../../common/embeddable/transform_utils';
import { getVisContextRequestData } from '../../../common/session/get_vis_context_request_data';
import type {
  DiscoverSessionApiData,
  DiscoverSessionApiEsqlTab,
  DiscoverSessionApiTab,
} from '../schema';
import { transformControlPanelsIn } from './transform_control_panels';
import { fromApiTabTypeState } from '../../../common/session/tab_type_state';
import { fromApiVisContext } from '../../../common/session/vis_context';

const isEsqlTab = (tab: DiscoverSessionApiTab): tab is DiscoverSessionApiEsqlTab =>
  tab.data_source.type === AS_CODE_ESQL_DATA_SOURCE_TYPE;

export const transformDiscoverSessionIn = (
  data: DiscoverSessionApiData
): { attributes: DiscoverSessionAttributes; references: SavedObjectReference[] } => {
  const { references: tagReferences } = toStoredTags({ tags: data.tags });
  const references: SavedObjectReference[] = [...tagReferences];

  const tabs: DiscoverSessionAttributes['tabs'] = data.tabs.map((tab) => {
    const { state: tabAttributes, references: tabReferences } = toStoredTab(tab, {
      refNamePrefix: `tab_${tab.id}`,
    });
    const tabTypeState = fromApiTabTypeState(tab);

    references.push(...tabReferences);

    return {
      id: tab.id,
      label: tab.label,
      attributes: {
        ...tabAttributes,
        hideChart: tab.hide_chart,
        hideTable: tab.hide_table,
        hideAggregatedPreview: tab.hide_aggregated_preview,
        breakdownField: tab.breakdown_field,
        chartInterval: tab.chart_interval,
        timeRestore: tab.time_range !== undefined,
        timeRange: tab.time_range,
        refreshInterval: tab.refresh_interval,
        visContext: fromApiVisContext(tab.vis_context, getVisContextRequestData(tab)),
        controlGroupJson: transformControlPanelsIn(tab.control_panels),
        usesAdHocDataView: tab.data_source.type === AS_CODE_DATA_VIEW_SPEC_TYPE,
        ...(isEsqlTab(tab) &&
          tab.esql_approximation !== undefined && {
            esqlApproximation: tab.esql_approximation,
          }),
        ...(tabTypeState !== undefined && { tabTypeState }),
      },
    };
  });

  return {
    attributes: {
      title: data.title,
      description: data.description,
      tabs,
    },
    references,
  };
};
