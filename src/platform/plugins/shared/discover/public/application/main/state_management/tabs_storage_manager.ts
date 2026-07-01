/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { differenceBy, orderBy, pick, uniqBy, omit } from 'lodash';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import {
  createStateContainer,
  type IKbnUrlStateStorage,
  syncState,
} from '@kbn/kibana-utils-plugin/public';
import type { TabItem } from '@kbn/unified-tabs';
import type { DiscoverSession } from '@kbn/saved-search-plugin/common';
import { ProfileStateType, type ProfileStateRegistry } from '../../../context_awareness';
import { NEW_TAB_ID, TAB_STATE_URL_KEY } from '../../../../common/constants';
import {
  createTabItem,
  extractEsqlVariables,
  fromSavedObjectTabToTabState,
  parseControlGroupJson,
  type DiscoverAppState,
  type RecentlyClosedTabState,
  type TabState,
} from './redux';
import type { TabsUrlState } from '../../../../common/types';

export const TABS_LOCAL_STORAGE_KEY = 'discover.tabs';
export const RECENTLY_CLOSED_TABS_LIMIT = 50;

export type TabStateInLocalStorage = Pick<TabState, 'id' | 'label'> & {
  internalState: TabState['initialInternalState'] | undefined;
  attributes: TabState['attributes'] | undefined;
  appState: DiscoverAppState | undefined;
  globalState: TabState['globalState'] | undefined;
  profileState: TabState['profileState'] | undefined;
};

type RecentlyClosedTabStateInLocalStorage = TabStateInLocalStorage &
  Pick<RecentlyClosedTabState, 'closedAt'>;

interface TabsStateInLocalStorage {
  userId: string;
  spaceId: string;
  discoverSessionId: string | undefined;
  openTabs: TabStateInLocalStorage[];
  closedTabs: RecentlyClosedTabStateInLocalStorage[];
}

const defaultTabsStateInLocalStorage: TabsStateInLocalStorage = {
  userId: '',
  spaceId: '',
  discoverSessionId: undefined,
  openTabs: [],
  closedTabs: [],
};

export interface TabsInternalStatePayload {
  allTabs: TabState[];
  selectedTabId: string;
  recentlyClosedTabs: RecentlyClosedTabState[];
}

export interface TabsStorageManager {
  /**
   * Supports two-way sync of the selected tab id with the URL.
   */
  startUrlSync: (props: { onChanged?: (nextState: TabsUrlState) => void }) => () => void;
  pushSelectedTabIdToUrl: (selectedTabId: string, options?: { replace?: boolean }) => Promise<void>;
  persistLocally: (
    props: Omit<TabsInternalStatePayload, 'selectedTabId'>,
    getInternalState: (tabId: string) => TabState['initialInternalState'] | undefined,
    discoverSessionId: string | undefined
  ) => Promise<void>;
  updateTabStateLocally: (
    tabId: string,
    tabState: Pick<
      TabStateInLocalStorage,
      'internalState' | 'attributes' | 'appState' | 'globalState' | 'profileState'
    >
  ) => void;
  loadLocally: (props: {
    userId: string;
    spaceId: string;
    persistedDiscoverSession?: DiscoverSession;
    shouldClearAllTabs?: boolean;
    defaultTabState: Omit<TabState, keyof TabItem>;
  }) => TabsInternalStatePayload;
  getNRecentlyClosedTabs: (params: {
    previousOpenTabs: TabState[];
    previousRecentlyClosedTabs: RecentlyClosedTabState[];
    nextOpenTabs: TabState[];
    justRemovedTabs?: TabState[];
  }) => RecentlyClosedTabState[];
}

export const createTabsStorageManager = ({
  urlStateStorage,
  storage,
  profileStateRegistry,
  enabled,
}: {
  urlStateStorage: IKbnUrlStateStorage;
  storage: Storage;
  profileStateRegistry: ProfileStateRegistry;
  enabled?: boolean;
}): TabsStorageManager => {
  const urlStateContainer = createStateContainer<TabsUrlState>({});
  const sessionInfo: Pick<TabsStateInLocalStorage, 'userId' | 'spaceId'> = {
    userId: '',
    spaceId: '',
  };

  // Used to avoid triggering onChanged during programmatic tab ID URL updates
  let isPushingTabIdToUrl = false;

  const startUrlSync: TabsStorageManager['startUrlSync'] = ({
    onChanged, // can be called when selectedTabId changes in URL to trigger app state change if needed
  }) => {
    if (!enabled) {
      return () => {
        // do nothing
      };
    }

    const { start, stop } = syncState({
      stateStorage: urlStateStorage,
      stateContainer: {
        ...urlStateContainer,
        set: (state) => {
          if (state) {
            // syncState utils requires to handle incoming "null" value
            urlStateContainer.set(state);
          }
        },
      },
      storageKey: TAB_STATE_URL_KEY,
    });

    const listener = onChanged
      ? urlStateContainer.state$.subscribe((state) => {
          if (!isPushingTabIdToUrl) {
            onChanged(state);
          }
        })
      : null;

    start();

    return () => {
      listener?.unsubscribe();
      stop();
    };
  };

  const getTabsStateFromURL = () => {
    return urlStateStorage.get<TabsUrlState>(TAB_STATE_URL_KEY);
  };

  const pushSelectedTabIdToUrl: TabsStorageManager['pushSelectedTabIdToUrl'] = async (
    selectedTabId,
    { replace = false } = {}
  ) => {
    const nextState: TabsUrlState = {
      tabId: selectedTabId,
    };
    const previousState = getTabsStateFromURL();
    // If the previous tab was a "new" (unsaved) tab, we replace the URL state instead of pushing a new history entry.
    // This prevents cluttering the browser history with intermediate "new tab" states that are not meaningful to the user.
    const shouldReplace = replace || previousState?.tabId === NEW_TAB_ID;

    try {
      isPushingTabIdToUrl = true;
      await urlStateStorage.set(TAB_STATE_URL_KEY, nextState, { replace: shouldReplace });
    } finally {
      isPushingTabIdToUrl = false;
    }
  };

  const toTabStateInStorage = (
    tabState: TabState,
    getInternalState: ((tabId: string) => TabState['initialInternalState'] | undefined) | undefined
  ): TabStateInLocalStorage => {
    const getInternalStateForTabWithoutRuntimeState = (tabId: string) =>
      getInternalState?.(tabId) || tabState.initialInternalState;
    return {
      id: tabState.id,
      label: tabState.label,
      internalState: getInternalStateForTabWithoutRuntimeState(tabState.id),
      attributes: tabState.attributes,
      appState: tabState.appState,
      globalState: tabState.globalState,
      profileState: getPersistentProfileState(tabState.profileState),
    };
  };

  const toRecentlyClosedTabStateInStorage = (
    tabState: RecentlyClosedTabState
  ): RecentlyClosedTabStateInLocalStorage => {
    const state = toTabStateInStorage(tabState, undefined);
    return {
      ...state,
      closedAt: tabState.closedAt,
    };
  };

  const getDefinedStateOnly = <T extends object>(state: T | undefined): T | undefined => {
    if (!state || !Object.keys(state).length) {
      return undefined;
    }
    return state;
  };

  const getPersistentProfileState = (profileState: TabState['profileState'] | undefined) =>
    getDefinedStateOnly(
      profileStateRegistry.pickStateByType({
        profileState,
        stateType: ProfileStateType.Persistent,
      })
    );

  const toTabState = (
    tabStateInStorage: TabStateInLocalStorage,
    defaultTabState: Omit<TabState, keyof TabItem>
  ): TabState => {
    const internalState = getDefinedStateOnly(tabStateInStorage.internalState);
    const attributes = getDefinedStateOnly(tabStateInStorage.attributes);
    const appState = getDefinedStateOnly(tabStateInStorage.appState);
    const globalState = getDefinedStateOnly(
      tabStateInStorage.globalState || defaultTabState.globalState
    );
    const profileState = getDefinedStateOnly(
      profileStateRegistry.pickStateByType({
        profileState: tabStateInStorage.profileState,
        stateType: ProfileStateType.Persistent,
        shouldMergeDefaults: true,
      })
    );

    let controlGroupState = attributes?.controlGroupState
      ? parseControlGroupJson(JSON.stringify(attributes.controlGroupState))
      : attributes?.controlGroupState;

    // migration from the older format where controlGroupJson was stored in internalState
    if (internalState && 'controlGroupJson' in internalState && !attributes?.controlGroupState) {
      controlGroupState =
        internalState.controlGroupJson && typeof internalState.controlGroupJson === 'string'
          ? parseControlGroupJson(internalState.controlGroupJson)
          : undefined;
    }

    const esqlVariables = controlGroupState
      ? extractEsqlVariables(controlGroupState)
      : defaultTabState.esqlVariables;

    const tabState: TabState = {
      ...defaultTabState,
      ...pick(tabStateInStorage, 'id', 'label'),
      initialInternalState: internalState
        ? omit(internalState, 'visContext', 'controlGroupJson')
        : undefined,
      attributes: {
        ...defaultTabState.attributes,
        ...attributes,
        controlGroupState,
      },
      appState: appState || {},
      globalState: globalState || {},
      profileState: profileState || defaultTabState.profileState,
      esqlVariables,
    };

    // migration from the older format where visContext was stored in internalState
    if (internalState && 'visContext' in internalState && !tabState.attributes.visContext) {
      tabState.attributes.visContext =
        internalState.visContext && typeof internalState.visContext === 'object'
          ? internalState.visContext
          : undefined;
    }

    return tabState;
  };

  const toRecentlyClosedTabState = (
    tabStateInStorage: RecentlyClosedTabStateInLocalStorage,
    defaultTabState: Omit<TabState, keyof TabItem>
  ): RecentlyClosedTabState => ({
    ...toTabState(tabStateInStorage, defaultTabState),
    closedAt: tabStateInStorage.closedAt,
  });

  const readFromLocalStorage = (): TabsStateInLocalStorage => {
    const storedTabsState: TabsStateInLocalStorage | undefined =
      storage.get(TABS_LOCAL_STORAGE_KEY);

    return {
      userId: storedTabsState?.userId || '',
      spaceId: storedTabsState?.spaceId || '',
      discoverSessionId: storedTabsState?.discoverSessionId || undefined,
      openTabs: storedTabsState?.openTabs || [],
      closedTabs: storedTabsState?.closedTabs || [],
    };
  };

  const getNRecentlyClosedTabs: TabsStorageManager['getNRecentlyClosedTabs'] = ({
    previousOpenTabs,
    previousRecentlyClosedTabs,
    nextOpenTabs,
    justRemovedTabs,
  }) => {
    const removedTabs = justRemovedTabs ?? differenceBy(previousOpenTabs, nextOpenTabs, 'id');

    const closedAt = Date.now();
    const newRecentlyClosedTabs: RecentlyClosedTabState[] = removedTabs.map((tab) => ({
      ...tab,
      closedAt,
    }));

    const newSortedRecentlyClosedTabs = orderBy(
      uniqBy([...newRecentlyClosedTabs, ...previousRecentlyClosedTabs], 'id'), // prevent duplicates
      'closedAt',
      'desc'
    );

    const latestNRecentlyClosedTabs = newSortedRecentlyClosedTabs.slice(
      0,
      RECENTLY_CLOSED_TABS_LIMIT
    );

    const recentClosedAt =
      latestNRecentlyClosedTabs[latestNRecentlyClosedTabs.length - 1]?.closedAt;

    if (recentClosedAt) {
      // keep other recently closed tabs from the same time point when they were closed
      for (let i = RECENTLY_CLOSED_TABS_LIMIT; i < newSortedRecentlyClosedTabs.length; i++) {
        if (newSortedRecentlyClosedTabs[i].closedAt === recentClosedAt) {
          latestNRecentlyClosedTabs.push(newSortedRecentlyClosedTabs[i]);
        } else {
          break;
        }
      }
    }

    return latestNRecentlyClosedTabs;
  };

  const persistLocally: TabsStorageManager['persistLocally'] = async (
    { allTabs, recentlyClosedTabs },
    getInternalState,
    discoverSessionId
  ) => {
    if (!enabled) {
      return;
    }

    const openTabs: TabsStateInLocalStorage['openTabs'] = allTabs.map((tab) =>
      toTabStateInStorage(tab, getInternalState)
    );
    const closedTabs: TabsStateInLocalStorage['closedTabs'] = recentlyClosedTabs.map((tab) =>
      toRecentlyClosedTabStateInStorage(tab)
    );

    const nextTabsInStorage: TabsStateInLocalStorage = {
      userId: sessionInfo.userId,
      spaceId: sessionInfo.spaceId,
      discoverSessionId,
      openTabs,
      closedTabs, // wil be used for "Recently closed tabs" feature
    };

    storage.set(TABS_LOCAL_STORAGE_KEY, nextTabsInStorage);
  };

  const updateTabStateLocally: TabsStorageManager['updateTabStateLocally'] = (
    tabId,
    tabStatePartial
  ) => {
    if (!enabled) {
      return;
    }
    let hasModifications = false;
    const storedTabsState = readFromLocalStorage();
    const updatedTabsState = {
      ...storedTabsState,
      openTabs: storedTabsState.openTabs.map((tab) => {
        if (tab.id === tabId) {
          hasModifications = true;
          return {
            ...tab,
            internalState: tabStatePartial.internalState,
            attributes: tabStatePartial.attributes,
            appState: tabStatePartial.appState,
            globalState: tabStatePartial.globalState,
            profileState: getPersistentProfileState(tabStatePartial.profileState),
          };
        }
        return tab;
      }),
    };

    if (hasModifications) {
      storage.set(TABS_LOCAL_STORAGE_KEY, updatedTabsState);
    }
  };

  const loadLocally: TabsStorageManager['loadLocally'] = ({
    userId,
    spaceId,
    persistedDiscoverSession,
    shouldClearAllTabs,
    defaultTabState,
  }) => {
    const tabsStateFromURL = getTabsStateFromURL();
    const selectedTabId = enabled
      ? shouldClearAllTabs
        ? undefined
        : tabsStateFromURL?.tabId
      : undefined;
    let storedTabsState: TabsStateInLocalStorage = enabled
      ? readFromLocalStorage()
      : defaultTabsStateInLocalStorage;

    if (storedTabsState.userId !== userId || storedTabsState.spaceId !== spaceId) {
      // if the userId or spaceId has changed, don't read from the local storage
      storedTabsState = {
        ...defaultTabsStateInLocalStorage,
        userId,
        spaceId,
      };
    }

    sessionInfo.userId = userId;
    sessionInfo.spaceId = spaceId;

    const persistedTabs = persistedDiscoverSession?.tabs.map((tab) =>
      fromSavedObjectTabToTabState({ tab })
    );
    const previousOpenTabs = storedTabsState.openTabs.map((tab) =>
      toTabState(tab, defaultTabState)
    );
    let openTabs = shouldClearAllTabs ? [] : previousOpenTabs;
    if (persistedDiscoverSession?.id !== storedTabsState.discoverSessionId) {
      // if the discover session has changed, use the tabs from the session
      openTabs = persistedTabs ?? [];
    }
    const closedTabs = storedTabsState.closedTabs.map((tab) =>
      toRecentlyClosedTabState(tab, defaultTabState)
    );

    // restore previously opened tabs
    if (enabled) {
      // try to preselect one of the previously opened tabs
      if (
        selectedTabId &&
        selectedTabId !== NEW_TAB_ID &&
        openTabs.find((tab) => tab.id === selectedTabId)
      ) {
        return {
          allTabs: openTabs,
          selectedTabId,
          recentlyClosedTabs: getNRecentlyClosedTabs({
            previousOpenTabs,
            previousRecentlyClosedTabs: closedTabs,
            nextOpenTabs: openTabs,
          }),
        };
      }

      if (
        // append a new tab if requested via URL
        selectedTabId === NEW_TAB_ID ||
        // or append a new tab to the persisted session if could not find it by the selected tab id above
        (selectedTabId && tabsStateFromURL?.tabLabel && persistedDiscoverSession)
      ) {
        const newTab = {
          ...defaultTabState,
          ...createTabItem(openTabs),
        };

        if (tabsStateFromURL?.tabLabel) {
          newTab.label = tabsStateFromURL.tabLabel;
        }

        const allTabsWithNewTab = [...openTabs, newTab];
        return {
          allTabs: allTabsWithNewTab,
          selectedTabId: newTab.id,
          recentlyClosedTabs: getNRecentlyClosedTabs({
            previousOpenTabs,
            previousRecentlyClosedTabs: closedTabs,
            nextOpenTabs: allTabsWithNewTab,
          }),
        };
      }

      // otherwise try to reopen some of the previously closed tabs
      if (selectedTabId && !persistedDiscoverSession && !tabsStateFromURL?.tabLabel) {
        const storedClosedTab = storedTabsState.closedTabs.find((tab) => tab.id === selectedTabId);

        if (storedClosedTab) {
          // restore previously closed tabs, for example when only the default tab was shown
          const restoredTabs = storedTabsState.closedTabs
            .filter((tab) => tab.closedAt === storedClosedTab.closedAt)
            .map((tab) => toTabState(tab, defaultTabState));
          return {
            allTabs: restoredTabs,
            selectedTabId,
            recentlyClosedTabs: getNRecentlyClosedTabs({
              previousOpenTabs,
              previousRecentlyClosedTabs: closedTabs,
              nextOpenTabs: restoredTabs,
            }),
          };
        }
      }
    }

    // otherwise open the first tab from the Discover Session SO or a new default tab as a fallback
    const newDefaultTab = {
      ...defaultTabState,
      ...createTabItem([]),
    };

    if (enabled && tabsStateFromURL?.tabLabel) {
      newDefaultTab.label = tabsStateFromURL.tabLabel;
    }

    let allTabs = [newDefaultTab];
    let selectedTab = newDefaultTab;

    if (persistedTabs?.length) {
      allTabs = persistedTabs;
      selectedTab = persistedTabs[0];
    }

    return {
      allTabs,
      selectedTabId: selectedTab.id,
      recentlyClosedTabs: getNRecentlyClosedTabs({
        previousOpenTabs,
        previousRecentlyClosedTabs: closedTabs,
        nextOpenTabs: allTabs,
      }),
    };
  };

  return {
    startUrlSync,
    pushSelectedTabIdToUrl,
    persistLocally,
    updateTabStateLocally,
    loadLocally,
    getNRecentlyClosedTabs,
  };
};
