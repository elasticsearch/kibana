/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { pick } from 'lodash';
import deepEqual from 'react-fast-compare';
import type { Observable } from 'rxjs';
import { BehaviorSubject, combineLatest, map, skip } from 'rxjs';
import type { Adapters } from '@kbn/inspector-plugin/common';
import type { ISearchSource, SerializedSearchSourceFields } from '@kbn/data-plugin/common';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type {
  PublishesWritableUnifiedSearch,
  PublishesWritableDataViews,
  ProjectRoutingOverrides,
  PublishesEsql,
  PublishesProjectRoutingOverrides,
} from '@kbn/presentation-publishing';
import type { DiscoverGridSettings, SavedSearch } from '@kbn/saved-search-plugin/common';
import type { SortOrder, VIEW_MODE } from '@kbn/saved-search-plugin/public';
import type {
  DataGridDensity,
  DataTableColumnsMeta,
  JsonModeSettings,
  DocumentsDisplayMode,
} from '@kbn/unified-data-table';

import {
  isOfAggregateQueryType,
  type AggregateQuery,
  type Filter,
  type Query,
} from '@kbn/es-query';
import { getProjectRoutingFromEsqlQuery } from '@kbn/esql-utils';
import type { PublishesWritableTimeRange } from '@kbn/presentation-publishing/interfaces/fetch/publishes_unified_search';
import { SavedObjectNotFound } from '@kbn/kibana-utils-plugin/common';
import { getEsqlDataView } from '@kbn/discover-utils';
import type { DiscoverServices } from '../build_services';
import { EDITABLE_SAVED_SEARCH_KEYS } from '../../common/embeddable/constants';
import type {
  PublishesWritableSavedSearch,
  SearchEmbeddableSerializedAttributes,
  SearchEmbeddableStateManager,
} from './types';

const initializeSearchSource = async (
  discoverServices: DiscoverServices,
  serializedSearchSource?: SerializedSearchSourceFields
) => {
  let searchSource: ISearchSource;
  let parentSearchSource: ISearchSource;

  try {
    [searchSource, parentSearchSource] = await Promise.all([
      discoverServices.data.search.searchSource.create(serializedSearchSource),
      discoverServices.data.search.searchSource.create(),
    ]);
  } catch (error) {
    if (error instanceof SavedObjectNotFound) {
      [searchSource, parentSearchSource] = await Promise.all([
        discoverServices.data.search.searchSource.create(),
        discoverServices.data.search.searchSource.create(),
      ]);
    } else {
      throw error;
    }
  }

  searchSource.setParent(parentSearchSource);

  const query = searchSource.getField('query');
  let dataView = searchSource.getField('index');

  if (isOfAggregateQueryType(query)) {
    dataView = await getEsqlDataView(query, dataView, discoverServices);
  }

  return { searchSource, dataView };
};

const initializedSavedSearch = (
  stateManager: SearchEmbeddableStateManager,
  searchSource: ISearchSource,
  discoverServices: DiscoverServices
): SavedSearch => {
  return {
    ...Object.keys(stateManager).reduce((prev, key) => {
      return {
        ...prev,
        [key]: stateManager[key as keyof SearchEmbeddableStateManager].getValue(),
      };
    }, discoverServices.savedSearch.getNew()),
    searchSource,
  };
};

const getProjectRoutingOverrides = (query: Query | AggregateQuery | undefined) => {
  if (isOfAggregateQueryType(query)) {
    const value = getProjectRoutingFromEsqlQuery(query.esql);
    return value ? [{ value }] : undefined;
  }
};

export const initializeSearchEmbeddableApi = async ({
  initialState,
  dataLoading$,
  discoverServices,
}: {
  initialState: SearchEmbeddableSerializedAttributes;
  dataLoading$: BehaviorSubject<boolean | undefined>;
  discoverServices: DiscoverServices;
}): Promise<{
  api: PublishesWritableSavedSearch &
    PublishesWritableDataViews &
    Omit<PublishesWritableUnifiedSearch, keyof PublishesWritableTimeRange> &
    PublishesProjectRoutingOverrides &
    PublishesEsql;
  internalApi: {
    setApproximationApplied: (approximationApplied?: boolean) => void;
  };
  stateManager: SearchEmbeddableStateManager;
  anyStateChange$: Observable<void>;
  cleanup: () => void;
  reinitializeState: (lastSaved: SearchEmbeddableSerializedAttributes) => Promise<void>;
}> => {
  /** We **must** have a search source, so start by initializing it  */
  const { searchSource, dataView } = await initializeSearchSource(
    discoverServices,
    initialState.serializedSearchSource
  );
  const searchSource$ = new BehaviorSubject<ISearchSource>(searchSource);
  const dataViews$ = new BehaviorSubject<DataView[] | undefined>(dataView ? [dataView] : undefined);

  /** This is the state that can be initialized from the saved initial state */
  const columns$ = new BehaviorSubject<string[] | undefined>(initialState.columns);
  const grid$ = new BehaviorSubject<DiscoverGridSettings | undefined>(initialState.grid);
  const headerRowHeight$ = new BehaviorSubject<number | undefined>(initialState.headerRowHeight);
  const rowHeight$ = new BehaviorSubject<number | undefined>(initialState.rowHeight);
  const rowsPerPage$ = new BehaviorSubject<number | undefined>(initialState.rowsPerPage);
  const sampleSize$ = new BehaviorSubject<number | undefined>(initialState.sampleSize);
  const density$ = new BehaviorSubject<DataGridDensity | undefined>(initialState.density);
  const documentsDisplayMode$ = new BehaviorSubject<DocumentsDisplayMode | undefined>(
    initialState.documentsDisplayMode
  );
  const jsonModeSettings$ = new BehaviorSubject<JsonModeSettings | undefined>(
    initialState.jsonModeSettings
  );
  const sort$ = new BehaviorSubject<SortOrder[] | undefined>(initialState.sort);
  const savedSearchViewMode$ = new BehaviorSubject<VIEW_MODE | undefined>(initialState.viewMode);

  /**
   * This is the state that comes from the search source that needs individual publishing subjects for the API
   * - Note that these subjects can't currently be changed on their own, and therefore we do not need to keep
   *   them "in sync" with changes to the search source. This would change with inline editing.
   */
  const filters$ = new BehaviorSubject<Filter[] | undefined>(
    searchSource.getField('filter') as Filter[]
  );
  const query$ = new BehaviorSubject<Query | AggregateQuery | undefined>(
    searchSource.getField('query')
  );

  const initialQuery = searchSource.getField('query');
  const projectRoutingOverrides$ = new BehaviorSubject<ProjectRoutingOverrides>(
    getProjectRoutingOverrides(initialQuery)
  );
  const esql$ = new BehaviorSubject<AggregateQuery[]>(
    isOfAggregateQueryType(initialQuery) ? [initialQuery] : []
  );
  const approximationApplied$ = new BehaviorSubject<boolean | undefined>(undefined);

  const canEditUnifiedSearch = () => false;

  /** This is the state that has to be fetched */
  const rows$ = new BehaviorSubject<DataTableRecord[]>([]);
  const columnsMeta$ = new BehaviorSubject<DataTableColumnsMeta | undefined>(undefined);
  const totalHitCount$ = new BehaviorSubject<number | undefined>(undefined);
  const inspectorAdapters$ = new BehaviorSubject<Adapters>({});

  /**
   * The state manager is used to modify the state of the saved search - this should never be
   * treated as the source of truth
   */
  const stateManager: SearchEmbeddableStateManager = {
    columns: columns$,
    columnsMeta: columnsMeta$,
    grid: grid$,
    headerRowHeight: headerRowHeight$,
    rows: rows$,
    rowHeight: rowHeight$,
    rowsPerPage: rowsPerPage$,
    sampleSize: sampleSize$,
    sort: sort$,
    totalHitCount: totalHitCount$,
    viewMode: savedSearchViewMode$,
    density: density$,
    documentsDisplayMode: documentsDisplayMode$,
    jsonModeSettings: jsonModeSettings$,
    inspectorAdapters: inspectorAdapters$,
  };

  /** The saved search should be the source of truth for all state  */
  const savedSearch$ = new BehaviorSubject(
    initializedSavedSearch(stateManager, searchSource, discoverServices)
  );

  /** This will fire when any of the **editable** state changes */
  const onAnyStateChange: Observable<Partial<SearchEmbeddableSerializedAttributes>> = combineLatest(
    pick(stateManager, EDITABLE_SAVED_SEARCH_KEYS)
  );

  /** APIs for updating search source properties */
  const setDataViews = (nextDataViews: DataView[]) => {
    searchSource.setField('index', nextDataViews[0]);
    dataViews$.next(nextDataViews);
    searchSource$.next(searchSource);
  };

  const setFilters = (filters: Filter[] | undefined) => {
    searchSource.setField('filter', filters);
    filters$.next(filters);
    searchSource$.next(searchSource);
  };

  const setQuery = (query: Query | AggregateQuery | undefined) => {
    searchSource.setField('query', query);
    query$.next(query);
    searchSource$.next(searchSource);
  };

  const setColumns = (columns: string[] | undefined) => {
    stateManager.columns.next(columns);
  };

  const reinitializeState = async (state: SearchEmbeddableSerializedAttributes) => {
    // Trigger dataLoading$ and clear rows$ to show the initial loading state
    dataLoading$.next(true);
    rows$.next([]);

    const { searchSource: newSearchSource, dataView: newDataView } = await initializeSearchSource(
      discoverServices,
      state.serializedSearchSource
    );

    // Ensure all state updates happen synchronously to prevent multiple reloads
    searchSource$.next(newSearchSource);

    dataViews$.next(newDataView ? [newDataView] : undefined);

    const newQuery = newSearchSource.getField('query');
    const newFilters = newSearchSource.getField('filter') as Filter[] | undefined;

    query$.next(newQuery);
    filters$.next(newFilters);
    sort$.next(state.sort);
    columns$.next(state.columns);
    grid$.next(state.grid);
    sampleSize$.next(state.sampleSize);
    rowsPerPage$.next(state.rowsPerPage);
    rowHeight$.next(state.rowHeight);
    headerRowHeight$.next(state.headerRowHeight);
    savedSearchViewMode$.next(state.viewMode);
    density$.next(state.density);
    documentsDisplayMode$.next(state.documentsDisplayMode);
    jsonModeSettings$.next(state.jsonModeSettings);
  };

  /** Keep the saved search in sync with any state changes */
  const syncSavedSearch = combineLatest([onAnyStateChange, searchSource$])
    .pipe(
      skip(1),
      map(([newState, newSearchSource]) => ({
        ...savedSearch$.getValue(),
        ...newState,
        searchSource: newSearchSource,
      }))
    )
    .subscribe((newSavedSearch) => {
      savedSearch$.next(newSavedSearch);
    });

  /** Keep projectRoutingOverrides$ and esql$ in sync with query$ changes */
  const syncProjectRoutingOverrides = query$.subscribe((query) => {
    const currentOverrides = projectRoutingOverrides$.getValue();
    const nextOverrides = getProjectRoutingOverrides(query);

    if (!deepEqual(currentOverrides, nextOverrides)) {
      projectRoutingOverrides$.next(nextOverrides);
    }

    const nextEsql = isOfAggregateQueryType(query) ? [query] : [];
    if (!deepEqual(esql$.getValue(), nextEsql)) {
      esql$.next(nextEsql);
      if (nextEsql.length === 0) approximationApplied$.next(undefined);
    }
  });

  const setApproximationApplied = (value: boolean | undefined) => {
    if (approximationApplied$.getValue() !== value) {
      approximationApplied$.next(value);
    }
  };

  return {
    cleanup: () => {
      syncSavedSearch.unsubscribe();
      syncProjectRoutingOverrides.unsubscribe();
    },
    internalApi: {
      setApproximationApplied,
    },
    api: {
      setDataViews,
      dataViews$,
      savedSearch$,
      filters$,
      setFilters,
      query$,
      setQuery,
      projectRoutingOverrides$,
      esql$,
      approximationApplied$,
      canEditUnifiedSearch,
      setColumns,
    },
    stateManager,
    anyStateChange$: onAnyStateChange.pipe(
      skip(1),
      map(() => undefined)
    ),
    reinitializeState,
  };
};
