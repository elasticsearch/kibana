/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import {
  BehaviorSubject,
  filter,
  map,
  mergeMap,
  ReplaySubject,
  share,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import type { AutoRefreshDoneFn } from '@kbn/data-plugin/public';
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import { RequestAdapter } from '@kbn/inspector-plugin/common';
import type { AggregateQuery, Query } from '@kbn/es-query';
import { isOfAggregateQueryType } from '@kbn/es-query';
import type { SearchResponseWarning } from '@kbn/search-response-warnings';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import {
  DEFAULT_COLUMNS_SETTING,
  SEARCH_ON_PAGE_LOAD_SETTING,
  getChartHidden,
  getTableHidden,
  getEsqlDataView,
} from '@kbn/discover-utils';
import { getTimeDifferenceInSeconds } from '@kbn/timerange';
import { AbortReason } from '@kbn/kibana-utils-plugin/common';
import { getESQLStatsQueryMeta } from '@kbn/esql-utils';
import { isEqual, sortBy } from 'lodash';
import type { DiscoverServices } from '../../../build_services';
import type { DiscoverSearchSessionManager } from './discover_search_session';
import { FetchStatus } from '../../types';
import { validateTimeRange } from './utils/validate_time_range';
import { fetchAll, type CommonFetchParams, fetchMoreDocuments } from '../data_fetching/fetch_all';
import { sendResetMsg } from '../hooks/use_saved_search_messages';
import { getFetch$ } from '../data_fetching/get_fetch_observable';
import { getDefaultProfileState } from './utils/default_profile_state';
import type { InternalStateStore, RuntimeStateManager, TabActionInjector, TabState } from './redux';
import { internalStateActions, selectTabRuntimeState } from './redux';
import { buildEsqlFetchSubscribe } from './utils/build_esql_fetch_subscribe';
import { createSearchSource } from './utils/create_search_source';

export interface SavedSearchData {
  main$: DataMain$;
  documents$: DataDocuments$;
  totalHits$: DataTotalHits$;
}

export type DataMain$ = BehaviorSubject<DataMainMsg>;
export type DataDocuments$ = BehaviorSubject<DataDocumentsMsg>;
export type DataTotalHits$ = BehaviorSubject<DataTotalHitsMsg>;

export type DataRefetch$ = Subject<DataRefetchMsg>;

export type DataRefetchMsg = 'reset' | 'fetch_more' | undefined;

export interface DataMsg {
  fetchStatus: FetchStatus;
  error?: Error;
  query?: AggregateQuery | Query | undefined;
}

export interface DataMainMsg extends DataMsg {
  foundDocuments?: boolean;
}

export interface DataDocumentsMsg extends DataMsg {
  result?: DataTableRecord[];
  esqlQueryColumns?: DatatableColumn[]; // columns from ES|QL request
  esqlHeaderWarning?: string;
  interceptedWarnings?: SearchResponseWarning[]; // warnings (like shard failures)
}

export interface DataTotalHitsMsg extends DataMsg {
  result?: number;
}

export interface DiscoverLatestFetchDetails {
  abortController?: AbortController;
}

export interface DiscoverDataStateContainer {
  /**
   * Implicitly starting fetching data from ES
   */
  fetch: () => void;
  /**
   * Fetch more data from ES
   */
  fetchMore: () => void;
  /**
   * Container of data observables (orchestration, data table, total hits, available fields)
   */
  data$: SavedSearchData;
  /**
   * Observable triggering fetching data from ES
   */
  refetch$: DataRefetch$;
  /**
   * Emits when the chart should be fetched
   */
  fetchChart$: Observable<DiscoverLatestFetchDetails | null>;
  /**
   * Used to disable the next fetch that would otherwise be triggered by a URL state change
   */
  disableNextFetchOnStateChange$: BehaviorSubject<boolean>;
  /**
   * Start subscribing to other observables that trigger data fetches
   */
  subscribe: () => () => void;
  /**
   * resetting all data observable to initial state
   */
  reset: () => void;

  /**
   * cancels the running queries
   */
  cancel: () => void;

  /**
   * gets active AbortController for running queries
   */
  getAbortController: () => AbortController;

  /**
   * Available Inspector Adaptor allowing to get details about recent requests to ES
   */
  inspectorAdapters: {
    requests: RequestAdapter;
    lensRequests?: RequestAdapter;
  };
  /**
   * Return the initial fetch status
   *  UNINITIALIZED: data is not fetched initially, without user triggering it
   *  LOADING: data is fetched initially (when Discover is rendered, or data views are switched)
   */
  getInitialFetchStatus: () => FetchStatus;
  /**
   * Clean up ES|QL state when saved search changes
   */
  cleanupEsql: () => void;
}

/**
 * Container responsible for fetching of data in Discover Main
 * Either by triggering requests to Elasticsearch directly, or by
 * orchestrating unified plugins / components like the histogram
 */
export function getDataStateContainer({
  services,
  searchSessionManager,
  internalState,
  runtimeStateManager,
  injectCurrentTab,
  getCurrentTab,
}: {
  services: DiscoverServices;
  searchSessionManager: DiscoverSearchSessionManager;
  internalState: InternalStateStore;
  runtimeStateManager: RuntimeStateManager;
  injectCurrentTab: TabActionInjector;
  getCurrentTab: () => TabState;
}): DiscoverDataStateContainer {
  const { data, uiSettings, toastNotifications } = services;
  const { timefilter } = data.query.timefilter;
  const inspectorAdapters = { requests: new RequestAdapter() };
  const fetchChart$ = new ReplaySubject<DiscoverLatestFetchDetails | null>(1);
  const disableNextFetchOnStateChange$ = new BehaviorSubject(false);
  let numberOfFetches = 0;
  let unsubscribeIsRequested = false;

  /**
   * The observable to trigger data fetching in UI
   * By refetch$.next('reset') rows and fieldcounts are reset to allow e.g. editing of runtime fields
   * to be processed correctly
   */
  const refetch$ = new Subject<DataRefetchMsg>();
  const getInitialFetchStatus = () => {
    const shouldSearchOnPageLoad =
      uiSettings.get<boolean>(SEARCH_ON_PAGE_LOAD_SETTING) ||
      internalState.getState().persistedDiscoverSession?.id !== undefined ||
      !timefilter.getRefreshInterval().pause ||
      searchSessionManager.hasSearchSessionIdInURL();
    return shouldSearchOnPageLoad ? FetchStatus.LOADING : FetchStatus.UNINITIALIZED;
  };

  // Reset fetchChart$ to avoid emitting stale values when re-mounting useDiscoverHistogram
  const resetFetchChart$ = () => {
    fetchChart$.next(null);
  };

  /**
   * Allows skipping any fetches that would occur from state updates in the callback
   */
  const withSkipNextFetch = async (callback: () => Promise<void>) => {
    disableNextFetchOnStateChange$.next(true);
    await callback();
    disableNextFetchOnStateChange$.next(false);
  };

  /**
   * The observables the UI (aka React component) subscribes to get notified about
   * the changes in the data fetching process (high level: fetching started, data was received)
   */
  const initialState = { fetchStatus: getInitialFetchStatus() };
  const dataSubjects: SavedSearchData = {
    main$: new BehaviorSubject<DataMainMsg>(initialState),
    documents$: new BehaviorSubject<DataDocumentsMsg>(initialState),
    totalHits$: new BehaviorSubject<DataTotalHitsMsg>(initialState),
  };

  // This is debugging code, helping you to understand which messages are sent to the data observables
  // Adding a debugger in the functions can be helpful to understand what triggers a message
  // dataSubjects.main$.subscribe((msg) => addLog('dataSubjects.main$', msg));
  // dataSubjects.documents$.subscribe((msg) => addLog('dataSubjects.documents$', msg));
  // dataSubjects.totalHits$.subscribe((msg) => addLog('dataSubjects.totalHits$', msg););
  // Add window.ELASTIC_DISCOVER_LOGGER = 'debug' to see messages in console

  /**
   * Subscribes to ES|QL fetches to handle state changes when loading or before a fetch completes
   */
  const { esqlFetchSubscribe, cleanupEsql } = buildEsqlFetchSubscribe({
    internalState,
    dataSubjects,
    getCurrentTab,
    injectCurrentTab,
  });

  // The main subscription to handle state changes
  dataSubjects.documents$.pipe(switchMap(esqlFetchSubscribe)).subscribe();
  // ES|QL state cleanup is handled by Redux listener middleware (resetOnSavedSearchChange action)

  /**
   * handler emitted by `timefilter.getAutoRefreshFetch$()`
   * to notify when data completed loading and to start a new autorefresh loop
   */
  let autoRefreshDone: AutoRefreshDoneFn | undefined | null = null;
  const setAutoRefreshDone = (fn: AutoRefreshDoneFn | undefined) => {
    autoRefreshDone = fn;
  };

  const fetch$ = getFetch$({
    setAutoRefreshDone,
    data,
    main$: dataSubjects.main$,
    refetch$,
    searchSessionManager,
  }).pipe(
    filter(() => validateTimeRange(timefilter.getTime(), toastNotifications)),
    tap(() => inspectorAdapters.requests.reset()),
    map((val) => ({
      options: {
        reset: val === 'reset',
        fetchMore: val === 'fetch_more',
      },
    })),
    share()
  );
  let abortController: AbortController;
  let abortControllerFetchMore: AbortController;

  function subscribe() {
    const subscription = fetch$
      .pipe(
        mergeMap(async ({ options }) => {
          numberOfFetches += 1;
          if (unsubscribeIsRequested) {
            unsubscribeIsRequested = false;
            subscription.unsubscribe();
          }

          const tabState = getCurrentTab();
          const {
            id: currentTabId,
            defaultProfileState,
            dataRequestParams,
            appState,
            globalState,
          } = tabState;
          const { scopedProfilesManager$, scopedEbtManager$, currentDataView$ } =
            selectTabRuntimeState(runtimeStateManager, currentTabId);
          const scopedProfilesManager = scopedProfilesManager$.getValue();
          const scopedEbtManager = scopedEbtManager$.getValue();

          let searchSessionId: string;
          let isSearchSessionRestored: boolean;

          if (options.fetchMore && dataRequestParams.searchSessionId) {
            searchSessionId = dataRequestParams.searchSessionId;
            isSearchSessionRestored = dataRequestParams.isSearchSessionRestored;
          } else {
            ({ searchSessionId, isSearchSessionRestored } =
              searchSessionManager.getNextSearchSessionId());
          }

          const searchSource = createSearchSource({
            dataView: currentDataView$.getValue(),
            appState,
            globalState,
            services,
          });

          const commonFetchParams: Omit<CommonFetchParams, 'abortController'> = {
            dataSubjects,
            initialFetchStatus: getInitialFetchStatus(),
            inspectorAdapters,
            searchSessionId,
            services,
            internalState,
            searchSource,
            scopedProfilesManager,
            scopedEbtManager,
            getCurrentTab,
          };

          cancel(AbortReason.REPLACED);

          if (options.fetchMore) {
            abortControllerFetchMore = new AbortController();
            const fetchMoreTracker =
              scopedEbtManager.trackQueryPerformanceEvent('discoverFetchMore');

            // Calculate query range in seconds
            const timeRange = timefilter.getAbsoluteTime();
            const queryRangeSeconds = getTimeDifferenceInSeconds(timeRange);

            await fetchMoreDocuments({
              ...commonFetchParams,
              abortController: abortControllerFetchMore,
            });

            fetchMoreTracker.reportEvent({
              queryRangeSeconds,
              requests: inspectorAdapters.requests?.getRequestsSince(fetchMoreTracker.startTime),
            });

            return;
          }

          internalState.dispatch(
            injectCurrentTab(internalStateActions.setDataRequestParams)({
              dataRequestParams: {
                timeRangeAbsolute: timefilter.getAbsoluteTime(),
                timeRangeRelative: timefilter.getTime(),
                searchSessionId,
                isSearchSessionRestored,
              },
            })
          );

          internalState.dispatch(
            injectCurrentTab(internalStateActions.setCascadedDocumentsState)({
              cascadedDocumentsState: {
                ...getCurrentTab().cascadedDocumentsState,
                columnsMeta: {},
                cascadedDocumentsMap: {},
              },
            })
          );

          const { didProfileChange, isFirstResolution } =
            await scopedProfilesManager.resolveDataSourceProfile(
              {
                dataSource: getCurrentTab().appState.dataSource,
                dataView: currentDataView$.getValue(),
                query: getCurrentTab().appState.query,
              },
              resetFetchChart$
            );

          let shouldApplyDefaultProfileState = true;
          let appliedDefaultProfileState = defaultProfileState;

          // If the data source profile changed, we may need to restore previous profile state
          if (didProfileChange) {
            const profileId = scopedProfilesManager.getContexts().dataSourceContext.profileId;
            const profileStateSnapshot =
              getCurrentTab().defaultProfileState.snapshotsByProfileId[profileId];
            const hasProfileStateSnapshot =
              profileStateSnapshot && Object.keys(profileStateSnapshot).length > 0;

            // Only apply the default profile state if we have no profile state to restore
            shouldApplyDefaultProfileState = !hasProfileStateSnapshot;

            if (hasProfileStateSnapshot) {
              await withSkipNextFetch(() =>
                internalState.dispatch(
                  injectCurrentTab(internalStateActions.updateAppStateAndReplaceUrl)({
                    appState: profileStateSnapshot,
                  })
                )
              );
            } else {
              // If it's not the first profile resolution (i.e. page load or tab init),
              // and there's no profile state to restore, fall back to shared layout state
              // and ensure any applicable default profile state gets applied
              if (!isFirstResolution) {
                await withSkipNextFetch(async () =>
                  internalState.dispatch(
                    injectCurrentTab(internalStateActions.setAppState)({
                      appState: {
                        ...getCurrentTab().appState,
                        hideChart: getChartHidden(services.storage, 'discover'),
                        hideTable: getTableHidden(services.storage, 'discover'),
                      },
                      isSystemTriggered: true,
                    })
                  )
                );

                appliedDefaultProfileState = { ...defaultProfileState, fieldsToReset: 'all' };
              }

              // If there is no profile state yet, sync a snapshot of the current
              // state so it can be restored when switching back to this profile
              internalState.dispatch(
                injectCurrentTab(internalStateActions.syncProfileStateSnapshot)({})
              );
            }
          }

          const dataView = currentDataView$.getValue();
          const resolvedDefaultProfileState =
            shouldApplyDefaultProfileState && dataView
              ? getDefaultProfileState({
                  scopedProfilesManager,
                  defaultProfileState: appliedDefaultProfileState,
                  dataView,
                })
              : undefined;
          const preFetchStateUpdate = resolvedDefaultProfileState?.getPreFetchState();

          if (preFetchStateUpdate) {
            await withSkipNextFetch(() =>
              internalState.dispatch(
                injectCurrentTab(internalStateActions.updateAppStateAndReplaceUrl)({
                  appState: preFetchStateUpdate,
                })
              )
            );
          }

          abortController = new AbortController();

          const query = getCurrentTab().appState.query;
          const isEsqlQuery = isOfAggregateQueryType(query);
          const latestFetchDetails: DiscoverLatestFetchDetails = {
            abortController,
          };

          // Trigger chart fetching after the pre fetch state has been updated
          // to ensure state values that would affect data fetching are set
          if (!isEsqlQuery) {
            // trigger in parallel with the main request for Classic mode
            fetchChart$.next(latestFetchDetails);
          }

          const prevAutoRefreshDone = autoRefreshDone;
          const fetchAllTracker = scopedEbtManager.trackQueryPerformanceEvent('discoverFetchAll');

          // Calculate query range in seconds
          const timeRange = timefilter.getAbsoluteTime();
          const queryRangeSeconds = getTimeDifferenceInSeconds(timeRange);

          await fetchAll({
            ...commonFetchParams,
            reset: options.reset,
            abortController,
            onFetchRecordsComplete: async () => {
              if (isEsqlQuery && !abortController.signal.aborted) {
                // defer triggering chart fetching until after main request completes for ES|QL mode
                fetchChart$.next(latestFetchDetails);
              }

              // Update cascaded documents state based on the fetched query,
              // defaulting to the first available group whenever the available groups change
              if (isEsqlQuery && services.discoverFeatureFlags.getCascadeLayoutEnabled()) {
                const { availableCascadeGroups, selectedCascadeGroups } =
                  getCurrentTab().cascadedDocumentsState;

                const newAvailableGroups = getESQLStatsQueryMeta(query.esql).groupByFields.map(
                  (group) => group.field
                );

                const haveAvilableGroupsChanged = !isEqual(
                  sortBy(availableCascadeGroups),
                  sortBy(newAvailableGroups)
                );

                const newSelectedGroups = haveAvilableGroupsChanged
                  ? newAvailableGroups.length > 0
                    ? [newAvailableGroups[0]]
                    : []
                  : selectedCascadeGroups;

                internalState.dispatch(
                  injectCurrentTab(internalStateActions.setCascadedDocumentsState)({
                    cascadedDocumentsState: {
                      ...getCurrentTab().cascadedDocumentsState,
                      availableCascadeGroups: newAvailableGroups,
                      selectedCascadeGroups: newSelectedGroups,
                    },
                  })
                );
              } else {
                internalState.dispatch(
                  injectCurrentTab(internalStateActions.setCascadedDocumentsState)({
                    cascadedDocumentsState: {
                      ...getCurrentTab().cascadedDocumentsState,
                      availableCascadeGroups: [],
                      selectedCascadeGroups: [],
                    },
                  })
                );
              }

              const { defaultProfileState: currentDefaultProfileState } = getCurrentTab();

              if (currentDefaultProfileState.resetId !== defaultProfileState.resetId) {
                return;
              }

              const { esqlQueryColumns } = dataSubjects.documents$.getValue();
              const defaultColumns = uiSettings.get<string[]>(DEFAULT_COLUMNS_SETTING, []);
              const postFetchStateUpdate = resolvedDefaultProfileState?.getPostFetchState({
                defaultColumns,
                esqlQueryColumns,
              });

              if (postFetchStateUpdate) {
                await internalState.dispatch(
                  injectCurrentTab(internalStateActions.updateAppStateAndReplaceUrl)({
                    appState: postFetchStateUpdate,
                  })
                );
              }

              // Clear the profile state field-reset flags after data fetching
              // is done so refetches don't reset the state again
              internalState.dispatch(
                injectCurrentTab(internalStateActions.setProfileStateFieldsToReset)({
                  fieldsToReset: 'none',
                })
              );
            },
          });

          fetchAllTracker.reportEvent({
            queryRangeSeconds,
            requests: inspectorAdapters.requests?.getRequestsSince(fetchAllTracker.startTime),
          });

          // If the autoRefreshCallback is still the same as when we started i.e. there was no newer call
          // replacing this current one, call it to make sure we tell that the auto refresh is done
          // and a new one can be scheduled. null is checked to always start initial looping.
          if (autoRefreshDone === prevAutoRefreshDone || prevAutoRefreshDone === null) {
            // if this function was set and is executed, another refresh fetch can be triggered
            autoRefreshDone?.();
            autoRefreshDone = undefined;
          }
        })
      )
      .subscribe();

    return () => {
      if (numberOfFetches > 0) {
        subscription.unsubscribe();
      } else {
        // to let the initial fetch to execute properly before unsubscribing
        unsubscribeIsRequested = true;
      }
    };
  }

  const fetchQuery = async () => {
    const query = getCurrentTab().appState.query;
    const { currentDataView$ } = selectTabRuntimeState(runtimeStateManager, getCurrentTab().id);
    const currentDataView = currentDataView$.getValue();

    if (isOfAggregateQueryType(query)) {
      const nextDataView = await getEsqlDataView(query, currentDataView, services);
      if (nextDataView !== currentDataView) {
        internalState.dispatch(
          injectCurrentTab(internalStateActions.assignNextDataView)({ dataView: nextDataView })
        );
      }
    }

    refetch$.next(undefined);

    return refetch$;
  };

  const fetchMore = () => {
    refetch$.next('fetch_more');
    return refetch$;
  };

  const reset = () => {
    sendResetMsg(dataSubjects, getInitialFetchStatus());
  };

  const cancel = (reason: AbortReason = AbortReason.CANCELED) => {
    const { cascadedDocumentsFetcher$ } = selectTabRuntimeState(
      runtimeStateManager,
      getCurrentTab().id
    );

    cascadedDocumentsFetcher$.getValue().cancelAllFetches();
    abortController?.abort(reason);
    abortControllerFetchMore?.abort(reason);
  };

  const getAbortController = () => {
    return abortController;
  };

  return {
    fetch: fetchQuery,
    fetchMore,
    data$: dataSubjects,
    refetch$,
    fetchChart$,
    disableNextFetchOnStateChange$,
    subscribe,
    reset,
    inspectorAdapters,
    getInitialFetchStatus,
    cancel,
    getAbortController,
    cleanupEsql,
  };
}
