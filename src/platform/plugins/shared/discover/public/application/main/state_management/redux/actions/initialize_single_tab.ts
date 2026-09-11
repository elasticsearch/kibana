/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView, DataViewSpec } from '@kbn/data-views-plugin/common';
import { isEmptyEsqlQuery, isOfAggregateQueryType } from '@kbn/es-query';
import { cloneDeep, isEqual, isObject, pick } from 'lodash';
import type { GlobalQueryStateFromUrl } from '@kbn/data-plugin/public';
import type { ControlPanelsState } from '@kbn/control-group-renderer';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import { getEsqlDataView } from '@kbn/discover-utils';
import { internalStateSlice, type TabActionPayload } from '../internal_state';
import { getInitialAppState } from '../../utils/get_initial_app_state';
import { TabInitializationStatus, type DiscoverAppState } from '..';
import type { DiscoverDataStateContainer } from '../../discover_data_state_container';
import { appendAdHocDataViews } from './data_views';
import { setDataView } from './tab_state_data_view';
import { type AppStateUrl, cleanupUrlState } from '../../utils/cleanup_url_state';
import { loadAndResolveDataView } from '../../utils/resolve_data_view';
import { isDataViewSource } from '../../../../../../common/data_sources';
import { isRefreshIntervalValid, isTimeRangeValid } from '../../../../../utils/validate_time';
import { getValidFilters } from '../../../../../utils/get_valid_filters';
import { APP_STATE_URL_KEY } from '../../../../../../common';
import { selectTabRuntimeState } from '../runtime_state';
import type { ConnectedCustomizationService } from '../../../../../customizations';
import { ProfileStateType, type ProfileStateMap } from '../../../../../../common/context_awareness';
import { selectTab } from '../selectors';
import type { TabState, TabStateGlobalState } from '../types';
import { GLOBAL_STATE_URL_KEY, PROFILE_STATE_URL_KEY } from '../../../../../../common/constants';
import { fromSavedObjectTabToSearchSource } from '../tab_mapping_utils';
import { createInternalStateAsyncThunk, extractEsqlVariables } from '../utils';
import { fetchData, updateAttributes } from './tab_state';
import { initializeAndSync } from './tab_sync';

export interface InitializeSingleTabsParams {
  customizationService: ConnectedCustomizationService;
  dataStateContainer: DiscoverDataStateContainer;
  dataViewSpec: DataViewSpec | undefined;
  esqlControls: ControlPanelsState<OptionsListESQLControlState> | undefined;
  defaultUrlState: DiscoverAppState | undefined;
  profileState?: ProfileStateMap;
}

export const initializeSingleTab = createInternalStateAsyncThunk(
  'internalState/initializeSingleTab',
  async function initializeSingleTabThunkFn(
    {
      tabId,
      initializeSingleTabParams: {
        customizationService,
        dataStateContainer,
        dataViewSpec,
        esqlControls,
        defaultUrlState,
        profileState,
      },
    }: TabActionPayload<{ initializeSingleTabParams: InitializeSingleTabsParams }>,
    {
      dispatch,
      getState,
      extra: { services, runtimeStateManager, urlStateStorage, searchSessionManager },
    }
  ) {
    const { currentDataView$, dataStateContainer$, customizationService$, scopedEbtManager$ } =
      selectTabRuntimeState(runtimeStateManager, tabId);

    /**
     * New tab initialization with the restored data if available
     */

    let tabInitialGlobalState: TabStateGlobalState | undefined;
    let tabInitialAppState: DiscoverAppState | undefined;
    let tabInitialInternalState: TabState['initialInternalState'] | undefined;

    const getTabState = () => selectTab(getState(), tabId);
    const tabState = getTabState();

    if (tabState.globalState) {
      tabInitialGlobalState = cloneDeep(tabState.globalState);
    }

    if (tabState.appState) {
      tabInitialAppState = cloneDeep(tabState.appState);
    }

    if (tabState.initialInternalState) {
      tabInitialInternalState = cloneDeep(tabState.initialInternalState);
    }

    if (esqlControls) {
      dispatch(
        updateAttributes({
          tabId,
          attributes: {
            controlGroupState: esqlControls,
          },
        })
      );

      dispatch(
        internalStateSlice.actions.setEsqlVariables({
          tabId,
          esqlVariables: extractEsqlVariables(esqlControls),
        })
      );
    }

    // Get a snapshot of the current URL state before any async work is done
    // to avoid race conditions if the URL changes during tab initialization,
    // e.g. if the user quickly switches tabs
    const urlGlobalState = urlStateStorage.get<GlobalQueryStateFromUrl>(GLOBAL_STATE_URL_KEY);
    const urlAppState = {
      ...tabInitialAppState,
      ...(defaultUrlState ??
        cleanupUrlState(urlStateStorage.get<AppStateUrl>(APP_STATE_URL_KEY), services.uiSettings)),
    };
    const urlProfileState = services.profileStateRegistry.pickStateByType({
      profileStateMap: urlStateStorage.get<ProfileStateMap>(PROFILE_STATE_URL_KEY) ?? undefined,
      stateTypes: [ProfileStateType.Url],
    });
    const defaultPersistentProfileState = services.profileStateRegistry.pickStateByType({
      profileStateMap: profileState,
      stateTypes: [ProfileStateType.Persistent],
    });

    const discoverTabLoadTracker = scopedEbtManager$
      .getValue()
      .trackPerformanceEvent('discoverLoadSavedSearch');

    const { persistedDiscoverSession } = getState();
    const persistedTab = persistedDiscoverSession?.tabs.find((tab) => tab.id === tabId);
    const persistedTabSearchSource = persistedTab
      ? await fromSavedObjectTabToSearchSource({ tab: persistedTab, services })
      : undefined;

    const initialQuery = urlAppState?.query ?? persistedTab?.serializedSearchSource.query;
    const isEsqlMode = isOfAggregateQueryType(initialQuery);

    const initialDataViewIdOrSpec = tabInitialInternalState?.serializedSearchSource?.index;
    const initialAdHocDataViewSpec = isObject(initialDataViewIdOrSpec)
      ? initialDataViewIdOrSpec
      : undefined;

    const persistedTabDataView = persistedTabSearchSource?.getField('index');
    const dataViewId = isDataViewSource(urlAppState?.dataSource)
      ? urlAppState?.dataSource.dataViewId
      : persistedTabDataView?.id;

    const tabHasInitialAdHocDataViewSpec =
      dataViewId && initialAdHocDataViewSpec?.id === dataViewId;
    const peristedTabHasAdHocDataView = Boolean(
      persistedTabDataView && !persistedTabDataView.isPersisted()
    );

    const { initializationState, defaultProfileAdHocDataViewIds } = getState();
    const profileDataViews = runtimeStateManager.adHocDataViews$
      .getValue()
      .filter(({ id }) => id && defaultProfileAdHocDataViewIds.includes(id));

    const profileDataViewsExist = profileDataViews.length > 0;
    const locationStateHasDataViewSpec = Boolean(dataViewSpec);
    const canAccessWithoutPersistedDataView =
      isEsqlMode ||
      tabHasInitialAdHocDataViewSpec ||
      peristedTabHasAdHocDataView ||
      profileDataViewsExist ||
      locationStateHasDataViewSpec;

    if (!initializationState.hasUserDataView && !canAccessWithoutPersistedDataView) {
      return { showNoDataPage: true };
    }

    /**
     * Tab initialization
     */

    let dataView: DataView;

    if (isOfAggregateQueryType(initialQuery) && !isEmptyEsqlQuery(initialQuery)) {
      // Regardless of what was requested, we always use ad hoc data views for ES|QL
      dataView = await getEsqlDataView(
        initialQuery,
        persistedTabDataView ?? currentDataView$.getValue(),
        services
      );
    } else {
      // Load the requested data view if one exists, or a fallback otherwise
      const result = await loadAndResolveDataView({
        dataViewId,
        locationDataViewSpec: dataViewSpec,
        initialAdHocDataViewSpec,
        currentDataView: persistedTabDataView,
        isEsqlMode,
        services,
        savedDataViews: getState().savedDataViews,
        runtimeStateManager,
      });

      dataView = result.dataView;
    }

    dispatch(setDataView({ tabId, dataView }));

    if (!dataView.isPersisted()) {
      dispatch(appendAdHocDataViews(dataView));
    }

    const initialGlobalState: TabStateGlobalState = {
      ...(persistedTab?.timeRestore && dataView.isTimeBased()
        ? pick(persistedTab, 'timeRange', 'refreshInterval')
        : undefined),
      ...tabInitialGlobalState,
    };

    if (urlGlobalState?.time) {
      initialGlobalState.timeRange = urlGlobalState.time;
    }

    if (urlGlobalState?.refreshInterval) {
      initialGlobalState.refreshInterval = urlGlobalState.refreshInterval;
    }

    if (urlGlobalState?.filters) {
      initialGlobalState.filters = urlGlobalState.filters;
    }

    // Get the initial app state based on a combo of the URL and persisted tab saved search
    const initialAppState = getInitialAppState({
      initialUrlState: urlAppState,
      hasGlobalState: Object.keys(urlGlobalState || {}).length > 0,
      persistedTab,
      dataView,
      services,
      defaultProfileEsqlQuery: getState().defaultProfileEsqlQuery,
    });

    /**
     * Sync global services
     */

    // Use a function to check if the current tab is still active
    // to ensure we are always checking the latest state
    const isCurrentTabActive = () => {
      const isTabSelected = getState().tabs.unsafeCurrentId === tabId;
      const currentTabState = getTabState() as TabState | undefined;
      const isTabDisconnected =
        currentTabState?.initializationState.initializationStatus ===
        TabInitializationStatus.Disconnected;
      return isTabSelected && Boolean(currentTabState) && !isTabDisconnected;
    };

    // Only update global services if this is still the current tab
    if (isCurrentTabActive()) {
      // Push the tab's initial search session ID to the URL if one exists,
      // unless it should be overridden by a search session ID already in the URL
      if (
        tabInitialInternalState?.searchSessionId &&
        !searchSessionManager.hasSearchSessionIdInURL()
      ) {
        searchSessionManager.pushSearchSessionIdToURL(tabInitialInternalState.searchSessionId, {
          replace: true,
        });
      }

      // Cleaning up the previous state
      services.filterManager.setAppFilters([]);
      services.data.query.queryString.clearQuery();

      if (initialGlobalState.timeRange && isTimeRangeValid(initialGlobalState.timeRange)) {
        services.timefilter.setTime(initialGlobalState.timeRange);
      }

      if (
        initialGlobalState.refreshInterval &&
        isRefreshIntervalValid(initialGlobalState.refreshInterval)
      ) {
        services.timefilter.setRefreshInterval(initialGlobalState.refreshInterval);
      }

      if (initialGlobalState.filters) {
        services.filterManager.setGlobalFilters(cloneDeep(initialGlobalState.filters));
      }

      if (initialAppState.filters) {
        services.filterManager.setAppFilters(cloneDeep(initialAppState.filters));
      }

      // some filters may not be valid for this context, so update
      // the filter manager with a modified list of valid filters
      const currentFilters = services.filterManager.getFilters();
      const validFilters = getValidFilters(dataView, currentFilters);
      if (!isEqual(currentFilters, validFilters)) {
        services.filterManager.setFilters(validFilters);
      }

      if (initialAppState.query) {
        services.data.query.queryString.setQuery(initialAppState.query);
      }
    }

    /**
     * Update state containers
     */

    // Initialize app and profile state together
    const mergedProfileState = services.profileStateRegistry.mergeState(
      tabState.profileState,
      defaultPersistentProfileState,
      urlProfileState
    );
    const initialProfileState = services.profileStateRegistry.pickStateByType({
      profileStateMap: mergedProfileState,
      stateTypes: [ProfileStateType.Ui, ProfileStateType.Persistent, ProfileStateType.Url],
      defaultsHandling: 'strip',
    });

    dispatch(
      internalStateSlice.actions.initializeTabState({
        tabId,
        initialAppState,
        initialProfileState,
      })
    );

    // Set runtime state
    customizationService$.next(customizationService);
    dataStateContainer$.next(dataStateContainer);

    // Begin syncing the state and trigger the initial fetch
    // if this is still the current tab, otherwise mark the
    // tab to fetch when selected
    if (isCurrentTabActive()) {
      dispatch(initializeAndSync({ tabId }));

      // Skip the initial fetch for fresh "+" tabs and empty ES|QL queries.
      // skipInitialFetch is in-memory only, so empty ES|QL is what keeps a
      // restored uninitialized tab from executing after refresh.
      if (!tabState.skipInitialFetch && !isEmptyEsqlQuery(initialAppState.query)) {
        dispatch(fetchData({ tabId, initial: true }));
      }
    } else {
      dispatch(
        internalStateSlice.actions.setForceFetchOnSelect({
          tabId,
          forceFetchOnSelect:
            !tabState.skipInitialFetch && !isEmptyEsqlQuery(initialAppState.query),
        })
      );
    }

    discoverTabLoadTracker.reportEvent();

    return { showNoDataPage: false };
  }
);
