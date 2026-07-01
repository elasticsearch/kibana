/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';
import { ESQL_CONTROL } from '@kbn/controls-constants';
import type { UnifiedHistogramVisContext } from '@kbn/unified-histogram';
import { createKbnUrlStateStorage, Storage } from '@kbn/kibana-utils-plugin/public';
import { mockControlState } from '../../../__mocks__/esql_controls';
import { createDiscoverServicesMock } from '../../../__mocks__/services';
import {
  createTabsStorageManager,
  TABS_LOCAL_STORAGE_KEY,
  type TabsInternalStatePayload,
} from './tabs_storage_manager';
import type { RecentlyClosedTabState, TabState } from './redux';
import { NEW_TAB_ID, TAB_STATE_URL_KEY } from '../../../../common/constants';
import { DEFAULT_TAB_STATE, fromSavedSearchToSavedObjectTab } from './redux';
import {
  getRecentlyClosedTabStateMock,
  getTabStateMock,
} from './redux/__mocks__/internal_state.mocks';
import { savedSearchMock } from '../../../__mocks__/saved_search';
import type { SerializedSearchSourceFields } from '@kbn/data-plugin/common';
import { TEST_PROFILE_STATE_DEF } from '../../../context_awareness/__mocks__/profile_state';

const mockUserId = 'testUserId';
const mockSpaceId = 'testSpaceId';

const mockGetInternalState = () => ({});

const mockTab1 = getTabStateMock({
  id: 'tab1',
  label: 'Tab 1',
  globalState: {
    timeRange: { from: '2025-04-16T14:07:55.127Z', to: '2025-04-16T14:12:55.127Z' },
    filters: [],
    refreshInterval: { pause: true, value: 1000 },
  },
  appState: {
    columns: ['a', 'b'],
  },
  attributes: {
    visContext: { someKey: 'test' } as unknown as UnifiedHistogramVisContext,
    controlGroupState: undefined,
  },
});

const mockTab2 = getTabStateMock({
  id: 'tab2',
  label: 'Tab 2',
  globalState: {
    timeRange: { from: '2025-04-17T03:07:55.127Z', to: '2025-04-17T03:12:55.127Z' },
    filters: [],
    refreshInterval: { pause: true, value: 1000 },
  },
  appState: {
    columns: ['c', 'd'],
  },
});

const mockRecentlyClosedTab = getRecentlyClosedTabStateMock({
  id: 'closedTab1',
  label: 'Closed tab 1',
  globalState: {
    timeRange: { from: '2025-04-07T03:07:55.127Z', to: '2025-04-07T03:12:55.127Z' },
    filters: [],
    refreshInterval: { pause: true, value: 1000 },
  },
  appState: {
    columns: ['e', 'f'],
  },
  closedAt: Date.now(),
});

const mockRecentlyClosedTab2: RecentlyClosedTabState = {
  ...mockRecentlyClosedTab,
  id: 'closedTab2',
  label: 'Closed tab 2',
};

const mockRecentlyClosedTab3: RecentlyClosedTabState = {
  ...mockRecentlyClosedTab,
  id: 'closedTab3',
  label: 'Closed tab 3 with another closedAt',
  closedAt: Date.now() + 1000,
};

describe('TabsStorageManager', () => {
  const create = () => {
    const urlStateStorage = createKbnUrlStateStorage();
    const services = createDiscoverServicesMock();
    services.storage = new Storage(localStorage);
    services.profileStateRegistry.registerDefinition(TEST_PROFILE_STATE_DEF);

    return {
      services,
      urlStateStorage,
      tabsStorageManager: createTabsStorageManager({
        urlStateStorage,
        storage: services.storage,
        profileStateRegistry: services.profileStateRegistry,
        enabled: true,
      }),
    };
  };

  const toStoredTab = (tab: TabState | RecentlyClosedTabState) => ({
    id: tab.id,
    label: tab.label,
    internalState: tab.id.startsWith('closedTab')
      ? tab.initialInternalState
      : mockGetInternalState(),
    attributes: tab.attributes,
    appState: tab.appState,
    globalState: tab.globalState,
    profileState: undefined,
    ...('closedAt' in tab ? { closedAt: tab.closedAt } : {}),
  });

  const toRestoredTab = (storedTab: TabState | RecentlyClosedTabState) => ({
    ...DEFAULT_TAB_STATE,
    id: storedTab.id,
    label: storedTab.label,
    initialInternalState: storedTab.initialInternalState,
    attributes: storedTab.attributes,
    appState: storedTab.appState,
    globalState: storedTab.globalState,
    ...('closedAt' in storedTab ? { closedAt: storedTab.closedAt } : {}),
  });

  it('should push tab state to URL', async () => {
    const { tabsStorageManager, urlStateStorage } = create();

    jest.spyOn(urlStateStorage, 'set');

    await tabsStorageManager.pushSelectedTabIdToUrl('my-tab-id');

    expect(urlStateStorage.set).toHaveBeenCalledWith(
      TAB_STATE_URL_KEY,
      { tabId: 'my-tab-id' },
      { replace: false }
    );

    await tabsStorageManager.pushSelectedTabIdToUrl('my-tab-id-2', { replace: true });

    expect(urlStateStorage.set).toHaveBeenCalledWith(
      TAB_STATE_URL_KEY,
      { tabId: 'my-tab-id-2' },
      { replace: true }
    );

    await urlStateStorage.set(TAB_STATE_URL_KEY, { tabId: NEW_TAB_ID });
    await tabsStorageManager.pushSelectedTabIdToUrl('my-tab-id-3');

    expect(urlStateStorage.set).toHaveBeenCalledWith(
      TAB_STATE_URL_KEY,
      { tabId: 'my-tab-id-3' },
      { replace: true }
    );
  });

  it('should call onChanged callback when tab state in URL changes', async () => {
    const { tabsStorageManager, urlStateStorage } = create();

    const onChanged = jest.fn();
    const stop = tabsStorageManager.startUrlSync({ onChanged });

    await urlStateStorage.set(TAB_STATE_URL_KEY, { tabId: 'my-tab-id' });

    expect(onChanged).toHaveBeenCalledWith({ tabId: 'my-tab-id' });

    stop();
  });

  it('should not call onChanged callback when tab state in URL changes but sync is stopped', async () => {
    const { tabsStorageManager, urlStateStorage } = create();

    const onChanged = jest.fn();
    const stop = tabsStorageManager.startUrlSync({ onChanged });

    stop();

    await urlStateStorage.set(TAB_STATE_URL_KEY, { tabId: 'my-tab-id' });

    expect(onChanged).not.toHaveBeenCalled();
  });

  it('should not call onChanged callback when tab state in URL changes via pushSelectedTabIdToUrl', async () => {
    const { tabsStorageManager } = create();

    const onChanged = jest.fn();
    const stop = tabsStorageManager.startUrlSync({ onChanged });

    await tabsStorageManager.pushSelectedTabIdToUrl('my-tab-id');

    expect(onChanged).not.toHaveBeenCalled();

    stop();
  });

  it('should persist tabs state to local storage', async () => {
    const {
      services: { storage },
      tabsStorageManager,
      urlStateStorage,
    } = create();

    tabsStorageManager.loadLocally({
      userId: mockUserId, // register userId and spaceId in tabsStorageManager
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const props: TabsInternalStatePayload = {
      allTabs: [mockTab1, mockTab2],
      selectedTabId: 'tab1',
      recentlyClosedTabs: [mockRecentlyClosedTab],
    };

    await tabsStorageManager.persistLocally(props, mockGetInternalState, 'testDiscoverSessionId');

    expect(storage.set).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [toStoredTab(mockTab1), toStoredTab(mockTab2)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
      discoverSessionId: 'testDiscoverSessionId',
    });
  });

  it('should persist only persistent profile state to local storage', async () => {
    const {
      services: { storage },
      tabsStorageManager,
    } = create();

    tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    jest.spyOn(storage, 'set');

    const tabWithProfileState: TabState = {
      ...mockTab1,
      profileState: {
        testProfileState: {
          uiValue: 'ui',
          persistentValue: 'persistent',
        },
        unregisteredProfileState: {
          persistentValue: 'ignored',
        },
      },
    };
    const closedTabWithProfileState: RecentlyClosedTabState = {
      ...mockRecentlyClosedTab,
      profileState: tabWithProfileState.profileState,
    };

    await tabsStorageManager.persistLocally(
      {
        allTabs: [tabWithProfileState],
        recentlyClosedTabs: [closedTabWithProfileState],
      },
      mockGetInternalState,
      undefined
    );

    const expectedProfileState = {
      testProfileState: {
        persistentValue: 'persistent',
      },
    };

    expect(storage.set).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [
        {
          ...toStoredTab(tabWithProfileState),
          profileState: expectedProfileState,
        },
      ],
      closedTabs: [
        {
          ...toStoredTab(closedTabWithProfileState),
          profileState: expectedProfileState,
        },
      ],
      discoverSessionId: undefined,
    });
  });

  it('should load tabs state from local storage and select one of open tabs', () => {
    const {
      tabsStorageManager,
      urlStateStorage,
      services: { storage },
    } = create();
    jest.spyOn(urlStateStorage, 'get');
    jest.spyOn(storage, 'get');

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [toStoredTab(mockTab1), toStoredTab(mockTab2)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: 'tab2',
    });

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps).toEqual({
      allTabs: [toRestoredTab(mockTab1), toRestoredTab(mockTab2)],
      selectedTabId: 'tab2',
      recentlyClosedTabs: [toRestoredTab(mockRecentlyClosedTab)],
    });
    expect(urlStateStorage.get).toHaveBeenCalledWith(TAB_STATE_URL_KEY);
    expect(storage.get).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY);
    expect(urlStateStorage.set).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('should restore persistent profile state from local storage merged with defaults', () => {
    const {
      tabsStorageManager,
      urlStateStorage,
      services: { storage },
    } = create();
    const storedProfileState = {
      testProfileState: {
        uiValue: 'ignoredUi',
        persistentValue: 'restoredPersistent',
      },
      unregisteredProfileState: {
        persistentValue: 'ignored',
      },
    };

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [
        {
          ...toStoredTab(mockTab1),
          profileState: storedProfileState,
        },
      ],
      closedTabs: [
        {
          ...toStoredTab(mockRecentlyClosedTab),
          profileState: storedProfileState,
        },
      ],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: mockTab1.id,
    });

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps.allTabs[0].profileState).toEqual({
      testProfileState: {
        uiValue: 'defaultUi',
        urlValue: 'defaultUrl',
        persistentValue: 'restoredPersistent',
        nestedValue: { count: 0 },
      },
    });
    expect(loadedProps.recentlyClosedTabs[0].profileState).toEqual({
      testProfileState: {
        uiValue: 'defaultUi',
        urlValue: 'defaultUrl',
        persistentValue: 'restoredPersistent',
        nestedValue: { count: 0 },
      },
    });
  });

  it('should load tabs state from local storage and migrate the legacy props from internalState', () => {
    const {
      tabsStorageManager,
      urlStateStorage,
      services: { storage },
    } = create();
    jest.spyOn(urlStateStorage, 'get');
    jest.spyOn(storage, 'get');

    const storedSerializedSearchSource = { index: 'test-index' };
    const storedSearchSessionId = 'test-session-id';
    const legacyVisContext = { legacyVis: 'legacyValue' };
    const legacyControlGroupState = mockControlState;

    const toLegacyStoredTab = (tab: TabState | RecentlyClosedTabState) => {
      const storedTab = { ...toStoredTab(tab), attributes: undefined };
      storedTab.internalState = {
        serializedSearchSource: storedSerializedSearchSource as SerializedSearchSourceFields,
        searchSessionId: storedSearchSessionId,
        visContext: legacyVisContext as unknown as UnifiedHistogramVisContext,
        controlGroupJson: JSON.stringify(legacyControlGroupState),
      };
      return storedTab;
    };

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [toLegacyStoredTab(mockTab1), toLegacyStoredTab(mockTab2)],
      closedTabs: [toLegacyStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: 'tab2',
    });

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    const loadedTab = loadedProps.allTabs[0];
    expect(loadedTab.attributes).toStrictEqual({
      visContext: legacyVisContext,
      controlGroupState: {
        ...legacyControlGroupState,
        panel1: {
          ...legacyControlGroupState.panel1,
          type: ESQL_CONTROL,
        },
      },
      timeRestore: false,
    });
    expect(loadedTab.esqlVariables).toStrictEqual([
      {
        key: 'foo',
        type: 'values',
        value: 'bar',
      },
    ]);
    expect(loadedTab.initialInternalState).toStrictEqual({
      serializedSearchSource: storedSerializedSearchSource,
      searchSessionId: storedSearchSessionId,
    });
  });

  it('should normalize legacy controlGroupState stored in attributes', async () => {
    const {
      tabsStorageManager,
      urlStateStorage,
      services: { storage },
    } = create();

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [
        {
          ...toStoredTab(mockTab1),
          attributes: {
            ...mockTab1.attributes,
            controlGroupState: mockControlState,
          },
        },
      ],
      closedTabs: [],
    });

    await urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: mockTab1.id,
    });

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps.allTabs[0]?.attributes.controlGroupState).toStrictEqual({
      ...mockControlState,
      panel1: {
        ...mockControlState.panel1,
        type: ESQL_CONTROL,
      },
    });
    expect(loadedProps.allTabs[0]?.esqlVariables).toStrictEqual([
      {
        key: 'foo',
        type: 'values',
        value: 'bar',
      },
    ]);
  });

  it('should clear tabs and select a default one', () => {
    const {
      tabsStorageManager,
      urlStateStorage,
      services: { storage },
    } = create();
    jest.spyOn(urlStateStorage, 'get');
    jest.spyOn(storage, 'get');

    const newClosedAt = Date.now() + 1000;
    jest.spyOn(Date, 'now').mockReturnValue(newClosedAt);

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [toStoredTab(mockTab1), toStoredTab(mockTab2)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: 'tab2',
    });

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
      shouldClearAllTabs: true,
    });

    expect(loadedProps.recentlyClosedTabs).toEqual([
      toRestoredTab({ ...mockTab1, closedAt: newClosedAt }),
      toRestoredTab({ ...mockTab2, closedAt: newClosedAt }),
      toRestoredTab(mockRecentlyClosedTab),
    ]);
    expect(loadedProps.allTabs).toHaveLength(1);
    expect(loadedProps.allTabs[0]).toEqual(
      expect.objectContaining({
        label: 'Untitled',
      })
    );
    expect(loadedProps.selectedTabId).toBe(loadedProps.allTabs[0].id);
    expect(urlStateStorage.get).toHaveBeenCalledWith(TAB_STATE_URL_KEY);
    expect(storage.get).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY);
    expect(urlStateStorage.set).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('should load tabs state from local storage and select one of closed tabs', () => {
    const {
      tabsStorageManager,
      urlStateStorage,
      services: { storage },
    } = create();
    jest.spyOn(urlStateStorage, 'get');
    jest.spyOn(storage, 'get');

    const newClosedAt = Date.now() + 1000;
    jest.spyOn(Date, 'now').mockReturnValue(newClosedAt);

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [toStoredTab(mockTab1), toStoredTab(mockTab2)],
      closedTabs: [
        toStoredTab(mockRecentlyClosedTab),
        toStoredTab(mockRecentlyClosedTab2),
        toStoredTab(mockRecentlyClosedTab3),
      ],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: mockRecentlyClosedTab2.id,
    });

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps).toEqual({
      allTabs: [
        toRestoredTab(omit(mockRecentlyClosedTab, 'closedAt')),
        toRestoredTab(omit(mockRecentlyClosedTab2, 'closedAt')),
      ],
      selectedTabId: mockRecentlyClosedTab2.id,
      recentlyClosedTabs: [
        toRestoredTab({ ...mockTab1, closedAt: newClosedAt }),
        toRestoredTab({ ...mockTab2, closedAt: newClosedAt }),
        toRestoredTab(mockRecentlyClosedTab3),
        toRestoredTab(mockRecentlyClosedTab),
        toRestoredTab(mockRecentlyClosedTab2),
      ],
    });
    expect(urlStateStorage.get).toHaveBeenCalledWith(TAB_STATE_URL_KEY);
    expect(storage.get).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY);
    expect(urlStateStorage.set).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('should initialize with a default state if user id changes', () => {
    const {
      tabsStorageManager,
      urlStateStorage,
      services: { storage },
    } = create();
    jest.spyOn(urlStateStorage, 'get');
    jest.spyOn(storage, 'get');

    const props: TabsInternalStatePayload = {
      allTabs: [mockTab1, mockTab2],
      selectedTabId: 'tab2',
      recentlyClosedTabs: [mockRecentlyClosedTab],
    };

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [toStoredTab(mockTab1), toStoredTab(mockTab2)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: props.selectedTabId,
    });

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const loadedProps = tabsStorageManager.loadLocally({
      userId: 'different',
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps.recentlyClosedTabs).toHaveLength(0);
    expect(loadedProps.allTabs).toHaveLength(1);
    expect(loadedProps.allTabs[0]).toEqual(
      expect.objectContaining({
        label: 'Untitled',
      })
    );
    expect(loadedProps.selectedTabId).toBe(loadedProps.allTabs[0].id);
    expect(urlStateStorage.get).toHaveBeenCalledWith(TAB_STATE_URL_KEY);
    expect(storage.get).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY);
    expect(urlStateStorage.set).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('should initialize with a default single tab', () => {
    const {
      tabsStorageManager,
      urlStateStorage,
      services: { storage },
    } = create();
    jest.spyOn(urlStateStorage, 'get');
    jest.spyOn(storage, 'get');

    const newClosedAt = Date.now() + 1000;
    jest.spyOn(Date, 'now').mockReturnValue(newClosedAt);

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [toStoredTab(mockTab1), toStoredTab(mockTab2)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, null);

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps).toEqual(
      expect.objectContaining({
        recentlyClosedTabs: [
          toRestoredTab({ ...mockTab1, closedAt: newClosedAt }),
          toRestoredTab({ ...mockTab2, closedAt: newClosedAt }),
          toRestoredTab(mockRecentlyClosedTab),
        ],
      })
    );
    expect(loadedProps.allTabs).toHaveLength(1);
    expect(loadedProps.allTabs[0]).toEqual(
      expect.objectContaining({
        label: 'Untitled',
      })
    );
    expect(loadedProps.selectedTabId).toBe(loadedProps.allTabs[0].id);
    expect(urlStateStorage.get).toHaveBeenCalledWith(TAB_STATE_URL_KEY);
    expect(storage.get).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY);
    expect(urlStateStorage.set).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('should update tab state in local storage', () => {
    const { tabsStorageManager, services } = create();
    const storage = services.storage;

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [toStoredTab(mockTab1), toStoredTab(mockTab2)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    jest.spyOn(storage, 'set');

    const updatedTabState = {
      internalState: {},
      attributes: {
        visContext: { someKey: 'updatedValue' } as unknown as UnifiedHistogramVisContext,
        controlGroupState: {},
        timeRestore: false,
      },
      appState: {
        columns: ['a', 'b', 'c'],
      },
      globalState: {
        refreshInterval: { pause: false, value: 300 },
      },
      profileState: undefined,
    };

    tabsStorageManager.updateTabStateLocally(mockTab1.id, updatedTabState);

    expect(storage.set).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [
        {
          ...toStoredTab(mockTab1),
          ...updatedTabState,
        },
        toStoredTab(mockTab2),
      ],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });
  });

  it('should update persistent profile state in local storage', () => {
    const {
      tabsStorageManager,
      services: { storage },
    } = create();

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [
        {
          ...toStoredTab(mockTab1),
          profileState: {
            testProfileState: {
              persistentValue: 'stalePersistent',
            },
          },
        },
      ],
      closedTabs: [],
    });

    jest.spyOn(storage, 'set');

    tabsStorageManager.updateTabStateLocally(mockTab1.id, {
      internalState: mockTab1.initialInternalState,
      attributes: mockTab1.attributes,
      appState: mockTab1.appState,
      globalState: mockTab1.globalState,
      profileState: {
        testProfileState: {
          uiValue: 'ui',
          persistentValue: 'updatedPersistent',
        },
      },
    });

    expect(storage.set).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      discoverSessionId: undefined,
      openTabs: [
        {
          ...toStoredTab(mockTab1),
          internalState: undefined,
          profileState: {
            testProfileState: {
              persistentValue: 'updatedPersistent',
            },
          },
        },
      ],
      closedTabs: [],
    });
  });

  it('should clear stale persistent profile state in local storage', () => {
    const {
      tabsStorageManager,
      services: { storage },
    } = create();

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [
        {
          ...toStoredTab(mockTab1),
          profileState: {
            testProfileState: {
              persistentValue: 'stalePersistent',
            },
          },
        },
      ],
      closedTabs: [],
    });

    jest.spyOn(storage, 'set');

    tabsStorageManager.updateTabStateLocally(mockTab1.id, {
      internalState: mockTab1.initialInternalState,
      attributes: mockTab1.attributes,
      appState: mockTab1.appState,
      globalState: mockTab1.globalState,
      profileState: {
        testProfileState: {
          uiValue: 'ui',
        },
      },
    });

    expect(storage.set).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      discoverSessionId: undefined,
      openTabs: [
        {
          ...toStoredTab(mockTab1),
          internalState: undefined,
        },
      ],
      closedTabs: [],
    });
  });

  it('should limit to N recently closed tabs', () => {
    const { tabsStorageManager } = create();

    const newClosedAt = 15;
    jest.spyOn(Date, 'now').mockReturnValue(newClosedAt);

    const testTabA = {
      ...mockTab1,
      id: 'testTabA',
    };

    const testTabB = {
      ...mockTab1,
      id: 'testTabB',
    };

    // no previously closed tabs
    expect(
      tabsStorageManager.getNRecentlyClosedTabs({
        previousOpenTabs: [mockTab1, testTabA, testTabB],
        previousRecentlyClosedTabs: [],
        nextOpenTabs: [testTabA, testTabB],
      })
    ).toEqual([{ ...mockTab1, closedAt: newClosedAt }]);

    // some previously closed tabs
    expect(
      tabsStorageManager.getNRecentlyClosedTabs({
        previousOpenTabs: [testTabA, mockTab1, testTabB],
        previousRecentlyClosedTabs: [
          { ...mockTab2, closedAt: 1 },
          { ...mockRecentlyClosedTab, closedAt: 100 },
        ],
        nextOpenTabs: [testTabB, testTabA],
      })
    ).toEqual([
      { ...mockRecentlyClosedTab, closedAt: 100 },
      { ...mockTab1, closedAt: newClosedAt },
      { ...mockTab2, closedAt: 1 },
    ]);

    // some previously closed tabs got reopened
    expect(
      tabsStorageManager.getNRecentlyClosedTabs({
        previousOpenTabs: [mockTab1, testTabA],
        previousRecentlyClosedTabs: [{ ...mockTab2, closedAt: 1 }],
        nextOpenTabs: [mockTab2],
      })
    ).toEqual([
      { ...mockTab1, closedAt: newClosedAt },
      { ...testTabA, closedAt: newClosedAt },
      { ...mockTab2, closedAt: 1 },
    ]);

    // over the limit
    const closedAtGroup1 = 40;
    const closedTabsGroup1 = Array.from({ length: 40 }, (_, i) => ({
      ...mockRecentlyClosedTab,
      id: `closedTab (1) ${i}`,
      label: `Closed tab (1) ${i}`,
      closedAt: closedAtGroup1,
    }));
    const closedAtGroup2 = 10;
    const closedTabsGroup2 = Array.from({ length: 10 }, (_, i) => ({
      ...mockRecentlyClosedTab,
      id: `closedTab (2) ${i}`,
      label: `Closed tab (2) ${i}`,
      closedAt: closedAtGroup2,
    }));

    const newClosedTabs = Array.from({ length: 15 }, (_, i) => ({
      ...mockTab1,
      id: `closedTab (new) ${i}`,
      label: `Closed tab (new) ${i}`,
    }));
    expect(
      tabsStorageManager.getNRecentlyClosedTabs({
        previousOpenTabs: [testTabA, testTabB, ...newClosedTabs],
        previousRecentlyClosedTabs: [...closedTabsGroup1, ...closedTabsGroup2],
        nextOpenTabs: [testTabA, testTabB],
      })
    ).toEqual([
      ...closedTabsGroup1,
      ...newClosedTabs.map((tab) => ({ ...tab, closedAt: newClosedAt })),
    ]);
  });

  it('should load open tabs from storage when persisted discover session id matches stored session id', () => {
    const {
      tabsStorageManager,
      urlStateStorage,
      services: { storage },
    } = create();

    const matchingSessionId = 'session-match';

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      discoverSessionId: matchingSessionId,
      openTabs: [toStoredTab(mockTab1), toStoredTab(mockTab2)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: mockTab2.id,
    });

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      persistedDiscoverSession: {
        id: matchingSessionId,
        title: 'title',
        description: 'description',
        managed: false,
        tabs: [],
      },
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps).toEqual({
      allTabs: [toRestoredTab(mockTab1), toRestoredTab(mockTab2)],
      selectedTabId: mockTab2.id,
      recentlyClosedTabs: [toRestoredTab(mockRecentlyClosedTab)],
    });
  });

  it('should load persisted tabs when persisted discover session id differs from stored session id', () => {
    const { tabsStorageManager, urlStateStorage, services } = create();
    const { storage } = services;

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      discoverSessionId: undefined,
      openTabs: [toStoredTab(mockTab1)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: mockTab1.id,
    });

    const persistedTabId = 'persisted-tab';
    const peristedTab = fromSavedSearchToSavedObjectTab({
      tab: { id: persistedTabId, label: 'Persisted tab' },
      savedSearch: savedSearchMock,
      services,
    });
    const persistedDiscoverSession = {
      id: 'persisted-session',
      title: 'title',
      description: 'description',
      managed: false,
      tabs: [peristedTab],
    };

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      persistedDiscoverSession,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps.allTabs.map((t) => t.id)).toEqual([persistedTabId]);
    expect(loadedProps.selectedTabId).toBe(persistedTabId);
    expect(loadedProps.allTabs.find((t) => t.id === mockTab1.id)).toBeUndefined();
  });

  it('should load persisted tabs when persisted discover session id matches stored session id, but target open tab is not found', () => {
    const { tabsStorageManager, urlStateStorage, services } = create();
    const { storage } = services;

    const persistedSessionId = 'persisted-session';

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      discoverSessionId: persistedSessionId,
      openTabs: [toStoredTab(mockTab1)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: 'bad-tab',
    });

    const persistedTabId = 'persisted-tab';
    const peristedTab = fromSavedSearchToSavedObjectTab({
      tab: { id: persistedTabId, label: 'Persisted tab' },
      savedSearch: savedSearchMock,
      services,
    });
    const persistedDiscoverSession = {
      id: persistedSessionId,
      title: 'title',
      description: 'description',
      managed: false,
      tabs: [peristedTab],
    };

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      persistedDiscoverSession,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps.allTabs.map((t) => t.id)).toEqual([persistedTabId]);
    expect(loadedProps.selectedTabId).toBe(persistedTabId);
    expect(loadedProps.allTabs.find((t) => t.id === mockTab1.id)).toBeUndefined();
  });

  it('should not load from recently closed tabs when a persisted discover session is provided', () => {
    const { tabsStorageManager, urlStateStorage, services } = create();
    const { storage } = services;

    const persistedSessionId = 'persisted-session';

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      discoverSessionId: persistedSessionId,
      openTabs: [toStoredTab(mockTab1)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: mockRecentlyClosedTab.id,
    });

    const persistedTabId = 'persisted-tab';
    const peristedTab = fromSavedSearchToSavedObjectTab({
      tab: { id: persistedTabId, label: 'Persisted tab' },
      savedSearch: savedSearchMock,
      services,
    });
    const persistedDiscoverSession = {
      id: persistedSessionId,
      title: 'title',
      description: 'description',
      managed: false,
      tabs: [peristedTab],
    };

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      persistedDiscoverSession,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps.allTabs.map((t) => t.id)).toEqual([persistedTabId]);
    expect(loadedProps.selectedTabId).toBe(persistedTabId);
    expect(loadedProps.allTabs.find((t) => t.id === mockTab1.id)).toBeUndefined();
  });

  it('should load tabs state from local storage and append a new tab', () => {
    const {
      tabsStorageManager,
      urlStateStorage,
      services: { storage },
    } = create();
    jest.spyOn(urlStateStorage, 'get');
    jest.spyOn(storage, 'get');

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [toStoredTab(mockTab1), toStoredTab(mockTab2)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: 'new',
      tabLabel: 'New tab test',
    });

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps.recentlyClosedTabs).toEqual([toRestoredTab(mockRecentlyClosedTab)]);
    expect(loadedProps.allTabs).toHaveLength(3);
    expect(loadedProps.allTabs[0]).toEqual(toRestoredTab(mockTab1));
    expect(loadedProps.allTabs[1]).toEqual(toRestoredTab(mockTab2));
    expect(loadedProps.allTabs[2]).toEqual(
      expect.objectContaining({
        label: 'New tab test',
      })
    );
    expect(loadedProps.selectedTabId).toBe(loadedProps.allTabs[2].id);
    expect(urlStateStorage.get).toHaveBeenCalledWith(TAB_STATE_URL_KEY);
    expect(storage.get).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY);
    expect(urlStateStorage.set).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('should load tabs state from local storage and append a new tab to a discover session', () => {
    const { tabsStorageManager, urlStateStorage, services } = create();
    const { storage } = services;
    jest.spyOn(urlStateStorage, 'get');
    jest.spyOn(storage, 'get');

    const persistedSessionId = 'persisted-session';
    const persistedTabId = 'persisted-tab';
    const persistedTab = fromSavedSearchToSavedObjectTab({
      tab: { id: persistedTabId, label: 'Persisted tab' },
      savedSearch: savedSearchMock,
      services,
    });
    const persistedDiscoverSession = {
      id: persistedSessionId,
      title: 'title',
      description: 'description',
      managed: false,
      tabs: [persistedTab],
    };

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      discoverSessionId: 'other',
      openTabs: [toStoredTab(mockTab1)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: 'new',
      tabLabel: 'New tab test',
    });

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      persistedDiscoverSession,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps.recentlyClosedTabs.map((t) => t.id)).toEqual([
      mockRecentlyClosedTab.id,
      mockTab1.id,
    ]);
    expect(loadedProps.allTabs).toHaveLength(2);
    expect(loadedProps.allTabs[0].id).toBe(persistedTabId);
    expect(loadedProps.allTabs[1]).toEqual(
      expect.objectContaining({
        label: 'New tab test',
      })
    );
    expect(loadedProps.selectedTabId).toBe(loadedProps.allTabs[1].id);
    expect(urlStateStorage.get).toHaveBeenCalledWith(TAB_STATE_URL_KEY);
    expect(storage.get).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY);
    expect(urlStateStorage.set).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('should not append the shared tab to a discover session if it is one the existing persisted tabs', () => {
    const { tabsStorageManager, urlStateStorage, services } = create();
    const { storage } = services;
    jest.spyOn(urlStateStorage, 'get');
    jest.spyOn(storage, 'get');

    const persistedSessionId = 'persisted-session';
    const persistedTabId = 'persisted-tab';
    const persistedTab = fromSavedSearchToSavedObjectTab({
      tab: { id: persistedTabId, label: 'Persisted tab' },
      savedSearch: savedSearchMock,
      services,
    });
    const persistedDiscoverSession = {
      id: persistedSessionId,
      title: 'title',
      description: 'description',
      managed: false,
      tabs: [persistedTab],
    };

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [toStoredTab(mockTab1)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: persistedTabId,
      tabLabel: 'Shared tab',
    });

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      persistedDiscoverSession,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps.recentlyClosedTabs).toHaveLength(2);
    expect(loadedProps.allTabs).toHaveLength(1);
    expect(loadedProps.allTabs[0].id).toBe(persistedTabId);
    expect(loadedProps.allTabs[0].label).toBe('Persisted tab');
    expect(loadedProps.selectedTabId).toBe(persistedTabId);
    expect(urlStateStorage.get).toHaveBeenCalledWith(TAB_STATE_URL_KEY);
    expect(storage.get).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY);
    expect(urlStateStorage.set).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('should append the shared tab to a discover session if it is not one the existing persisted tabs', () => {
    const { tabsStorageManager, urlStateStorage, services } = create();
    const { storage } = services;
    jest.spyOn(urlStateStorage, 'get');
    jest.spyOn(storage, 'get');

    const persistedSessionId = 'persisted-session';
    const persistedTabId = 'persisted-tab';
    const persistedTab = fromSavedSearchToSavedObjectTab({
      tab: { id: persistedTabId, label: 'Persisted tab' },
      savedSearch: savedSearchMock,
      services,
    });
    const persistedDiscoverSession = {
      id: persistedSessionId,
      title: 'title',
      description: 'description',
      managed: false,
      tabs: [persistedTab],
    };

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      discoverSessionId: 'other',
      openTabs: [toStoredTab(mockTab1), toStoredTab(mockTab2)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabId: 'unknown',
      tabLabel: 'Shared tab',
    });

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      persistedDiscoverSession,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps.recentlyClosedTabs).toHaveLength(3);
    expect(loadedProps.allTabs).toHaveLength(2);
    expect(loadedProps.allTabs[0].id).toBe(persistedTabId);
    expect(loadedProps.allTabs[1]).toEqual(
      expect.objectContaining({
        label: 'Shared tab',
      })
    );
    expect(loadedProps.selectedTabId).toBe(loadedProps.allTabs[1].id);
    expect(urlStateStorage.get).toHaveBeenCalledWith(TAB_STATE_URL_KEY);
    expect(storage.get).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY);
    expect(urlStateStorage.set).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('should open the shared link and clear previous temporary tabs', () => {
    const { tabsStorageManager, urlStateStorage, services } = create();
    const { storage } = services;
    jest.spyOn(urlStateStorage, 'get');
    jest.spyOn(storage, 'get');

    storage.set(TABS_LOCAL_STORAGE_KEY, {
      userId: mockUserId,
      spaceId: mockSpaceId,
      openTabs: [toStoredTab(mockTab1)],
      closedTabs: [toStoredTab(mockRecentlyClosedTab)],
    });

    urlStateStorage.set(TAB_STATE_URL_KEY, {
      tabLabel: 'Shared tab',
    });

    jest.spyOn(urlStateStorage, 'set');
    jest.spyOn(storage, 'set');

    const loadedProps = tabsStorageManager.loadLocally({
      userId: mockUserId,
      spaceId: mockSpaceId,
      defaultTabState: DEFAULT_TAB_STATE,
    });

    expect(loadedProps.recentlyClosedTabs).toHaveLength(2);
    expect(loadedProps.allTabs).toHaveLength(1);
    expect(loadedProps.allTabs[0]).toEqual(
      expect.objectContaining({
        label: 'Shared tab',
      })
    );
    expect(loadedProps.selectedTabId).toBe(loadedProps.allTabs[0].id);
    expect(urlStateStorage.get).toHaveBeenCalledWith(TAB_STATE_URL_KEY);
    expect(storage.get).toHaveBeenCalledWith(TABS_LOCAL_STORAGE_KEY);
    expect(urlStateStorage.set).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });
});
