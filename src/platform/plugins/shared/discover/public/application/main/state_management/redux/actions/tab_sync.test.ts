/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject, Subject } from 'rxjs';
import type { ProjectRouting } from '@kbn/es-query';
import { dataViewMockWithTimeField } from '@kbn/discover-utils/src/__mocks__';
import { createDiscoverSessionMock } from '@kbn/saved-search-plugin/common/mocks';
import { createDiscoverServicesMock } from '../../../../../__mocks__/services';
import { getDiscoverInternalStateMock } from '../../../../../__mocks__/discover_state.mock';
import {
  internalStateActions,
  selectTab,
  selectTabRuntimeState,
  TabInitializationStatus,
} from '..';
import { getTabRuntimeStateMock } from '../__mocks__/runtime_state.mocks';
import { getPersistedTabMock } from '../__mocks__/internal_state.mocks';
import * as tabSyncApi from './tab_sync';
import * as createTabPersistableStateObservableModule from '../../utils/create_tab_persistable_state_observable';
import * as resolveDataViewModule from '../../utils/resolve_data_view';
import type { TabPersistableState } from '../../utils/create_tab_persistable_state_observable';

const { initializeAndSync, stopSyncing } = tabSyncApi;

const setup = async () => {
  const services = createDiscoverServicesMock();
  const toolkit = getDiscoverInternalStateMock({
    services,
    persistedDataViews: [dataViewMockWithTimeField],
  });

  const persistedTab = getPersistedTabMock({
    dataView: dataViewMockWithTimeField,
    services,
  });
  const persistedDiscoverSession = createDiscoverSessionMock({
    id: 'test-session',
    tabs: [persistedTab],
  });

  await toolkit.initializeTabs({ persistedDiscoverSession });

  return {
    ...toolkit,
    tabId: persistedTab.id,
    persistedDiscoverSession,
  };
};

describe('tab_sync actions', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('initializeAndSync', () => {
    it('should initialize and sync tab state', async () => {
      const previousUnsubscribeFn = jest.fn();
      const { tabId, initializeSingleTab, runtimeStateManager } = await setup();
      const tabRuntimeState = selectTabRuntimeState(runtimeStateManager, tabId);
      tabRuntimeState.unsubscribeFn$.next(previousUnsubscribeFn);

      const initializeAndSyncSpy = jest.spyOn(tabSyncApi, 'initializeAndSync');

      await initializeSingleTab({ tabId });

      expect(initializeAndSyncSpy).toHaveBeenCalledWith({ tabId });
      expect(previousUnsubscribeFn).toHaveBeenCalled();
      expect(tabRuntimeState.unsubscribeFn$.getValue()).toStrictEqual(expect.any(Function));
      expect(tabRuntimeState.unsubscribeFn$.getValue()).not.toBe(previousUnsubscribeFn);
    });

    it('should not sync or apply global state when the tab is disconnected during initialization', async () => {
      const originalLoadAndResolveDataView = resolveDataViewModule.loadAndResolveDataView;
      const loadDataViewStarted = Promise.withResolvers<void>();
      const releaseDataViewLoad = Promise.withResolvers<void>();
      const { internalState, services, tabId, initializeSingleTab } = await setup();

      jest
        .spyOn(resolveDataViewModule, 'loadAndResolveDataView')
        .mockImplementation(async (params) => {
          loadDataViewStarted.resolve(undefined);
          await releaseDataViewLoad.promise;

          return originalLoadAndResolveDataView(params);
        });

      const initializeAndSyncSpy = jest.spyOn(tabSyncApi, 'initializeAndSync');
      const fetchDataSpy = jest.spyOn(internalStateActions, 'fetchData');

      const initializeSingleTabPromise = initializeSingleTab({
        tabId,
        skipWaitForDataFetching: true,
      });

      await loadDataViewStarted.promise;

      internalState.dispatch(internalStateActions.disconnectTab({ tabId }));

      expect(selectTab(internalState.getState(), tabId).initializationState).toEqual({
        initializationStatus: TabInitializationStatus.Disconnected,
      });

      releaseDataViewLoad.resolve(undefined);
      await initializeSingleTabPromise;

      expect(selectTab(internalState.getState(), tabId).initializationState).toEqual({
        initializationStatus: TabInitializationStatus.Disconnected,
      });
      expect(initializeAndSyncSpy).not.toHaveBeenCalled();
      expect(fetchDataSpy).not.toHaveBeenCalled();
      expect(selectTab(internalState.getState(), tabId).forceFetchOnSelect).toBe(true);
      expect(services.filterManager.setGlobalFilters).not.toHaveBeenCalled();
      expect(services.filterManager.setAppFilters).not.toHaveBeenCalled();
      expect(services.data.query.queryString.setQuery).not.toHaveBeenCalled();
      expect(services.timefilter.setTime).not.toHaveBeenCalled();
      expect(services.timefilter.setRefreshInterval).not.toHaveBeenCalled();
    });

    it('should keep disconnected status when initialization rejects after the tab is disconnected', async () => {
      const loadDataViewStarted = Promise.withResolvers<void>();
      const rejectDataViewLoad = Promise.withResolvers<void>();
      const { internalState, tabId, initializeSingleTab } = await setup();

      jest.spyOn(resolveDataViewModule, 'loadAndResolveDataView').mockImplementation(async () => {
        loadDataViewStarted.resolve(undefined);
        await rejectDataViewLoad.promise;

        throw new Error('boom');
      });

      const initializeSingleTabPromise = initializeSingleTab({
        tabId,
        skipWaitForDataFetching: true,
      });

      await loadDataViewStarted.promise;

      internalState.dispatch(internalStateActions.disconnectTab({ tabId }));

      expect(selectTab(internalState.getState(), tabId).initializationState).toEqual({
        initializationStatus: TabInitializationStatus.Disconnected,
      });

      rejectDataViewLoad.resolve(undefined);
      await initializeSingleTabPromise;

      expect(selectTab(internalState.getState(), tabId).initializationState).toEqual({
        initializationStatus: TabInitializationStatus.Disconnected,
      });
    });

    it('should throw error when state container is not initialized', async () => {
      const { internalState, runtimeStateManager, tabId } = await setup();

      // Create a tab runtime state without a state container
      runtimeStateManager.tabs.byId[tabId] = getTabRuntimeStateMock();

      expect(() => {
        internalState.dispatch(
          initializeAndSync({
            tabId,
          })
        );
      }).toThrow(/Data state container is not initialized/);
    });
  });

  describe('stopSyncing', () => {
    it('should stop syncing and call unsubscribe on tab runtime state', async () => {
      const { internalState, runtimeStateManager, tabId } = await setup();

      const tabRuntimeState = getTabRuntimeStateMock();
      runtimeStateManager.tabs.byId[tabId] = tabRuntimeState;

      const mockUnsubscribe = jest.fn();
      tabRuntimeState.unsubscribeFn$.next(mockUnsubscribe);

      internalState.dispatch(
        stopSyncing({
          tabId,
        })
      );

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(tabRuntimeState.unsubscribeFn$.getValue()).toBeUndefined();
    });
  });

  describe('state observables subscriptions', () => {
    it('should skip the initial CPS project routing emission and fetch on later changes', async () => {
      const { services, tabId, initializeSingleTab } = await setup();
      const cpsManager = services.cps?.cpsManager!;
      const projectRouting$ = new BehaviorSubject<ProjectRouting>(undefined);
      const getProjectRoutingSpy = jest
        .spyOn(cpsManager, 'getProjectRouting$')
        .mockReturnValue(projectRouting$);
      const markNonActiveTabsForRefetchSpy = jest.spyOn(
        internalStateActions,
        'markNonActiveTabsForRefetch'
      );
      const fetchDataSpy = jest.spyOn(internalStateActions, 'fetchData');

      await initializeSingleTab({ tabId });

      expect(getProjectRoutingSpy).toHaveBeenCalled();
      expect(markNonActiveTabsForRefetchSpy).not.toHaveBeenCalled();

      fetchDataSpy.mockClear();
      projectRouting$.next('next-project');

      expect(markNonActiveTabsForRefetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchDataSpy).toHaveBeenCalledWith({ tabId });
    });

    it('should subscribe to createTabPersistableStateObservable for syncing locally persisted tab state', async () => {
      const mockTabState$: Subject<TabPersistableState> = new Subject();
      const createTabPersistableStateObservableSpy = jest
        .spyOn(createTabPersistableStateObservableModule, 'createTabPersistableStateObservable')
        .mockReturnValue(mockTabState$);

      const { tabId, initializeSingleTab } = await setup();

      await initializeSingleTab({ tabId });

      expect(createTabPersistableStateObservableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId,
          internalState$: expect.any(Object),
          getState: expect.any(Function),
        })
      );

      // Verify that the observable is subscribed
      expect(mockTabState$.observed).toBe(true);
    });

    it('should dispatch syncLocallyPersistedTabState when tabState observable emits', async () => {
      const mockTabState$: Subject<TabPersistableState> = new Subject();
      jest
        .spyOn(createTabPersistableStateObservableModule, 'createTabPersistableStateObservable')
        .mockReturnValue(mockTabState$);

      // Spy on the action creator before initialization
      const syncLocallyPersistedTabStateSpy = jest.spyOn(
        internalStateActions,
        'syncLocallyPersistedTabState'
      );

      const { tabId, initializeSingleTab, getCurrentTab } = await setup();

      await initializeSingleTab({ tabId });

      // Clear any calls that happened during initialization
      syncLocallyPersistedTabStateSpy.mockClear();

      const { appState, globalState, attributes, profileState } = getCurrentTab();
      const nextState = { appState, globalState, attributes, profileState };

      // Emit a state change
      mockTabState$.next(nextState);

      // Verify the action creator was called with the correct tabId
      expect(syncLocallyPersistedTabStateSpy).toHaveBeenCalledWith({ tabId });
    });

    it('should unsubscribe from tabStateSubscription when stopSyncing is called', async () => {
      const mockTabState$: Subject<TabPersistableState> = new Subject();
      jest
        .spyOn(createTabPersistableStateObservableModule, 'createTabPersistableStateObservable')
        .mockReturnValue(mockTabState$);

      const { tabId, initializeSingleTab, runtimeStateManager } = await setup();

      await initializeSingleTab({ tabId });

      const tabRuntimeState = selectTabRuntimeState(runtimeStateManager, tabId);
      const unsubscribeFn = tabRuntimeState.unsubscribeFn$.getValue();

      expect(mockTabState$.observed).toBe(true);

      unsubscribeFn?.();

      expect(mockTabState$.observed).toBe(false);
    });
  });
});
