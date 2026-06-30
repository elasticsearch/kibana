/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { combineLatest, merge, skip, startWith } from 'rxjs';
import {
  connectToQueryState,
  noSearchSessionStorageCapabilityMessage,
} from '@kbn/data-plugin/public';
import { syncState } from '@kbn/kibana-utils-plugin/public';
import { FilterStateStore, isOfAggregateQueryType } from '@kbn/es-query';
import type { TabActionPayload, InternalStateThunkActionCreator } from '../internal_state';
import { selectTab, selectTabAppState } from '../selectors';
import { selectTabRuntimeState } from '../runtime_state';
import { addLog } from '../../../../../utils/add_log';
import { internalStateActions } from '..';
import { type DiscoverAppState } from '../types';
import { APP_STATE_URL_KEY, GLOBAL_STATE_URL_KEY } from '../../../../../../common/constants';
import { getCurrentUrlState } from '../../utils/cleanup_url_state';
import { buildStateSubscribe } from '../../utils/build_state_subscribe';
import { createUrlSyncObservables } from '../../utils/create_url_sync_observables';
import { createTabPersistableStateObservable } from '../../utils/create_tab_persistable_state_observable';
import { createSearchSessionRestorationDataProvider } from '../../utils/create_search_session_restoration_data_provider';
import { getFieldsToReset } from '../../utils/default_profile_state';
import {
  createDataViewDataSource,
  DataSourceType,
  isDataSourceType,
} from '../../../../../../common/data_sources';

/**
 * Initializing state containers and start subscribing to changes triggering e.g. data fetching
 */
export const initializeAndSync: InternalStateThunkActionCreator<[TabActionPayload]> = ({ tabId }) =>
  function initializeAndSyncThunkFn(
    dispatch,
    getState,
    { services, runtimeStateManager, urlStateStorage, getInternalState$ }
  ) {
    const tabRuntimeState = selectTabRuntimeState(runtimeStateManager, tabId);
    const dataStateContainer = tabRuntimeState.dataStateContainer$.getValue();

    if (!dataStateContainer) {
      throw new Error(`Data state container is not initialized for tab [${tabId}]`);
    }

    dispatch(stopSyncing({ tabId }));
    const { appState$, createAppStateContainer, globalStateContainer } = createUrlSyncObservables({
      tabId,
      dispatch,
      getState,
      internalState$: getInternalState$(),
    });

    const getCurrentTab = () => selectTab(getState(), tabId);
    const getAppState = (): DiscoverAppState => {
      return selectTabAppState(getState(), tabId);
    };

    const initializeUrlTracking = () => {
      const { currentDataView$ } = selectTabRuntimeState(runtimeStateManager, tabId);

      const subscription = combineLatest([
        currentDataView$,
        appState$.pipe(startWith(getAppState())),
      ]).subscribe(([dataView, appState]) => {
        if (!dataView?.id) {
          return;
        }

        const dataViewSupportsTracking =
          // Disable for ad hoc data views, since they can't be restored after a page refresh
          dataView.isPersisted() ||
          // Unless it's a default profile data view, which can be restored on refresh
          getState().defaultProfileAdHocDataViewIds.includes(dataView.id) ||
          // Or we're in ES|QL mode, in which case we don't care about the data view
          isOfAggregateQueryType(appState.query);

        const { persistedDiscoverSession } = getState();
        const trackingEnabled = dataViewSupportsTracking || Boolean(persistedDiscoverSession?.id);

        services.urlTracker.setTrackingEnabled(trackingEnabled);
      });

      return () => {
        subscription.unsubscribe();
      };
    };

    const initializeAndSyncUrlState = () => {
      const { persistedDiscoverSession } = getState();
      const hasPersistedTab = Boolean(
        persistedDiscoverSession?.tabs.some((tab) => tab.id === tabId)
      );

      addLog('[tab_sync] initialize state and sync with URL', { persistedDiscoverSession });

      const { breakdownField, columns, rowHeight, hideChart, hideTable, hideSidebar } =
        getCurrentUrlState(urlStateStorage, services);

      // Only reset profile defaults that are not already set in the URL.
      // Persisted tabs own their saved state, so only non-persisted fields can be reset.
      dispatch(
        internalStateActions.setProfileStateFieldsToReset({
          tabId,
          fieldsToReset: getFieldsToReset({
            columns: columns === undefined && !hasPersistedTab,
            rowHeight: rowHeight === undefined && !hasPersistedTab,
            breakdownField: breakdownField === undefined && !hasPersistedTab,
            hideChart: hideChart === undefined && !hasPersistedTab,
            hideTable: hideTable === undefined && !hasPersistedTab,
            hideSidebar: hideSidebar === undefined,
          }),
        })
      );

      const { data } = services;
      const { currentDataView$ } = selectTabRuntimeState(runtimeStateManager, tabId);
      const currentDataView = currentDataView$.getValue();
      const appState = getAppState();
      const setDataViewFromSavedSearch =
        !appState.dataSource ||
        (isDataSourceType(appState.dataSource, DataSourceType.DataView) &&
          appState.dataSource.dataViewId !== currentDataView?.id);

      if (setDataViewFromSavedSearch) {
        // used data view is different from the given by url/state which is invalid
        dispatch(
          internalStateActions.updateAppState({
            tabId,
            appState: {
              dataSource: currentDataView?.id
                ? createDataViewDataSource({ dataViewId: currentDataView.id })
                : undefined,
            },
          })
        );
      }

      // syncs `_a` portion of url with query services
      const stopSyncingQueryAppStateWithStateContainer = connectToQueryState(
        data.query,
        createAppStateContainer(false),
        {
          filters: FilterStateStore.APP_STATE,
          query: true,
        }
      );

      const { start: startSyncingAppStateWithUrl, stop: stopSyncingAppStateWithUrl } = syncState({
        storageKey: APP_STATE_URL_KEY,
        stateContainer: createAppStateContainer(true),
        stateStorage: urlStateStorage,
      });

      // syncs `_g` portion of url with query services
      const stopSyncingQueryGlobalStateWithStateContainer = connectToQueryState(
        data.query,
        globalStateContainer,
        {
          refreshInterval: true,
          time: true,
          filters: FilterStateStore.GLOBAL_STATE,
        }
      );

      // Subscribe to CPS projectRouting changes (global subscription affects all tabs)
      // When projectRouting changes, mark non-active tabs for refetch and trigger data fetch
      const cpsProjectRoutingSubscription = services.cps?.cpsManager
        ?.getProjectRouting$()
        .pipe(skip(1)) // It's a BehaviorSubject, so skip the initial emit to avoid extra fetch
        .subscribe(() => {
          dispatch(internalStateActions.markNonActiveTabsForRefetch());
          addLog('[tab_sync] projectRouting changes triggers data fetching');
          dispatch(internalStateActions.fetchData({ tabId }));
        });

      const { start: startSyncingGlobalStateWithUrl, stop: stopSyncingGlobalStateWithUrl } =
        syncState({
          storageKey: GLOBAL_STATE_URL_KEY,
          stateContainer: globalStateContainer,
          stateStorage: urlStateStorage,
        });

      // current state needs to be pushed to url
      dispatch(internalStateActions.pushCurrentTabStateToUrl({ tabId })).then(() => {
        startSyncingAppStateWithUrl();
        startSyncingGlobalStateWithUrl();
      });

      return () => {
        stopSyncingQueryAppStateWithStateContainer();
        stopSyncingQueryGlobalStateWithStateContainer();
        stopSyncingAppStateWithUrl();
        stopSyncingGlobalStateWithUrl();
        cpsProjectRoutingSubscription?.unsubscribe();
      };
    };

    // Enable/disable kbn url tracking (That's the URL used when selecting Discover in the side menu)
    const unsubscribeUrlTracking = initializeUrlTracking();

    // initialize syncing with _g and _a part of the URL
    const unsubscribeUrlState = initializeAndSyncUrlState();

    // subscribing to app state changes, triggering data fetching
    const appStateSubscription = appState$.subscribe(
      buildStateSubscribe({
        dataState: dataStateContainer,
        dispatch,
        getState,
        runtimeStateManager,
        services,
        getCurrentTab,
      })
    );

    const tabStateSubscription = createTabPersistableStateObservable({
      tabId,
      internalState$: getInternalState$(),
      getState,
    }).subscribe(() => {
      dispatch(
        internalStateActions.syncLocallyPersistedTabState({
          tabId,
        })
      );
    });

    // triggers data fetching when filters change
    const filterUnsubscribe = merge(services.filterManager.getFetches$()).subscribe(() => {
      addLog('[tab_sync] filter changes triggers data fetching');
      dispatch(
        internalStateActions.fetchData({
          tabId,
        })
      );
    });

    // start subscribing to dataStateContainer, triggering data fetching
    const unsubscribeData = dataStateContainer.subscribe();

    services.data.search.session.enableStorage(
      createSearchSessionRestorationDataProvider({
        data: services.data,
        getPersistedDiscoverSession: () => getState().persistedDiscoverSession,
        getCurrentTab,
        getCurrentTabRuntimeState: () => selectTabRuntimeState(runtimeStateManager, tabId),
      }),
      {
        isDisabled: () =>
          services.capabilities.discover_v2.storeSearchSession
            ? { disabled: false }
            : {
                disabled: true,
                reasonText: noSearchSessionStorageCapabilityMessage,
              },
      }
    );

    const unsubscribeFn = () => {
      unsubscribeData();
      appStateSubscription.unsubscribe();
      tabStateSubscription.unsubscribe();
      unsubscribeUrlState();
      unsubscribeUrlTracking();
      filterUnsubscribe.unsubscribe();
    };

    tabRuntimeState.unsubscribeFn$.next(unsubscribeFn);
  };

/**
 * Stop syncing the state containers started by initializeAndSync
 */
export const stopSyncing: InternalStateThunkActionCreator<[TabActionPayload]> = ({ tabId }) =>
  function stopSyncingThunkFn(dispatch, getState, { runtimeStateManager }) {
    const tabRuntimeState = selectTabRuntimeState(runtimeStateManager, tabId);
    const unsubscribeFn = tabRuntimeState.unsubscribeFn$.getValue();
    unsubscribeFn?.();
    tabRuntimeState.unsubscribeFn$.next(undefined);
  };
