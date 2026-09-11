/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AS_CODE_DATA_VIEW_SPEC_TYPE } from '@kbn/as-code-data-views-schema';
import { toStoredTags } from '@kbn/as-code-shared-transforms';
import { unpinFilter } from '@kbn/es-query';
import { cloneDeep, isPlainObject } from 'lodash';
import { mapAndFlattenFilters } from '@kbn/data-plugin/public';
import {
  injectReferences,
  parseSearchSourceJSON,
  type SerializedSearchSourceFields,
} from '@kbn/data-plugin/common';
import type { DiscoverSession, DiscoverSessionTab } from '@kbn/saved-search-plugin/common';
import { fromStoredTab, toStoredSort, toStoredTab } from '../../common/embeddable/transform_utils';
import {
  deserializeEsqlControls,
  serializeEsqlControls,
} from '../../common/session/control_panels';
import type {
  DiscoverSessionApiData,
  DiscoverSessionApiResponse,
  DiscoverSessionApiTab,
} from '../../server';
import type {
  DiscoverSessionRequestData,
  DiscoverSessionRequestTab,
  DiscoverSessionResolve,
} from './api_client';
import { fromApiVisContext, toApiVisContext } from '../../common/session/vis_context';
import { getVisContextRequestData } from '../../common/session/get_vis_context_request_data';
import { fromApiTabTypeState, toApiTabTypeState } from '../../common/session/tab_type_state';

// Converts between API documents and Discover's in-memory sessions, including their references.
// The stored-tab format is only an intermediate step to reuse existing search and table conversions;
// this file does not read or write Saved Objects. Chart, control, and tab-type conversions are shared.
// Reading applies filter defaults; the client handles HTTP, and tab restoration assigns inline IDs.

/** Builds a Discover session from API data, including filter defaults and URL-resolution metadata. */
export const fromDiscoverSessionApiResponse = (
  response: DiscoverSessionApiResponse,
  resolve?: DiscoverSessionResolve
): DiscoverSession => {
  const tabsWithReferences = response.data.tabs.map(fromApiTab);
  const { references: tagReferences } = toStoredTags({ tags: response.data.tags });

  return {
    id: response.id,
    title: response.data.title,
    description: response.data.description,
    tags: response.data.tags,
    tabs: tabsWithReferences.map(({ tab }) => tab),
    managed: response.meta.managed ?? false,
    references: [...tagReferences, ...tabsWithReferences.flatMap(({ references }) => references)],
    ...(resolve?.outcome !== undefined && { sharingSavedObjectProps: resolve }),
  };
};

/** Converts a Discover session into a create or upsert request body. */
export const toDiscoverSessionApiData = (
  session: Pick<DiscoverSession, 'title' | 'description' | 'tabs' | 'tags'>
): DiscoverSessionRequestData => ({
  title: session.title,
  description: session.description,
  ...(session.tags !== undefined && { tags: session.tags }),
  tabs: session.tabs.map(toApiTab),
});

/** Rebuilds saved-object references from the API document without rebuilding Discover tabs. */
export const getDiscoverSessionReferences = (data: DiscoverSessionApiData) => {
  const { references: tagReferences } = toStoredTags({ tags: data.tags });
  const tabReferences = data.tabs.flatMap((tab) => {
    const { references } = toStoredTab(tab, { refNamePrefix: `tab_${tab.id}` });
    return references;
  });

  return [...tagReferences, ...tabReferences];
};

/** Rebuilds a Discover tab and its references, combining shared conversions with session-only fields. */
const fromApiTab = (apiTab: DiscoverSessionApiTab) => {
  // Reuse the stored-format conversion to rebuild search source fields and references in memory.
  const { state: storedTab, references } = toStoredTab(apiTab, {
    refNamePrefix: `tab_${apiTab.id}`,
  });
  const serializedSearchSource = injectReferences(
    parseSearchSourceJSON(storedTab.kibanaSavedObjectMeta.searchSourceJSON),
    references
  );
  const tabTypeState = fromApiTabTypeState(apiTab);

  const tab: DiscoverSessionTab = {
    id: apiTab.id,
    label: apiTab.label,
    sort: toStoredSort(apiTab.sort),
    columns: storedTab.columns,
    grid: storedTab.grid,
    viewMode: storedTab.viewMode,
    rowHeight: storedTab.rowHeight,
    headerRowHeight: storedTab.headerRowHeight,
    rowsPerPage: storedTab.rowsPerPage,
    sampleSize: storedTab.sampleSize,
    density: storedTab.density,
    documentsDisplayMode: storedTab.documentsDisplayMode,
    jsonModeSettings: storedTab.jsonModeSettings,
    isTextBasedQuery: storedTab.isTextBasedQuery,
    usesAdHocDataView: apiTab.data_source.type === AS_CODE_DATA_VIEW_SPEC_TYPE,
    serializedSearchSource: normalizeSearchSourceFilters(serializedSearchSource),
    hideChart: apiTab.hide_chart,
    hideTable: apiTab.hide_table,
    hideAggregatedPreview: apiTab.hide_aggregated_preview,
    esqlApproximation: 'esql_approximation' in apiTab ? apiTab.esql_approximation : undefined,
    timeRestore: apiTab.time_range !== undefined,
    timeRange: apiTab.time_range,
    refreshInterval: apiTab.refresh_interval,
    breakdownField: apiTab.breakdown_field,
    chartInterval: apiTab.chart_interval,
    visContext: fromApiVisContext(apiTab.vis_context, getVisContextRequestData(apiTab)),
    controlGroupJson: serializeEsqlControls(apiTab.control_panels),
    ...(tabTypeState !== undefined && { tabTypeState }),
  };

  return {
    references,
    tab,
  };
};

/** Builds an API tab from Discover state, omitting local inline IDs and mapping session-only fields. */
const toApiTab = (tab: DiscoverSessionTab): DiscoverSessionRequestTab => {
  const { id, label, serializedSearchSource: _searchSource, ...tabAttributes } = tab;
  // Only the search source needs a different shape here. The transformer selects the API fields.
  const storedTab: Parameters<typeof fromStoredTab>[0] = {
    ...tabAttributes,
    kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify(toApiSearchSource(tab)) },
  };
  const apiTab = toApiTabTypeState(
    {
      id,
      label,
      ...fromStoredTab(storedTab),
      hide_chart: tab.hideChart,
      hide_table: tab.hideTable,
    },
    tab.tabTypeState
  );
  const visContext = getApiVisContext(tab.visContext);
  const controlPanels = deserializeEsqlControls(tab.controlGroupJson);

  return {
    ...apiTab,
    ...(tab.hideAggregatedPreview !== undefined && {
      hide_aggregated_preview: tab.hideAggregatedPreview,
    }),
    ...(tab.breakdownField !== undefined && { breakdown_field: tab.breakdownField }),
    ...(tab.chartInterval !== undefined && {
      chart_interval: tab.chartInterval as NonNullable<DiscoverSessionApiTab['chart_interval']>,
    }),
    ...(tab.timeRestore && tab.timeRange !== undefined && { time_range: tab.timeRange }),
    ...(tab.refreshInterval !== undefined && { refresh_interval: tab.refreshInterval }),
    ...(visContext !== undefined && { vis_context: visContext }),
    ...(controlPanels !== undefined && { control_panels: controlPanels }),
    ...(tab.isTextBasedQuery &&
      tab.esqlApproximation !== undefined && { esql_approximation: tab.esqlApproximation }),
  };
};

/** Omits chart state without object attributes before applying the shared API conversion. */
const getApiVisContext = (visContext: DiscoverSessionTab['visContext']) => {
  if (!visContext || !('attributes' in visContext) || !isPlainObject(visContext.attributes)) {
    return undefined;
  }

  return toApiVisContext(visContext);
};

/** Keeps pinned conditions as app filters and removes IDs targeting the tab's inline Data View. */
const toApiSearchSource = (tab: DiscoverSessionTab) => {
  const searchSource = tab.serializedSearchSource;
  const inlineDataViewId = getInlineDataViewId(searchSource);

  if (tab.isTextBasedQuery || !Array.isArray(searchSource.filter)) {
    return searchSource;
  }

  const filter = searchSource.filter.map((storedFilter) => {
    // GET already converts stored pinned filters to app filters, but users can pin filters in the UI
    // before saving. Keep those conditions in the request without changing the UI's pin state.
    const appFilter = unpinFilter(storedFilter);
    if (inlineDataViewId === undefined || appFilter.meta.index !== inlineDataViewId) {
      return appFilter;
    }

    const { index: _inlineDataViewId, ...meta } = appFilter.meta;
    return { ...appFilter, meta };
  });

  return { ...searchSource, filter };
};

/** Returns the tab's inline Data View ID. */
const getInlineDataViewId = (searchSource: SerializedSearchSourceFields) => {
  const { index } = searchSource;
  return index && typeof index !== 'string' ? index.id : undefined;
};

/** Applies FilterManager's defaults to copied filters so opening a session does not look like an edit. */
const normalizeSearchSourceFilters = (searchSource: SerializedSearchSourceFields) => {
  const { filter } = searchSource;
  if (!filter) {
    return searchSource;
  }

  return {
    ...searchSource,
    filter: mapAndFlattenFilters(cloneDeep(filter)),
  };
};
