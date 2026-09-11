/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AS_CODE_DATA_VIEW_SPEC_TYPE } from '@kbn/as-code-data-views-schema';
import { toAsCodeTags } from '@kbn/as-code-shared-transforms';
import type { SavedObjectReference } from '@kbn/core/server';
import { parseSearchSourceJSON } from '@kbn/data-plugin/common';
import { isFilterPinned, unpinFilter } from '@kbn/es-query';
import type {
  DiscoverSessionAttributes,
  DiscoverSessionTabAttributes,
} from '@kbn/saved-search-plugin/server';
import type { DiscoverSessionTab } from '../../embeddable';
import { isDiscoverSessionEsqlTab } from '../../../common/embeddable';
import { fromStoredTab } from '../../../common/embeddable/transform_utils';
import type { DiscoverSessionApiData, DiscoverSessionWarning } from '../schema';
import { transformControlPanelsOut } from './transform_control_panels';
import { toApiTabTypeState } from '../../../common/session/tab_type_state';
import { toApiVisContext } from '../../../common/session/vis_context';

export const transformDiscoverSessionOut = (
  attributes: DiscoverSessionAttributes,
  references: SavedObjectReference[] = []
): { sessionState: DiscoverSessionApiData; warnings: DiscoverSessionWarning[] } => {
  const { tags } = toAsCodeTags(references);
  const warnings: DiscoverSessionWarning[] = [];
  const sessionState: DiscoverSessionApiData = {
    title: attributes.title,
    description: attributes.description,
    tags,
    tabs: attributes.tabs.map((tab) => {
      const transformedTab = fromStoredTab(pinnedFiltersToAppFilters(tab.attributes), references);
      const inlineDataViewId = getStoredInlineDataViewId(
        transformedTab,
        tab.attributes.kibanaSavedObjectMeta.searchSourceJSON
      );
      const apiTab = omitInlineDataViewIdFromFilters(transformedTab, inlineDataViewId);
      const visContext = toApiVisContext(tab.attributes.visContext);
      const { panels: controlPanels, warnings: controlPanelWarnings } = transformControlPanelsOut(
        tab.attributes.controlGroupJson,
        tab.id
      );
      warnings.push(...controlPanelWarnings);

      const sessionTab = {
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
        ...(tab.attributes.timeRestore &&
          tab.attributes.timeRange !== undefined && { time_range: tab.attributes.timeRange }),
        ...(tab.attributes.refreshInterval !== undefined && {
          refresh_interval: tab.attributes.refreshInterval,
        }),
        ...(visContext !== undefined && { vis_context: visContext }),
        ...(controlPanels !== undefined && { control_panels: controlPanels }),
        ...(tab.attributes.isTextBasedQuery &&
          tab.attributes.esqlApproximation !== undefined && {
            esql_approximation: tab.attributes.esqlApproximation,
          }),
      };

      return toApiTabTypeState(sessionTab, tab.attributes.tabTypeState);
    }),
  };

  return { sessionState, warnings };
};

/**
 * Preserves Kibana's pre-as-code Discover behavior: stored pinned filters are loaded
 * as app filters, keeping their conditions instead of dropping them during API conversion.
 */
const pinnedFiltersToAppFilters = (attributes: DiscoverSessionTabAttributes) => {
  const { kibanaSavedObjectMeta } = attributes;
  const searchSource = parseSearchSourceJSON(kibanaSavedObjectMeta.searchSourceJSON);
  const { filter: filters } = searchSource;

  if (!Array.isArray(filters) || !filters.some(isFilterPinned)) {
    return attributes;
  }

  const searchSourceJSON = JSON.stringify({
    ...searchSource,
    filter: filters.map(unpinFilter),
  });

  return {
    ...attributes,
    kibanaSavedObjectMeta: {
      ...kibanaSavedObjectMeta,
      searchSourceJSON,
    },
  };
};

/** Returns the stored ID only when the API tab contains an inline data view. */
const getStoredInlineDataViewId = (
  tab: DiscoverSessionTab,
  searchSourceJSON: string
): string | undefined => {
  if (tab.data_source.type !== AS_CODE_DATA_VIEW_SPEC_TYPE) {
    return undefined;
  }

  const { index } = parseSearchSourceJSON(searchSourceJSON);
  if (!index || typeof index === 'string') {
    return undefined;
  }

  return index.id;
};

/**
 * Removes the tab's inline Data View ID from filters that use it.
 * IDs pointing to other Data Views are preserved.
 */
const omitInlineDataViewIdFromFilters = (
  tab: DiscoverSessionTab,
  inlineDataViewId: string | undefined
): DiscoverSessionTab => {
  if (inlineDataViewId === undefined || isDiscoverSessionEsqlTab(tab)) {
    return tab;
  }

  const filters = tab.filters.map((filter) => {
    if (filter.data_view_id !== inlineDataViewId) {
      return filter;
    }

    const { data_view_id: _inlineDataViewId, ...filterWithoutDataViewId } = filter;
    return filterWithoutDataViewId;
  });

  return { ...tab, filters } satisfies typeof tab;
};
