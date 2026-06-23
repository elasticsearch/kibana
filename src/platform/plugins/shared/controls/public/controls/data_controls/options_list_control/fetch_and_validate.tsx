/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { BehaviorSubject, Observable } from 'rxjs';
import { combineLatest, debounceTime, startWith, switchMap, tap, withLatestFrom } from 'rxjs';

import { fetch$, type PublishingSubject } from '@kbn/presentation-publishing';
import type {
  OptionsListSearchTechnique,
  OptionsListSelection,
  OptionsListSortingType,
} from '@kbn/controls-schemas';
import { ControlValuesSource, DEFAULT_DSL_OPTIONS_LIST_STATE } from '@kbn/controls-constants';

import type {
  OptionsListFailureResponse,
  OptionsListSuccessResponse,
} from '../../../../common/options_list/types';
import { buildOptionsListFetchBody } from './build_options_list_fetch_body';
import { OptionsListFetchCache } from './options_list_fetch_cache';
import type { DSLOptionsListComponentApi, OptionsListControlApi } from './types';
import type { DataControlStateManager } from '../data_control_manager';

export function fetchAndValidate$({
  api,
  requestSize$,
  runPastTimeout$,
  selectedOptions$,
  searchTechnique$,
  sort$,
}: {
  api: DataControlStateManager['api'] &
    Pick<OptionsListControlApi, 'parentApi' | 'uuid'> &
    Pick<DSLOptionsListComponentApi, 'loadMoreSubject'> & {
      loadingSuggestions$: BehaviorSubject<boolean>;
      debouncedSearchString: Observable<string>;
    };
  requestSize$: PublishingSubject<number>;
  runPastTimeout$: PublishingSubject<boolean | undefined>;
  selectedOptions$: PublishingSubject<OptionsListSelection[] | undefined>;
  searchTechnique$: PublishingSubject<OptionsListSearchTechnique | undefined>;
  sort$: PublishingSubject<OptionsListSortingType | undefined>;
}): Observable<OptionsListSuccessResponse | { error: Error }> {
  const requestCache = new OptionsListFetchCache();
  let abortController: AbortController | undefined;

  return combineLatest({
    dataViews: api.dataViews$,
    field: api.field$,
    esqlQuery: api.esqlQuery$,
    valuesSource: api.valuesSource$,
    fetchContext: fetch$(api),
    useGlobalFilters: api.useGlobalFilters$,
    searchString: api.debouncedSearchString,
    ignoreValidations: api.ignoreValidations$,
    sort: sort$,
    searchTechnique: searchTechnique$,
    // cannot use requestSize directly, because we need to be able to reset the size to the default without refetching
    loadMore: api.loadMoreSubject.pipe(
      startWith(null), // start with null so that `combineLatest` subscription fires
      debounceTime(100) // debounce load more so "loading" state briefly shows
    ),
  }).pipe(
    tap(() => {
      // abort any in progress requests
      if (abortController) {
        abortController.abort();
        abortController = undefined;
      }
    }),
    withLatestFrom(requestSize$, runPastTimeout$, selectedOptions$),
    switchMap(
      async ([
        {
          dataViews,
          field,
          fetchContext,
          useGlobalFilters,
          ignoreValidations,
          searchString,
          sort,
          searchTechnique,
          esqlQuery,
          valuesSource,
        },
        requestSize,
        runPastTimeout,
        selectedOptions,
      ]) => {
        let built: ReturnType<typeof buildOptionsListFetchBody>;
        try {
          built = buildOptionsListFetchBody({
            valuesSource: valuesSource ?? ControlValuesSource.FIELD,
            esqlQuery,
            dataViews,
            field,
            fetchContext,
            useGlobalFilters,
            searchString,
            sort: sort ?? DEFAULT_DSL_OPTIONS_LIST_STATE.sort,
            searchTechnique: searchTechnique ?? DEFAULT_DSL_OPTIONS_LIST_STATE.search_technique,
            requestSize,
            runPastTimeout: runPastTimeout ?? false,
            selectedOptions: selectedOptions ?? [],
            ignoreValidations,
          });
        } catch (error) {
          return { error };
        }

        if (built.outcome === 'empty') {
          const emptyResponse = built.response;
          if ('totalCardinality' in emptyResponse) {
            return emptyResponse;
          }
          return { suggestions: emptyResponse.suggestions, totalCardinality: 0 };
        }

        if (built.showLoadingSuggestions) {
          api.loadingSuggestions$.next(true);
        }

        /** Fetch the suggestions list + perform validation */
        const newAbortController = new AbortController();
        abortController = newAbortController;
        try {
          const result = await requestCache.runFetchRequest(built.body, newAbortController.signal);
          if ('error' in result) {
            const err = (result as OptionsListFailureResponse).error;
            return { error: err === 'aborted' ? new Error('Request aborted') : err };
          }
          return result;
        } catch (error) {
          return { error };
        }
      }
    ),
    tap(() => {
      api.loadingSuggestions$.next(false);
    })
  );
}
