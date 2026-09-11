/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AggregateQuery, Filter, Query, TimeRange } from '@kbn/es-query';
import {
  type HasParentApi,
  type PublishesSavedObjectId,
  type PublishesUnifiedSearch,
  apiIsPresentationContainer,
} from '@kbn/presentation-publishing';
import type { ControlPanelsState } from '@kbn/control-group-renderer';
import type { SerializableRecord } from '@kbn/utility-types';
import { getEsqlControls } from '@kbn/esql-utils';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { TimefilterContract } from '@kbn/data-plugin/public';
import type { ESQLControlVariable } from '@kbn/esql-types';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { DiscoverGridSettings, SavedSearch } from '@kbn/saved-search-plugin/common/types';
import type { DiscoverAppLocatorParams } from '../../../common';
import { getExpandedDocRef } from '../../application/main/utils/expanded_doc';
import type { PublishesSavedSearch, PublishesSelectedTabId } from '../types';

export const getEsqlControlsFromApi = (
  api: PublishesSavedSearch & Partial<HasParentApi>
): (ControlPanelsState<OptionsListESQLControlState> & SerializableRecord) | undefined => {
  const presentationContainer = apiIsPresentationContainer(api.parentApi)
    ? api.parentApi
    : undefined;

  if (!presentationContainer) {
    return undefined;
  }

  const query = api.savedSearch$.getValue()?.searchSource.getField('query');

  return getEsqlControls(presentationContainer, query) as
    | (ControlPanelsState<OptionsListESQLControlState> & SerializableRecord)
    | undefined;
};

export const getSavedSearchLinkRef = (
  api: Partial<PublishesSavedObjectId & PublishesSelectedTabId>
): Pick<DiscoverAppLocatorParams, 'savedSearchId' | 'tab'> => {
  const savedObjectId = api.savedObjectId$?.getValue();

  if (!savedObjectId) {
    return {};
  }

  const selectedTabId = api.getSelectedTabId?.();

  return {
    savedSearchId: savedObjectId,
    ...(selectedTabId ? { tab: { id: selectedTabId } } : {}),
  };
};

export const getDiscoverLocatorParams = (
  api: PublishesSavedSearch &
    Partial<PublishesSavedObjectId & PublishesSelectedTabId & PublishesUnifiedSearch & HasParentApi>
) => {
  const savedSearch = api.savedSearch$.getValue();
  const query = savedSearch?.searchSource.getField('query');

  const dataView = savedSearch?.searchSource.getField('index');
  const savedObjectId = api.savedObjectId$?.getValue();

  const locatorParams: DiscoverAppLocatorParams = savedObjectId
    ? getSavedSearchLinkRef(api)
    : {
        dataViewId: dataView?.id,
        dataViewSpec: dataView?.toMinimalSpec(),
        esqlControls: getEsqlControlsFromApi(api),
        timeRange: savedSearch?.timeRange,
        refreshInterval: savedSearch?.refreshInterval,
        filters: savedSearch?.searchSource.getField('filter') as Filter[],
        query,
        columns: savedSearch?.columns,
        sort: savedSearch?.sort,
        viewMode: savedSearch?.viewMode,
        hideAggregatedPreview: savedSearch?.hideAggregatedPreview,
      };

  return locatorParams;
};

export interface GetExpandedDocLocatorParamsArgs {
  api: PublishesSavedSearch &
    Partial<PublishesSavedObjectId & PublishesSelectedTabId & HasParentApi>;
  savedSearch: SavedSearch;
  dataView: DataView;
  query: Query | AggregateQuery | undefined;
  /** The saved search's own filters. */
  panelFilters: Filter[] | undefined;
  /** The dashboard's filters applied to the panel (from the fetch context). */
  dashboardFilters: Filter[] | undefined;
  columns: string[];
  sort: string[][];
  grid: DiscoverGridSettings | undefined;
  isEsql: boolean;
  esqlVariables: ESQLControlVariable[] | undefined;
  expandedDoc: DataTableRecord | undefined;
  timeRange: TimeRange | undefined;
  timefilter: Pick<TimefilterContract, 'calculateBounds'>;
}

// Build a Discover deep link to a panel's expanded document. The link carries the saved search's
// identity, its query mode, and the panel's displayed state so the recipient reproduces the same view.
export const getExpandedDocLocatorParams = ({
  api,
  savedSearch,
  dataView,
  query,
  panelFilters,
  dashboardFilters,
  columns,
  sort,
  grid,
  isEsql,
  esqlVariables,
  expandedDoc,
  timeRange,
  timefilter,
}: GetExpandedDocLocatorParamsArgs): DiscoverAppLocatorParams => {
  const expandedDocRef = getExpandedDocRef(expandedDoc);

  // Freeze the panel's window so the shared link reproduces the same results instead of drifting
  // with a relative range like "Last 15 minutes".
  const bounds = timeRange ? timefilter.calculateBounds(timeRange) : undefined;
  const absoluteTimeRange =
    bounds?.min && bounds?.max
      ? { from: bounds.min.toISOString(), to: bounds.max.toISOString() }
      : timeRange;

  // Reproduce the exact result set the panel shows: its own filters plus the dashboard's filters.
  const combinedFilters = [...(panelFilters ?? []), ...(dashboardFilters ?? [])];

  return {
    // Link back to the library saved search (and its tab) for by-reference panels; empty for
    // by-value panels. Everything else below is the panel's current displayed state.
    ...getSavedSearchLinkRef(api),
    // Pin the query and data view so the link opens in the same mode (classic vs ES|QL) instead
    // of inheriting the recipient's last-used Discover mode.
    query,
    ...(dataView.isPersisted()
      ? { dataViewId: dataView.id }
      : { dataViewSpec: dataView.toMinimalSpec() }),
    filters: combinedFilters,
    columns,
    sort,
    grid,
    viewMode: savedSearch.viewMode,
    hideAggregatedPreview: savedSearch.hideAggregatedPreview,
    breakdownField: savedSearch.breakdownField,
    sampleSize: savedSearch.sampleSize,
    ...(isEsql
      ? {
          esqlControls: getEsqlControlsFromApi(api),
          ...(esqlVariables ? { esqlVariables } : {}),
        }
      : {}),
    ...(expandedDocRef ? { expandedDoc: expandedDocRef } : {}),
    ...(absoluteTimeRange ? { timeRange: absoluteTimeRange } : {}),
  };
};
