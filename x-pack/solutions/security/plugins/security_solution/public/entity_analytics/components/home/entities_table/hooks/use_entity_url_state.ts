/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch } from 'react-redux';
import type { BoolQuery, Filter, Query } from '@kbn/es-query';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import { useKibana } from '../../../../../common/lib/kibana';
import { useDeepEqualSelector } from '../../../../../common/hooks/use_selector';
import { inputsActions, inputsSelectors } from '../../../../../common/store/inputs';
import { InputsModelId } from '../../../../../common/store/inputs/constants';
import { useUrlQuery } from './use_url_query';
import { usePageSize } from './use_page_size';
import { useBaseEsQuery } from './use_base_es_query';
import { usePersistedQuery } from './use_persisted_query';

export interface EntitiesBaseURLQuery {
  query: Query;
  filters: Filter[];
  pageFilters?: Filter[];
  groupBy?: string[];
}

export type URLQuery = EntitiesBaseURLQuery & Record<string, unknown>;

type SortOrder = [string, string];

const getPageIndexOrDefault = (pageIndex: unknown): number =>
  typeof pageIndex === 'number' && Number.isFinite(pageIndex) ? pageIndex : 0;

export interface EntityURLStateResult {
  setUrlQuery: (query: Record<string, unknown>) => void;
  sort: SortOrder[];
  filters: Filter[];
  query: { bool: BoolQuery };
  queryError?: Error;
  pageIndex: number;
  pageSize: number;
  onChangeItemsPerPage: (newPageSize: number) => void;
  onChangePage: (newPageIndex: number) => void;
  onSort: (sort: string[][]) => void;
  onResetFilters: () => void;
  getRowsFromPages: (data: Array<{ page: DataTableRecord[] }> | undefined) => DataTableRecord[];
}

export const DEFAULT_ENTITIES_TABLE_SORT: Array<[string, string]> = [
  ['entity.risk.calculated_score_norm', 'desc'],
  ['@timestamp', 'desc'],
];

const getDefaultQuery = ({ query, filters }: EntitiesBaseURLQuery) => ({
  query,
  filters,
  pageFilters: [],
  sort: DEFAULT_ENTITIES_TABLE_SORT,
  pageIndex: 0,
});
export const useEntityURLState = ({
  defaultQuery = getDefaultQuery,
  paginationLocalStorageKey,
}: {
  defaultQuery?: (params: EntitiesBaseURLQuery) => URLQuery;
  paginationLocalStorageKey: string;
}): EntityURLStateResult => {
  const getPersistedDefaultQuery = usePersistedQuery<URLQuery>(defaultQuery);
  const { urlQuery, setUrlQuery } = useUrlQuery<URLQuery>(getPersistedDefaultQuery);
  const { pageSize, setPageSize } = usePageSize(paginationLocalStorageKey);

  const {
    data: {
      query: { filterManager },
    },
  } = useKibana().services;
  const dispatch = useDispatch();

  const getGlobalQuerySelector = useMemo(() => inputsSelectors.globalQuerySelector(), []);
  const reduxQuery = useDeepEqualSelector(getGlobalQuerySelector);

  // Bidirectional sync between the `cspq` URL state and Redux/`filterManager`
  // is driven by intent flags rather than value comparisons.  When this hook
  // initiates a write to one side, it records that intent so the inverse
  // effect can ignore the resulting echo.  This avoids the cycles (and the
  // deep-equal cascade) that arise when both sides treat every change as
  // user-initiated.
  const skipNextUrlToReduxQuery = useRef(false);
  const skipNextReduxToUrlQuery = useRef(false);
  const skipNextUrlToFilterManager = useRef(false);
  const skipNextFilterManagerToUrl = useRef(false);

  // URL → Redux global query: keeps `SiemSearchBar`'s KQL input in sync with
  // the query decoded from `cspq`. Without this, the search bar appears empty
  // even though data is actively filtered via the URL.
  useEffect(() => {
    if (skipNextUrlToReduxQuery.current) {
      skipNextUrlToReduxQuery.current = false;
      return;
    }
    const nextQuery = urlQuery.query;
    if (!nextQuery) return;
    skipNextReduxToUrlQuery.current = true;
    dispatch(
      inputsActions.setFilterQuery({
        id: InputsModelId.global,
        query: nextQuery.query as string,
        language: nextQuery.language as string,
      })
    );
  }, [dispatch, urlQuery.query]);

  // Redux → URL: pushes search-bar edits back to `cspq` so the URL stays
  // authoritative (e.g. for the Refresh button and shareable URLs).
  // The string compare on `query`/`language` short-circuits redundant pushes
  // when this effect re-fires due to `setUrlQuery` getting a new identity
  // after an unrelated URL change.
  useEffect(() => {
    if (skipNextReduxToUrlQuery.current) {
      skipNextReduxToUrlQuery.current = false;
      return;
    }
    if (!reduxQuery) return;
    const currentUrlQuery = urlQuery.query as Query | undefined;
    if (
      currentUrlQuery &&
      currentUrlQuery.query === reduxQuery.query &&
      currentUrlQuery.language === reduxQuery.language
    ) {
      return;
    }
    skipNextUrlToReduxQuery.current = true;
    setUrlQuery({ query: reduxQuery });
  }, [reduxQuery, urlQuery.query, setUrlQuery]);

  // URL → filterManager: keeps filter pills visible in the filter bar.
  useEffect(() => {
    if (skipNextUrlToFilterManager.current) {
      skipNextUrlToFilterManager.current = false;
      return;
    }
    const nextFilters = urlQuery.filters || [];
    skipNextFilterManagerToUrl.current = true;
    filterManager.setAppFilters(nextFilters);
    // If `setAppFilters` decides nothing actually changed it will not emit on
    // `getUpdates$`, leaving the flag set forever.  Reset it on a microtask so
    // the synchronous emit (if any) has already been consumed by then.
    Promise.resolve().then(() => {
      skipNextFilterManagerToUrl.current = false;
    });
  }, [filterManager, urlQuery.filters]);

  // filterManager → URL: syncs filter-bar interactions (adding/removing pills)
  // back to the `cspq` URL.
  useEffect(() => {
    const subscription = filterManager.getUpdates$().subscribe(() => {
      if (skipNextFilterManagerToUrl.current) {
        skipNextFilterManagerToUrl.current = false;
        return;
      }
      skipNextUrlToFilterManager.current = true;
      setUrlQuery({ filters: filterManager.getAppFilters() });
    });
    return () => subscription.unsubscribe();
  }, [filterManager, setUrlQuery]);

  const onChangeItemsPerPage = useCallback(
    (newPageSize: number) => {
      setPageSize(newPageSize);
      setUrlQuery({
        pageIndex: 0,
        pageSize: newPageSize,
      });
    },
    [setPageSize, setUrlQuery]
  );

  const onResetFilters = useCallback(() => {
    // We are about to drive every side of the sync ourselves: URL, Redux, and
    // filterManager.  Pre-mark the intent flags so the URL/Redux/filterManager
    // effects ignore the echoes from these writes instead of bouncing them
    // back and re-introducing the filters we just cleared.
    skipNextUrlToReduxQuery.current = true;
    skipNextReduxToUrlQuery.current = true;
    skipNextUrlToFilterManager.current = true;
    skipNextFilterManagerToUrl.current = true;

    // Clear `filterManager` directly so any pinned/app filter pills are
    // removed immediately rather than relying on the URL → filterManager
    // effect (which would otherwise race with `useSyncGlobalQueryString`
    // re-pushing the previous `filters` URL param and reviving the pill).
    filterManager.setAppFilters([]);

    dispatch(
      inputsActions.setFilterQuery({
        id: InputsModelId.global,
        query: '',
        language: 'kuery',
      })
    );

    dispatch(
      inputsActions.setSavedQuery({
        id: InputsModelId.global,
        savedQuery: undefined,
      })
    );

    setUrlQuery({
      pageIndex: 0,
      filters: [],
      query: {
        query: '',
        language: 'kuery',
      },
    });
  }, [filterManager, setUrlQuery, dispatch]);

  const onChangePage = useCallback(
    (newPageIndex: number) => {
      setUrlQuery({
        pageIndex: newPageIndex,
      });
    },
    [setUrlQuery]
  );

  const onSort = useCallback(
    (sort: string[][]) => {
      setUrlQuery({
        sort,
      });
    },
    [setUrlQuery]
  );

  const baseEsQuery = useBaseEsQuery({
    filters: urlQuery.filters,
    pageFilters: urlQuery.pageFilters,
    query: urlQuery.query,
  });

  const getRowsFromPages = (data: Array<{ page: DataTableRecord[] }> | undefined) =>
    data
      ?.map(({ page }: { page: DataTableRecord[] }) => {
        return page;
      })
      .flat() || [];

  const queryError = baseEsQuery instanceof Error ? baseEsQuery : undefined;

  return {
    setUrlQuery,
    sort: urlQuery.sort as SortOrder[],
    filters: urlQuery.filters || [],
    query: baseEsQuery.query
      ? baseEsQuery.query
      : {
          bool: {
            must: [],
            filter: [],
            should: [],
            must_not: [],
          },
        },
    queryError,
    pageIndex: getPageIndexOrDefault(urlQuery.pageIndex),
    pageSize,
    onChangeItemsPerPage,
    onChangePage,
    onSort,
    onResetFilters,
    getRowsFromPages,
  };
};
