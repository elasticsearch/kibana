/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AS_CODE_DATA_VIEW_SPEC_TYPE } from '@kbn/as-code-data-views-schema';
import type { SavedObjectReference } from '@kbn/core/server';
import type { DiscoverSessionAttributes } from '@kbn/saved-search-plugin/server';
import { toStoredTab } from '../../../common/embeddable/transform_utils';
import type { DiscoverSessionApiData, DiscoverSessionApiTab } from '../schema';
import { transformControlPanelsIn } from './transform_control_panels';
import { transformVisContextIn } from './transform_vis_context';

const getVisContextRequestData = (tab: DiscoverSessionApiTab) => {
  const dataViewId =
    tab.data_source.type !== AS_CODE_DATA_VIEW_SPEC_TYPE && 'ref_id' in tab.data_source
      ? tab.data_source.ref_id
      : undefined;
  const timeField =
    tab.data_source.type === AS_CODE_DATA_VIEW_SPEC_TYPE && 'time_field' in tab.data_source
      ? tab.data_source.time_field
      : undefined;

  return {
    ...(dataViewId !== undefined && { dataViewId }),
    ...(timeField !== undefined && { timeField }),
    ...(tab.chart_interval !== undefined && { timeInterval: tab.chart_interval }),
    ...(tab.breakdown_field !== undefined && { breakdownField: tab.breakdown_field }),
  };
};

export const transformDiscoverSessionIn = (
  data: DiscoverSessionApiData
): { attributes: DiscoverSessionAttributes; references: SavedObjectReference[] } => {
  const references: SavedObjectReference[] = [];

  const tabs: DiscoverSessionAttributes['tabs'] = data.tabs.map((tab) => {
    const { state: tabAttributes, references: tabReferences } = toStoredTab(tab, {
      refNamePrefix: `tab_${tab.id}`,
    });

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
        timeRestore: tab.time_restore,
        timeRange: tab.time_range,
        refreshInterval: tab.refresh_interval,
        visContext: transformVisContextIn(tab.vis_context, getVisContextRequestData(tab)),
        controlGroupJson: transformControlPanelsIn(tab.control_panels),
        usesAdHocDataView: tab.data_source.type === AS_CODE_DATA_VIEW_SPEC_TYPE,
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
