/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectReference } from '@kbn/core/server';
import type { DiscoverSessionAttributes } from '@kbn/saved-search-plugin/server';
import { fromStoredTab } from '../../../common/embeddable/transform_utils';
import type { DiscoverSessionApiData } from '../schema';
import { transformControlPanelsOut } from './transform_control_panels';
import { transformVisContextOut } from './transform_vis_context';

export const transformDiscoverSessionOut = (
  attributes: DiscoverSessionAttributes,
  references: SavedObjectReference[] = []
): DiscoverSessionApiData => {
  return {
    title: attributes.title,
    description: attributes.description,
    tabs: attributes.tabs.map((tab) => {
      const apiTab = fromStoredTab(tab.attributes, references);
      const visContext = transformVisContextOut(tab.attributes.visContext);
      const controlPanels = transformControlPanelsOut(tab.attributes.controlGroupJson);

      return {
        id: tab.id,
        label: tab.label,
        ...apiTab,
        hide_chart: tab.attributes.hideChart ?? false,
        hide_table: tab.attributes.hideTable ?? false,
        ...(tab.attributes.hideAggregatedPreview !== undefined && {
          hide_aggregated_preview: tab.attributes.hideAggregatedPreview,
        }),
        ...(tab.attributes.breakdownField !== undefined && {
          breakdown_field: tab.attributes.breakdownField,
        }),
        ...(tab.attributes.chartInterval !== undefined && {
          chart_interval: tab.attributes.chartInterval as Exclude<
            DiscoverSessionApiData['tabs'][number]['chart_interval'],
            undefined
          >,
        }),
        time_restore: tab.attributes.timeRestore ?? false,
        ...(tab.attributes.timeRange !== undefined && { time_range: tab.attributes.timeRange }),
        ...(tab.attributes.refreshInterval !== undefined && {
          refresh_interval: tab.attributes.refreshInterval,
        }),
        ...(visContext !== undefined && { vis_context: visContext }),
        ...(controlPanels !== undefined && { control_panels: controlPanels }),
      };
    }),
  };
};
