/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Adapters } from '@kbn/inspector-plugin/common';
import type { SortOrder } from '@kbn/saved-search-plugin/public';
import type { ISearchSource } from '@kbn/data-plugin/common';
import type { BehaviorSubject } from 'rxjs';
import { combineLatest, distinctUntilChanged, filter, firstValueFrom, race, switchMap } from 'rxjs';
import { isOfAggregateQueryType } from '@kbn/es-query';
import { getTimeDifferenceInSeconds } from '@kbn/timerange';
import { updateVolatileSearchSource } from './update_search_source';
import {
  checkHitCount,
  sendCompleteMsg,
  sendErrorMsg,
  sendErrorTo,
  sendLoadingMsg,
  sendLoadingMoreMsg,
  sendLoadingMoreFinishedMsg,
  sendResetMsg,
} from '../hooks/use_saved_search_messages';
import { fetchDocuments } from './fetch_documents';
import { FetchStatus } from '../../types';
import type {
  DataMain$,
  DataMsg,
  SavedSearchData,
} from '../state_management/discover_data_state_container';
import type { DiscoverServices } from '../../../build_services';
import { fetchEsql } from './fetch_esql';
import type { InternalStateStore, TabState } from '../state_management/redux';
import type { ScopedProfilesManager } from '../../../context_awareness';
import type { ScopedDiscoverEBTManager } from '../../../ebt_manager';

export interface CommonFetchParams {
  dataSubjects: SavedSearchData;
  abortController: AbortController;
  internalState: InternalStateStore;
  initialFetchStatus: FetchStatus;
  inspectorAdapters: Adapters;
  searchSource: ISearchSource;
  searchSessionId: string;
  services: DiscoverServices;
  scopedProfilesManager: ScopedProfilesManager;
  scopedEbtManager: ScopedDiscoverEBTManager;
  getCurrentTab: () => TabState;
}

/**
 * This function starts fetching all required queries in Discover. This will be the query to load the individual
 * documents as well as any other requests that might be required to load the main view.
 *
 * This method returns a promise, which will resolve (without a value), as soon as all queries that have been started
 * have been completed (failed or successfully).
 */
export function fetchAll(
  params: CommonFetchParams & {
    reset: boolean;
    onFetchRecordsComplete?: () => Promise<void>;
  }
): Promise<void> {
  const {
    dataSubjects,
    reset = false,
    initialFetchStatus,
    services,
    scopedProfilesManager,
    scopedEbtManager,
    inspectorAdapters,
    searchSource: originalSearchSource,
    abortController,
    getCurrentTab,
    onFetchRecordsComplete,
  } = params;
  const { data, expressions } = services;

  try {
    const searchSource = originalSearchSource.createChild();
    const dataView = searchSource.getField('index')!;
    const { query, sort } = getCurrentTab().appState;
    const isEsqlQuery = isOfAggregateQueryType(query);
    const currentTab = getCurrentTab();

    if (reset) {
      sendResetMsg(dataSubjects, initialFetchStatus);
    }

    if (!isEsqlQuery) {
      // Update the base searchSource, base for all child fetches
      updateVolatileSearchSource(searchSource, {
        dataView,
        services,
        sort: sort as SortOrder[],
        inputTimeRange: currentTab.dataRequestParams.timeRangeAbsolute,
      });
    }

    // Mark all subjects as loading
    sendLoadingMsg(dataSubjects.main$);
    sendLoadingMsg(dataSubjects.documents$, { query });
    sendLoadingMsg(dataSubjects.totalHits$, {
      result: dataSubjects.totalHits$.getValue().result,
    });

    // Start fetching all required requests
    const response = isEsqlQuery
      ? fetchEsql({
          query,
          dataView,
          abortSignal: abortController.signal,
          inspectorAdapters,
          data,
          expressions,
          scopedProfilesManager,
          timeRange: currentTab.dataRequestParams.timeRangeAbsolute,
          esqlVariables: currentTab.esqlVariables,
          searchSessionId: params.searchSessionId,
          useApproximation: currentTab.appState.useApproximation,
        })
      : fetchDocuments(searchSource, params);
    const fetchType = isEsqlQuery ? 'fetchTextBased' : 'fetchDocuments';

    const fetchAllRequestOnlyTracker = scopedEbtManager.trackQueryPerformanceEvent(
      'discoverFetchAllRequestsOnly'
    );

    // Calculate query range in seconds
    const queryRangeSeconds = currentTab.dataRequestParams.timeRangeAbsolute
      ? getTimeDifferenceInSeconds(currentTab.dataRequestParams.timeRangeAbsolute)
      : 0;

    // Handle results of the individual queries and forward the results to the corresponding dataSubjects
    response
      .then(({ records, esqlQueryColumns, interceptedWarnings = [], esqlHeaderWarning }) => {
        fetchAllRequestOnlyTracker.reportEvent(
          {
            queryRangeSeconds,
            requests: params.inspectorAdapters.requests?.getRequestsSince(
              fetchAllRequestOnlyTracker.startTime
            ),
          },
          {
            meta: {
              fetchType,
            },
          }
        );

        if (isEsqlQuery) {
          const fetchStatus =
            interceptedWarnings.filter(({ type }) => type === 'incomplete').length > 0
              ? FetchStatus.ERROR
              : FetchStatus.COMPLETE;
          dataSubjects.totalHits$.next({
            fetchStatus,
            result: records.length,
          });
        } else {
          const currentTotalHits = dataSubjects.totalHits$.getValue();
          // If the total hits (or chart) query is still loading, emit a partial
          // hit count that's at least our retrieved document count
          if (currentTotalHits.fetchStatus === FetchStatus.LOADING && !currentTotalHits.result) {
            // trigger `partial` only for the first request (if no total hits value yet)
            dataSubjects.totalHits$.next({
              fetchStatus: FetchStatus.PARTIAL,
              result: records.length,
            });
          }
        }

        /**
         * Determine the appropriate fetch status
         *
         * The partial state for ES|QL mode is necessary to limit data table renders.
         * Depending on the type of query new columns can be added to AppState to ensure the data table
         * shows the updated columns. The partial state was introduced to prevent
         * too frequent state changes that cause the table to re-render too often, which can cause
         * race conditions, poor user experience, and potential test flakiness.
         *
         * For non-ES|QL queries, we always use COMPLETE status as they don't require this
         * special handling.
         */
        const fetchStatus = isEsqlQuery ? FetchStatus.PARTIAL : FetchStatus.COMPLETE;

        dataSubjects.documents$.next({
          fetchStatus,
          result: records,
          esqlQueryColumns,
          esqlHeaderWarning,
          interceptedWarnings,
          query,
        });

        checkHitCount(dataSubjects.main$, records.length);
      })
      // In the case that the request was aborted (e.g. a refresh), swallow the abort error
      .catch((e) => {
        if (!abortController.signal.aborted) throw e;
      })
      // Only the document query should send its errors to main$, to cause the full Discover app
      // to get into an error state. The other queries will not cause all of Discover to error out
      // but their errors will be shown in-place (e.g. of the chart).
      .catch((e) => {
        sendErrorMsg(dataSubjects.documents$, e, { query });
        sendErrorMsg(dataSubjects.main$, e);
      });

    // Return a promise that will resolve once all the requests have finished or failed, or no results are found
    return firstValueFrom(
      race(
        combineLatest([
          isComplete(dataSubjects.documents$).pipe(
            switchMap(async () => onFetchRecordsComplete?.())
          ),
          isComplete(dataSubjects.totalHits$),
        ]),
        noResultsFound(dataSubjects.main$)
      )
    ).then(() => {
      // Send a complete message to main$ once all queries are done and if main$
      // is not already in an ERROR state, e.g. because the document query has failed.
      // This will only complete main$, if it hasn't already been completed previously
      // by a query finding no results.
      if (dataSubjects.main$.getValue().fetchStatus !== FetchStatus.ERROR) {
        sendCompleteMsg(dataSubjects.main$);
      }
    });
  } catch (error) {
    sendErrorMsg(dataSubjects.main$, error);
    // We also want to return a resolved promise in an error case, since it just indicates we're done with querying.
    return Promise.resolve();
  }
}

export async function fetchMoreDocuments(params: CommonFetchParams): Promise<void> {
  const { dataSubjects, services, searchSource: originalSearchSource, getCurrentTab } = params;

  try {
    const searchSource = originalSearchSource.createChild();
    const dataView = searchSource.getField('index')!;
    const { query, sort } = getCurrentTab().appState;
    const isEsqlQuery = isOfAggregateQueryType(query);

    if (isEsqlQuery) {
      // not supported yet
      return;
    }

    const lastDocuments = dataSubjects.documents$.getValue().result || [];
    const lastDocumentSort = lastDocuments[lastDocuments.length - 1]?.raw?.sort;

    if (!lastDocumentSort) {
      return;
    }

    searchSource.setField('searchAfter', lastDocumentSort);

    // Mark as loading
    sendLoadingMoreMsg(dataSubjects.documents$);

    // Update the searchSource
    updateVolatileSearchSource(searchSource, {
      dataView,
      services,
      sort: sort as SortOrder[],
    });

    // Fetch more documents
    const { records, interceptedWarnings } = await fetchDocuments(searchSource, params);

    // Update the state and finish the loading state
    sendLoadingMoreFinishedMsg(dataSubjects.documents$, {
      moreRecords: records,
      interceptedWarnings,
    });
  } catch (error) {
    sendLoadingMoreFinishedMsg(dataSubjects.documents$, {
      moreRecords: [],
      interceptedWarnings: undefined,
    });
    sendErrorTo(dataSubjects.main$)(error);
  }
}

const isComplete = <T extends DataMsg>(subject: BehaviorSubject<T>) => {
  return subject.pipe(
    filter(({ fetchStatus }) => [FetchStatus.COMPLETE, FetchStatus.ERROR].includes(fetchStatus)),
    distinctUntilChanged((a, b) => a.fetchStatus === b.fetchStatus)
  );
};

const noResultsFound = (subject: DataMain$) => {
  return subject.pipe(
    filter(
      ({ fetchStatus, foundDocuments }) => fetchStatus === FetchStatus.COMPLETE && !foundDocuments
    ),
    distinctUntilChanged(
      (a, b) => a.fetchStatus === b.fetchStatus && a.foundDocuments === b.foundDocuments
    )
  );
};
