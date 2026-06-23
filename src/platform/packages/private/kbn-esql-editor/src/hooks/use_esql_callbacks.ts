/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { CoreStart } from '@kbn/core/public';
import type { TimeRange } from '@kbn/es-query';
import type { ESQLCallbacks, ESQLControlVariable, ESQLRegistrySolutionId } from '@kbn/esql-types';
import { KQL_TYPE_TO_KIND_MAP } from '@kbn/esql-types';
import type { ISearchGeneric } from '@kbn/search-types';
import type { ILicense } from '@kbn/licensing-types';
import type { MapCache } from 'lodash';
import type { FavoritesClient } from '@kbn/content-management-favorites-public';
import {
  getESQLAdHocDataview,
  getEditorExtensions,
  getEsqlPolicies,
  getInferenceEndpoints,
  getTimeseriesIndices,
  getViews,
  getDatasets,
} from '@kbn/esql-utils';
import type { getEsqlColumns, getESQLSources } from '@kbn/esql-utils';
import type { ESQLSourceResult } from '@kbn/esql-types';
import { clearCacheWhenOld } from '../helpers';
import { getHistoryItems } from '../history_local_storage';
import type { ESQLEditorDeps } from '../types';
import type { StarredQueryMetadata } from '../editor_footer/esql_starred_queries_service';
import { useCanCreateLookupIndex } from '../lookup_join';
import { useCanSuggestResourceBrowser } from '../resource_browser/use_can_suggest_resource_browser';
import { DATA_SOURCES_CACHE_KEY, HISTORY_STARRED_ITEMS_CACHE_KEY } from '../helpers';

type MemoizedFn<TArgs extends unknown[], TResult> = (...args: TArgs) => {
  timestamp: number;
  result: TResult;
};

type MemoizedFieldsFromESQL = MemoizedFn<
  [
    {
      esqlQuery: string;
      search: ISearchGeneric;
      timeRange: TimeRange;
      signal?: AbortSignal;
      dropNullColumns?: boolean;
      variables?: ESQLControlVariable[];
    }
  ],
  ReturnType<typeof getEsqlColumns>
>;

type MemoizedSources = MemoizedFn<
  [
    CoreStart,
    (() => Promise<ILicense | undefined>) | undefined,
    ((sources: ESQLSourceResult[]) => Promise<ESQLSourceResult[]>) | undefined
  ],
  ReturnType<typeof getESQLSources>
>;

type MemoizedHistoryStarredItems = MemoizedFn<
  [typeof getHistoryItems, FavoritesClient<StarredQueryMetadata>],
  Promise<string[]>
>;

interface UseEsqlCallbacksParams {
  core: CoreStart;
  data: ESQLEditorDeps['data'];
  kql?: ESQLEditorDeps['kql'];
  fieldsMetadata?: ESQLEditorDeps['fieldsMetadata'];
  esqlService?: ESQLEditorDeps['esql'];
  histogramBarTarget: number;
  activeSolutionId?: ESQLRegistrySolutionId;
  minimalQueryRef: MutableRefObject<string>;
  dataSourcesCache: MapCache;
  memoizedSources: MemoizedSources;
  esqlFieldsCache: MapCache;
  memoizedFieldsFromESQL: MemoizedFieldsFromESQL;
  historyStarredItemsCache: MapCache;
  memoizedHistoryStarredItems: MemoizedHistoryStarredItems;
  favoritesClient: FavoritesClient<StarredQueryMetadata>;
  getJoinIndicesCallback: Required<ESQLCallbacks>['getJoinIndices'];
  enableResourceBrowser: boolean;
}

export const useEsqlCallbacks = ({
  core,
  data,
  kql,
  fieldsMetadata,
  esqlService,
  histogramBarTarget,
  activeSolutionId,
  minimalQueryRef,
  dataSourcesCache,
  memoizedSources,
  esqlFieldsCache,
  memoizedFieldsFromESQL,
  historyStarredItemsCache,
  memoizedHistoryStarredItems,
  favoritesClient,
  getJoinIndicesCallback,
  enableResourceBrowser,
}: UseEsqlCallbacksParams): ESQLCallbacks => {
  const columnsAbortControllerRef = useRef<AbortController | undefined>(undefined);
  const previousColumnsQueryRef = useRef<string | undefined>(undefined);

  const getSources = useCallback(async () => {
    clearCacheWhenOld(dataSourcesCache, DATA_SOURCES_CACHE_KEY);
    const getLicense = esqlService?.getLicense;
    const enrichSources = esqlService?.enrichSources;
    const sources = await memoizedSources(core, getLicense, enrichSources).result;
    return sources;
  }, [dataSourcesCache, memoizedSources, core, esqlService]);

  const getColumnsFor = useCallback(
    async ({ query: queryToExecute }: { query?: string } | undefined = {}) => {
      if (queryToExecute) {
        // Only abort if the query changed — re-requests for the same query
        // (e.g. from concurrent validation passes) should share the same fetch
        // rather than aborting each other, which causes "Unknown column" errors.
        if (
          columnsAbortControllerRef.current &&
          previousColumnsQueryRef.current !== queryToExecute
        ) {
          columnsAbortControllerRef.current.abort();
          if (previousColumnsQueryRef.current) {
            esqlFieldsCache.delete(previousColumnsQueryRef.current);
          }
        }

        if (
          !columnsAbortControllerRef.current ||
          previousColumnsQueryRef.current !== queryToExecute
        ) {
          const controller = new AbortController();
          columnsAbortControllerRef.current = controller;
          previousColumnsQueryRef.current = queryToExecute;
        }

        // Capture the controller before the await so the aborted check
        // refers to this request's signal, not a newer one that may have
        // replaced it on the ref during the async gap.
        const currentController = columnsAbortControllerRef.current;

        clearCacheWhenOld(esqlFieldsCache, queryToExecute);
        const timeRange = data.query.timefilter.timefilter.getTime();
        const result = await memoizedFieldsFromESQL({
          esqlQuery: queryToExecute,
          search: data.search.search,
          timeRange,
          signal: currentController.signal,
          variables: esqlService?.variablesService?.esqlVariables,
          dropNullColumns: true,
        }).result;

        // Bail out without touching the cache — cache cleanup for the aborted query
        // already happened at abort time. Deleting here would race with a fresh re-request that may
        // have repopulated the same key.
        if (currentController.signal.aborted) {
          return [];
        }

        previousColumnsQueryRef.current = undefined;

        return result || [];
      }
      return [];
    },
    [
      data.query.timefilter.timefilter,
      data.search.search,
      esqlFieldsCache,
      memoizedFieldsFromESQL,
      esqlService,
    ]
  );

  // Abort any in-flight getColumnsFor request when the editor unmounts. Without this, navigating away
  // from a long-running query leaves it polling in the browser and running on ES.
  useEffect(() => {
    return () => {
      columnsAbortControllerRef.current?.abort();
      if (previousColumnsQueryRef.current) {
        esqlFieldsCache.delete(previousColumnsQueryRef.current);
      }
    };
  }, [esqlFieldsCache]);

  const getPolicies = useCallback(async () => getEsqlPolicies(core.http), [core.http]);

  const getPreferences = useCallback(
    async () => ({
      histogramBarTarget,
    }),
    [histogramBarTarget]
  );

  const fieldsMetadataClient = useMemo(() => fieldsMetadata?.getClient(), [fieldsMetadata]);

  const getVariables = useCallback(
    () => esqlService?.variablesService?.esqlVariables,
    [esqlService]
  );

  const canSuggestVariables = useCallback(
    () => esqlService?.variablesService?.isCreateControlSuggestionEnabled ?? false,
    [esqlService]
  );

  const getTimeseriesIndicesCallback = useCallback(async () => {
    return (await getTimeseriesIndices(core.http)) || [];
  }, [core.http]);

  const getViewsCallback = useCallback(async () => {
    const views = await getViews(core.http);
    const enrichViews = esqlService?.enrichViews;
    if (!enrichViews) {
      return views;
    }
    return { ...views, views: await enrichViews(views.views) };
  }, [core.http, esqlService]);

  const getDatasetsCallback = useCallback(async () => {
    return await getDatasets(core.http);
  }, [core.http]);

  const getEditorExtensionsCallback = useCallback(
    async (queryString: string) => {
      // Only fetch recommendations if there's an active solutionId and a non-empty query
      // Otherwise the route will return an error
      if (activeSolutionId && queryString.trim() !== '') {
        return await getEditorExtensions(core.http, queryString, activeSolutionId);
      }
      return {
        recommendedQueries: [],
        recommendedFields: [],
      };
    },
    [activeSolutionId, core.http]
  );

  const getInferenceEndpointsCallback = useCallback(
    async (taskType: string) => {
      return (await getInferenceEndpoints(core.http, taskType)) || [];
    },
    [core.http]
  );

  const getLicense = useCallback(async () => {
    const ls = await esqlService?.getLicense();

    if (!ls) {
      return undefined;
    }

    return {
      ...ls,
      hasAtLeast: ls.hasAtLeast.bind(ls),
    };
  }, [esqlService]);

  const getActiveProduct = useCallback(() => core.pricing.getActiveProduct(), [core.pricing]);

  const getHistoryStarredItems = useCallback(async () => {
    clearCacheWhenOld(historyStarredItemsCache, HISTORY_STARRED_ITEMS_CACHE_KEY);
    return await memoizedHistoryStarredItems(getHistoryItems, favoritesClient).result;
  }, [historyStarredItemsCache, memoizedHistoryStarredItems, favoritesClient]);

  const isServerless = Boolean(esqlService?.isServerless);

  const canCreateLookupIndex = useCanCreateLookupIndex();
  const canSuggestResourceBrowser = useCanSuggestResourceBrowser(enableResourceBrowser);

  const getKqlSuggestions = useCallback(
    async (kqlQuery: string, cursorPositionInKql: number) => {
      const hasQuerySuggestions = kql?.autocomplete?.hasQuerySuggestions('kuery');
      if (!hasQuerySuggestions) {
        return undefined;
      }
      const dataView = await getESQLAdHocDataview({
        dataViewsService: data.dataViews,
        query: minimalQueryRef.current,
      });
      const suggestions = await kql?.autocomplete.getQuerySuggestions({
        language: 'kuery',
        query: kqlQuery,
        selectionStart: cursorPositionInKql,
        selectionEnd: cursorPositionInKql,
        indexPatterns: [dataView],
      });
      return (
        suggestions?.map((suggestion) => {
          return {
            text: suggestion.text,
            label: suggestion.text,
            detail: typeof suggestion.description === 'string' ? suggestion.description : undefined,
            kind: KQL_TYPE_TO_KIND_MAP[suggestion.type] ?? 'Value',
            range: { start: suggestion.start, end: suggestion.end },
          };
        }) ?? []
      );
    },
    [data.dataViews, kql?.autocomplete, minimalQueryRef]
  );

  return useMemo<ESQLCallbacks>(
    () => ({
      getSources,
      getColumnsFor,
      getPolicies,
      getPreferences,
      // @ts-expect-error To prevent circular type import, type defined here is partial of full client
      getFieldsMetadata: fieldsMetadataClient,
      getVariables,
      canSuggestVariables,
      getJoinIndices: getJoinIndicesCallback,
      getTimeseriesIndices: getTimeseriesIndicesCallback,
      getViews: getViewsCallback,
      getDatasets: getDatasetsCallback,
      getEditorExtensions: getEditorExtensionsCallback,
      getInferenceEndpoints: getInferenceEndpointsCallback,
      getLicense,
      getActiveProduct,
      getHistoryStarredItems,
      canCreateLookupIndex,
      isServerless,
      getKqlSuggestions,
      canSuggestResourceBrowser,
    }),
    [
      getSources,
      getColumnsFor,
      getPolicies,
      getPreferences,
      fieldsMetadataClient,
      getVariables,
      canSuggestVariables,
      getJoinIndicesCallback,
      getTimeseriesIndicesCallback,
      getViewsCallback,
      getDatasetsCallback,
      getEditorExtensionsCallback,
      getInferenceEndpointsCallback,
      getLicense,
      getActiveProduct,
      getHistoryStarredItems,
      canCreateLookupIndex,
      isServerless,
      getKqlSuggestions,
      canSuggestResourceBrowser,
    ]
  );
};
