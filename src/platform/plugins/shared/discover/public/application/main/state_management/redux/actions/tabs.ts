/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { cloneDeep, differenceBy, omit } from 'lodash';
import type { DataViewSpec, QueryState } from '@kbn/data-plugin/common';
import { getSavedSearchFullPathUrl } from '@kbn/saved-search-plugin/public';
import { i18n } from '@kbn/i18n';
import { isOfAggregateQueryType } from '@kbn/es-query';
import { getInitialESQLQuery } from '@kbn/esql-utils';
import type { TabItem } from '@kbn/unified-tabs';
import type { DiscoverSession } from '@kbn/saved-search-plugin/common';
import type { UISession } from '@kbn/data-plugin/public/search/session/sessions_mgmt/types';
import type { OpenInNewTabParams } from '../../../../../context_awareness/types';
import { createDataSource } from '../../../../../../common/data_sources/utils';
import type { DiscoverAppState, TabState } from '../types';
import { selectAllTabs, selectRecentlyClosedTabs, selectTab } from '../selectors';
import {
  internalStateSlice,
  discardFlyoutsOnTabChange,
  type TabActionPayload,
  type InternalStateThunkActionCreator,
} from '../internal_state';
import {
  createTabRuntimeState,
  selectTabRuntimeState,
  selectInitialUnifiedHistogramLayoutPropsMap,
  selectTabRuntimeInternalState,
} from '../runtime_state';
import {
  APP_STATE_URL_KEY,
  GLOBAL_STATE_URL_KEY,
  NEW_TAB_ID,
} from '../../../../../../common/constants';
import { createInternalStateAsyncThunk, createTabItem } from '../utils';
import { setBreadcrumbs } from '../../../../../utils/breadcrumbs';
import { DEFAULT_TAB_STATE } from '../constants';
import type { DiscoverAppLocatorParams } from '../../../../../../common';
import { parseAppLocatorParams } from '../../../../../../common/app_locator_get_location';
import { fetchData } from './tab_state';
import { fromSavedObjectTabToTabState } from '../tab_mapping_utils';
import { initializeAndSync, stopSyncing } from './tab_sync';

export const setTabs: InternalStateThunkActionCreator<
  [Parameters<typeof internalStateSlice.actions.setTabs>[0]]
> = (params) =>
  function setTabsThunkFn(
    dispatch,
    getState,
    {
      runtimeStateManager,
      tabsStorageManager,
      getCascadedDocumentsStateManager,
      getContextAwarenessToolkit,
      services,
    }
  ) {
    const previousState = getState();
    const discoverSessionChanged =
      params.updatedDiscoverSession &&
      previousState.persistedDiscoverSession &&
      params.updatedDiscoverSession.id !== previousState.persistedDiscoverSession?.id;

    const previousTabs = selectAllTabs(previousState);
    const removedTabs = discoverSessionChanged
      ? previousTabs
      : differenceBy(previousTabs, params.allTabs, differenceIterateeByTabId);
    const addedTabs = discoverSessionChanged
      ? params.allTabs
      : differenceBy(params.allTabs, previousTabs, differenceIterateeByTabId);
    const justRemovedTabs: TabState[] = [];

    for (const tab of removedTabs) {
      const newRecentlyClosedTab: TabState = { ...tab };
      // make sure to get the latest internal and app state from runtime state manager before deleting the runtime state
      newRecentlyClosedTab.initialInternalState =
        selectTabRuntimeInternalState({ runtimeStateManager, tabState: tab, services }) ??
        cloneDeep(tab.initialInternalState);
      newRecentlyClosedTab.attributes = cloneDeep(tab.attributes);
      newRecentlyClosedTab.appState = cloneDeep(tab.appState);
      newRecentlyClosedTab.globalState = cloneDeep(tab.globalState);
      justRemovedTabs.push(newRecentlyClosedTab);

      dispatch(disconnectTab({ tabId: tab.id }));
    }

    // Wait to delete runtime state until after all removed tabs
    // are disconnected to avoid undefined errors in side effects
    for (const tab of removedTabs) {
      delete runtimeStateManager.tabs.byId[tab.id];
    }

    for (const tab of addedTabs) {
      runtimeStateManager.tabs.byId[tab.id] = createTabRuntimeState({
        services,
        cascadedDocumentsStateManager: getCascadedDocumentsStateManager(tab.id),
        toolkit: getContextAwarenessToolkit(tab.id),
        initialValues: {
          unifiedHistogramLayoutPropsMap: tab.duplicatedFromId
            ? selectInitialUnifiedHistogramLayoutPropsMap(runtimeStateManager, tab.duplicatedFromId)
            : undefined,
        },
      });
    }

    const selectedTabRuntimeState = selectTabRuntimeState(
      runtimeStateManager,
      params.selectedTabId
    );

    if (selectedTabRuntimeState) {
      selectedTabRuntimeState.scopedEbtManager$.getValue().setAsActiveManager();
    }

    dispatch(
      internalStateSlice.actions.setTabs({
        ...params,
        recentlyClosedTabs: tabsStorageManager.getNRecentlyClosedTabs({
          previousOpenTabs: previousTabs,
          previousRecentlyClosedTabs: params.recentlyClosedTabs,
          nextOpenTabs: params.allTabs,
          justRemovedTabs,
        }),
      })
    );
  };

export const updateTabs: InternalStateThunkActionCreator<
  [
    {
      items: TabState[] | TabItem[];
      selectedItem: TabState | TabItem | null;
      updatedDiscoverSession?: DiscoverSession;
    },
    void
  ],
  Promise<void>
> = ({ items, selectedItem, updatedDiscoverSession }) =>
  async function updateTabsThunkFn(
    dispatch,
    getState,
    { services, runtimeStateManager, tabsStorageManager, urlStateStorage, searchSessionManager }
  ) {
    const currentState = getState();
    const currentTab = selectTab(currentState, currentState.tabs.unsafeCurrentId);
    const currentTabRuntimeState = selectTabRuntimeState(runtimeStateManager, currentTab.id);

    const updatedTabs = items.map<TabState>((item) => {
      const existingTab = selectTab(currentState, item.id);

      const tab: TabState = {
        ...DEFAULT_TAB_STATE,
        ...{
          globalState: {
            timeRange: services.timefilter.getTime(),
            refreshInterval: services.timefilter.getRefreshInterval(),
            filters: services.filterManager.getGlobalFilters(),
          },
        },
        ...existingTab,
        ...omit(item, 'initializationState'),
      };

      if (existingTab) {
        return tab;
      }

      // TODO: these lines can likely be removed since `item` is already spread to `tab` above
      // the following assignments for appState, globalState, and dataRequestParams are for supporting `openInNewTab` action
      tab.attributes = 'attributes' in item ? cloneDeep(item.attributes) : tab.attributes;
      tab.appState = 'appState' in item ? cloneDeep(item.appState) : tab.appState;
      tab.globalState = 'globalState' in item ? cloneDeep(item.globalState) : tab.globalState;
      tab.dataRequestParams =
        'dataRequestParams' in item ? item.dataRequestParams : tab.dataRequestParams;

      if (item.duplicatedFromId) {
        // the new tab was created by duplicating an existing tab
        const existingTabToDuplicateFrom = selectTab(currentState, item.duplicatedFromId);

        if (!existingTabToDuplicateFrom) {
          return tab;
        }

        tab.initialInternalState =
          selectTabRuntimeInternalState({
            runtimeStateManager,
            tabState: existingTabToDuplicateFrom,
            services,
          }) ?? cloneDeep(existingTabToDuplicateFrom.initialInternalState);
        tab.attributes = cloneDeep(existingTabToDuplicateFrom.attributes);
        tab.appState = cloneDeep(existingTabToDuplicateFrom.appState);
        tab.globalState = cloneDeep(existingTabToDuplicateFrom.globalState);
        tab.profileState = cloneDeep(existingTabToDuplicateFrom.profileState);
        tab.uiState = cloneDeep(existingTabToDuplicateFrom.uiState);
      } else if (item.restoredFromId) {
        // the new tab was created by restoring a recently closed tab
        const recentlyClosedTabToRestore = selectRecentlyClosedTabs(currentState).find(
          (t) => t.id === item.restoredFromId
        );

        if (!recentlyClosedTabToRestore) {
          return tab;
        }

        tab.initialInternalState = cloneDeep(recentlyClosedTabToRestore.initialInternalState);
        tab.attributes = cloneDeep(recentlyClosedTabToRestore.attributes);
        tab.appState = cloneDeep(recentlyClosedTabToRestore.appState);
        tab.globalState = cloneDeep(recentlyClosedTabToRestore.globalState);
      } else if (!('appState' in item)) {
        // the new tab is a fresh one
        const currentQuery = currentTab.appState.query;
        const currentDataView = currentTabRuntimeState.currentDataView$.getValue();

        if (!currentQuery || !currentDataView) {
          return tab;
        }

        tab.appState = {
          ...(isOfAggregateQueryType(currentQuery)
            ? { query: { esql: getInitialESQLQuery(currentDataView) } }
            : {}),
          dataSource: createDataSource({
            dataView: currentDataView,
            query: currentQuery,
          }),
        };
      }

      return tab;
    });

    const selectedTab = selectedItem ?? currentTab;
    const selectedTabHasChanged = selectedTab.id !== currentTab.id;

    // If changing tabs, stop syncing the current tab before updating any URL state
    if (selectedTabHasChanged) {
      dispatch(stopSyncing({ tabId: currentTab.id }));
    }

    // Push the selected tab ID to the URL, which creates a new browser history entry.
    // This must be done before setting other URL state, which replace the history entry
    // in order to avoid creating multiple browser history entries when switching tabs.
    await tabsStorageManager.pushSelectedTabIdToUrl(selectedTab.id);

    if (selectedTabHasChanged) {
      const nextTab = updatedTabs.find((tab) => tab.id === selectedTab.id);
      const nextTabRuntimeState = selectTabRuntimeState(runtimeStateManager, selectedTab.id);
      const nextTabDataStateContainer = nextTabRuntimeState?.dataStateContainer$.getValue();

      if (nextTab && nextTabDataStateContainer) {
        const { timeRange, refreshInterval, filters: globalFilters } = nextTab.globalState;
        const { filters: appFilters, query } = nextTab.appState;

        await Promise.all([
          urlStateStorage.set<QueryState>(
            GLOBAL_STATE_URL_KEY,
            {
              time: timeRange,
              refreshInterval,
              filters: globalFilters,
            },
            { replace: true }
          ),
          urlStateStorage.set<DiscoverAppState>(APP_STATE_URL_KEY, nextTab.appState, {
            replace: true,
          }),
        ]);

        services.timefilter.setTime(timeRange ?? services.timefilter.getTimeDefaults());
        services.timefilter.setRefreshInterval(
          refreshInterval ?? services.timefilter.getRefreshIntervalDefaults()
        );
        services.filterManager.setGlobalFilters(cloneDeep(globalFilters ?? []));
        services.filterManager.setAppFilters(cloneDeep(appFilters ?? []));
        services.data.query.queryString.setQuery(
          query ?? services.data.query.queryString.getDefaultQuery()
        );

        if (nextTab.dataRequestParams.searchSessionId) {
          services.data.search.session.continue(nextTab.dataRequestParams.searchSessionId, true);

          if (nextTab.dataRequestParams.isSearchSessionRestored) {
            searchSessionManager.pushSearchSessionIdToURL(
              nextTab.dataRequestParams.searchSessionId,
              { replace: true }
            );
          }
        }

        if (!nextTab.dataRequestParams.isSearchSessionRestored) {
          searchSessionManager.removeSearchSessionIdFromURL({ replace: true });
        }

        dispatch(initializeAndSync({ tabId: nextTab.id }));

        if (nextTab.forceFetchOnSelect) {
          nextTabDataStateContainer.reset();
          dispatch(fetchData({ tabId: nextTab.id }));
        }
      } else {
        await Promise.all([
          urlStateStorage.set(GLOBAL_STATE_URL_KEY, null, { replace: true }),
          urlStateStorage.set(APP_STATE_URL_KEY, null, { replace: true }),
        ]);
        searchSessionManager.removeSearchSessionIdFromURL({ replace: true });
        services.data.search.session.reset();
      }

      dispatch(discardFlyoutsOnTabChange());
    }

    dispatch(
      setTabs({
        allTabs: updatedTabs,
        selectedTabId: selectedTab.id,
        recentlyClosedTabs: selectRecentlyClosedTabs(currentState),
        updatedDiscoverSession,
      })
    );
  };

export const initializeTabs = createInternalStateAsyncThunk(
  'internalState/initializeTabs',
  async function initializeTabsThunkFn(
    {
      discoverSessionId,
      shouldClearAllTabs,
    }: { discoverSessionId: string | undefined; shouldClearAllTabs?: boolean },
    { dispatch, getState, extra: { services, tabsStorageManager, customizationContext } }
  ) {
    const { userId: existingUserId, spaceId: existingSpaceId } = getState();

    const getUserId = async () => {
      try {
        return (await services.core.security?.authc.getCurrentUser()).profile_uid ?? '';
      } catch {
        // ignore as user id might be unavailable for some deployments
        return '';
      }
    };

    const getSpaceId = async () => {
      try {
        return (await services.spaces?.getActiveSpace())?.id ?? '';
      } catch {
        // ignore
        return '';
      }
    };

    const [userId, spaceId, persistedDiscoverSession] = await Promise.all([
      existingUserId === undefined ? getUserId() : existingUserId,
      existingSpaceId === undefined ? getSpaceId() : existingSpaceId,
      discoverSessionId ? services.savedSearch.getDiscoverSession(discoverSessionId) : undefined,
    ]);

    if (customizationContext.displayMode === 'standalone' && persistedDiscoverSession) {
      services.chrome.recentlyAccessed.add(
        getSavedSearchFullPathUrl(persistedDiscoverSession.id),
        persistedDiscoverSession.title ??
          i18n.translate('discover.defaultDiscoverSessionTitle', {
            defaultMessage: 'Untitled Discover session',
          }),
        persistedDiscoverSession.id
      );

      setBreadcrumbs({ services, titleBreadcrumbText: persistedDiscoverSession.title });
    }

    const byValueEmbeddableTab = services.embeddableEditor.getByValueTab();
    const byValueEmbeddableTabState = byValueEmbeddableTab
      ? fromSavedObjectTabToTabState({ tab: byValueEmbeddableTab })
      : undefined;

    const initialTabsState = tabsStorageManager.loadLocally({
      userId,
      spaceId,
      persistedDiscoverSession,
      shouldClearAllTabs,
      defaultTabState: byValueEmbeddableTabState ?? DEFAULT_TAB_STATE,
    });

    const history = services.getScopedHistory();
    const locationState = history?.location.state;

    // Replace instead of push the tab ID to the URL on initialization in order to
    // avoid capturing a browser history entry with a potentially empty _tab state
    await tabsStorageManager.pushSelectedTabIdToUrl(initialTabsState.selectedTabId, {
      replace: true,
    });

    // Manually restore the previous location state since pushing the tab ID
    // to the URL clears it, but initial location state must be passed on,
    // e.g. ad hoc data views specs
    if (locationState) {
      history.replace({ ...history.location, state: locationState });
    }

    dispatch(
      setTabs({
        ...initialTabsState,
        updatedDiscoverSession: persistedDiscoverSession,
      })
    );

    return { userId, spaceId, persistedDiscoverSession };
  }
);

export const restoreTab: InternalStateThunkActionCreator<[{ restoreTabId: string }]> = ({
  restoreTabId,
}) =>
  function restoreTabThunkFn(dispatch, getState) {
    const currentState = getState();

    // Restoring the 'new' tab ID is a no-op because it represents a placeholder for creating new tabs,
    // not an actual tab that can be restored.
    if (restoreTabId === currentState.tabs.unsafeCurrentId || restoreTabId === NEW_TAB_ID) {
      return;
    }

    const currentTabs = selectAllTabs(currentState);
    const currentTab = selectTab(currentState, currentState.tabs.unsafeCurrentId);

    let items = currentTabs;
    // search among open tabs
    let selectedItem = items.find((tab) => tab.id === restoreTabId);

    if (!selectedItem) {
      // search among recently closed tabs
      const recentlyClosedTabs = selectRecentlyClosedTabs(currentState);
      const closedTab = recentlyClosedTabs.find((tab) => tab.id === restoreTabId);
      if (closedTab) {
        // reopening one of the closed tabs
        selectedItem = omit(closedTab, 'closedAt');
        items = [...items, closedTab];
      }
    }

    return dispatch(
      updateTabs({
        items,
        // TODO: should we even call updateTabs if selectedItem is not found or just return?
        selectedItem: selectedItem || currentTab,
      })
    );
  };

export const openInNewTab: InternalStateThunkActionCreator<
  [
    {
      tabLabel?: string;
      appState?: TabState['appState'];
      globalState?: TabState['globalState'];
      searchSessionId?: string;
      dataViewSpec?: DataViewSpec;
    }
  ],
  Promise<void>
> = ({ tabLabel, appState, globalState, searchSessionId, dataViewSpec }) =>
  function openInNewTabThunkFn(dispatch, getState) {
    const initialAppState = appState ? cloneDeep(appState) : {};
    const initialGlobalState = globalState ? cloneDeep(globalState) : {};
    const currentState = getState();
    const currentTabs = selectAllTabs(currentState);

    const newDefaultTab: TabState = {
      ...DEFAULT_TAB_STATE,
      ...createTabItem(currentTabs),
      appState: initialAppState,
      globalState: initialGlobalState,
    };

    if (tabLabel) {
      newDefaultTab.label = tabLabel;
    }

    if (searchSessionId) {
      newDefaultTab.initialInternalState = {
        ...newDefaultTab.initialInternalState,
        searchSessionId,
      };
    }

    if (dataViewSpec) {
      newDefaultTab.initialInternalState = {
        ...newDefaultTab.initialInternalState,
        serializedSearchSource: { index: dataViewSpec },
      };
    }

    return dispatch(
      updateTabs({ items: [...currentTabs, newDefaultTab], selectedItem: newDefaultTab })
    );
  };

export const openInNewTabExtPointAction: InternalStateThunkActionCreator<
  [OpenInNewTabParams],
  Promise<void>
> = ({ query, tabLabel, timeRange }) =>
  function openInNewTabExtPointActionThunkFn(dispatch) {
    const appState: TabState['appState'] = { query };
    const globalState: TabState['globalState'] = { timeRange };

    return dispatch(
      openInNewTab({
        appState,
        globalState,
        tabLabel,
      })
    );
  };

export const openSearchSessionInNewTab: InternalStateThunkActionCreator<
  [
    {
      searchSession: UISession;
    }
  ],
  Promise<void>
> = ({ searchSession }) =>
  async function openSearchSessionInNewTabThunkFn(dispatch) {
    const restoreState = searchSession.restoreState as DiscoverAppLocatorParams;

    if (!restoreState.searchSessionId) {
      return;
    }

    const {
      appState,
      globalState: originalGlobalState,
      state: { dataViewSpec },
    } = parseAppLocatorParams(restoreState);

    const globalState: TabState['globalState'] = {};
    if (originalGlobalState?.time) {
      globalState.timeRange = originalGlobalState.time;
    }
    if (originalGlobalState?.refreshInterval) {
      globalState.refreshInterval = originalGlobalState.refreshInterval;
    }
    if (originalGlobalState?.filters) {
      globalState.filters = originalGlobalState.filters;
    }

    return dispatch(
      openInNewTab({
        tabLabel: searchSession.name,
        searchSessionId: restoreState.searchSessionId,
        appState,
        globalState,
        dataViewSpec,
      })
    );
  };

export const clearRecentlyClosedTabs: InternalStateThunkActionCreator = () =>
  function clearRecentlyClosedTabsThunkFn(dispatch, getState) {
    const currentState = getState();
    return dispatch(
      setTabs({
        allTabs: selectAllTabs(currentState),
        selectedTabId: currentState.tabs.unsafeCurrentId,
        recentlyClosedTabs: [],
      })
    );
  };

export const disconnectTab: InternalStateThunkActionCreator<[TabActionPayload]> = ({ tabId }) =>
  function disconnectTabThunkFn(dispatch, __, { runtimeStateManager }) {
    const tabRuntimeState = selectTabRuntimeState(runtimeStateManager, tabId);
    tabRuntimeState.dataStateContainer$.getValue()?.cancel();
    dispatch(stopSyncing({ tabId }));
    tabRuntimeState.customizationService$.getValue()?.cleanup();
    dispatch(internalStateSlice.actions.disconnectTab({ tabId }));
  };

function differenceIterateeByTabId(tab: TabState) {
  return tab.id;
}
