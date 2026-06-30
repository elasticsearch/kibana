/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import { createKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import { discoverServiceMock } from '../../../__mocks__/services';
import type { DiscoverSession } from '@kbn/saved-search-plugin/common';
import { createDataViewDataSource } from '../../../../common/data_sources';
import { fromTabStateToSavedObjectTab, internalStateActions } from './redux';
import type { DiscoverServices } from '../../../build_services';
import { getDiscoverInternalStateMock } from '../../../__mocks__/discover_state.mock';
import { dataViewWithTimefieldMock } from '../../../__mocks__/data_view_with_timefield';
import { getTabStateMock } from './redux/__mocks__/internal_state.mocks';
import { createDiscoverSessionMock } from '@kbn/saved-search-plugin/common/mocks';

describe('Test discover app state', () => {
  const setupNoTab = async ({
    persistedDiscoverSession,
    services,
    stateStorage,
  }: {
    persistedDiscoverSession?: DiscoverSession;
    stateStorage?: IKbnUrlStateStorage;
    services?: DiscoverServices;
  } = {}) => {
    const {
      internalState,
      runtimeStateManager,
      initializeTabs,
      initializeSingleTab,
      getCurrentTab,
      addNewTab,
    } = getDiscoverInternalStateMock({
      stateStorageContainer: stateStorage,
      services,
      persistedDataViews: [dataViewWithTimefieldMock],
    });

    await initializeTabs({ persistedDiscoverSession });

    return { internalState, runtimeStateManager, initializeSingleTab, getCurrentTab, addNewTab };
  };

  const setup = async (...params: Parameters<typeof setupNoTab>) => {
    const setupReturn = await setupNoTab(...params);
    await setupReturn.initializeSingleTab({ tabId: setupReturn.getCurrentTab().id });
    return setupReturn;
  };

  const getPersistedDiscoverSession = ({ services }: { services: DiscoverServices }) => {
    const persistedTab = fromTabStateToSavedObjectTab({
      tab: getTabStateMock({
        id: 'persisted-tab',
        initialInternalState: {
          serializedSearchSource: { index: dataViewWithTimefieldMock.id },
        },
      }),
      services,
      currentDataView: undefined,
    });

    return createDiscoverSessionMock({
      id: 'test-id',
      tabs: [persistedTab],
    });
  };

  test('getPrevious returns the state before the current', async () => {
    const { internalState, getCurrentTab } = await setup();
    internalState.dispatch(
      internalStateActions.setAppState({
        tabId: getCurrentTab().id,
        appState: { dataSource: createDataViewDataSource({ dataViewId: 'first' }) },
      })
    );
    const stateA = getCurrentTab().appState;
    internalState.dispatch(
      internalStateActions.setAppState({
        tabId: getCurrentTab().id,
        appState: { dataSource: createDataViewDataSource({ dataViewId: 'second' }) },
      })
    );
    expect(getCurrentTab().previousAppState).toEqual(stateA);
  });

  test('should automatically set ES|QL data source when query is ES|QL', async () => {
    const { internalState, getCurrentTab } = await setup();
    internalState.dispatch(
      internalStateActions.updateAppState({
        tabId: getCurrentTab().id,
        appState: { dataSource: createDataViewDataSource({ dataViewId: 'test' }) },
      })
    );
    expect(getCurrentTab().appState.dataSource?.type).toBe('dataView');
    internalState.dispatch(
      internalStateActions.updateAppState({
        tabId: getCurrentTab().id,
        appState: { query: { esql: 'from test' } },
      })
    );
    expect(getCurrentTab().appState.dataSource?.type).toBe('esql');
  });

  test('should not allow both chart and table hidden when setting app state', async () => {
    const { internalState, getCurrentTab } = await setup();
    internalState.dispatch(
      internalStateActions.setAppState({
        tabId: getCurrentTab().id,
        appState: {
          ...getCurrentTab().appState,
          hideChart: true,
          hideTable: true,
        },
      })
    );

    expect(getCurrentTab().appState.hideChart).toBe(true);
    expect(getCurrentTab().appState.hideTable).toBe(false);
  });

  describe('initializeAndSync', () => {
    it('should call setProfileStateFieldsToReset correctly with no initial state', async () => {
      const { initializeSingleTab, getCurrentTab } = await setupNoTab();
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual('none');
      await initializeSingleTab({ tabId: getCurrentTab().id, skipWaitForDataFetching: true });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual('all');
    });

    it('should call setProfileStateFieldsToReset correctly with initial columns', async () => {
      const stateStorage = createKbnUrlStateStorage();
      const stateStorageGetSpy = jest.spyOn(stateStorage, 'get');
      stateStorageGetSpy.mockReturnValue({ columns: ['test'] });
      const { initializeSingleTab, getCurrentTab } = await setupNoTab({ stateStorage });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual('none');
      await initializeSingleTab({ tabId: getCurrentTab().id, skipWaitForDataFetching: true });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual([
        'rowHeight',
        'breakdownField',
        'hideChart',
        'hideTable',
        'hideSidebar',
      ]);
    });

    it('should call setProfileStateFieldsToReset correctly with initial rowHeight', async () => {
      const stateStorage = createKbnUrlStateStorage();
      const stateStorageGetSpy = jest.spyOn(stateStorage, 'get');
      stateStorageGetSpy.mockReturnValue({ rowHeight: 5 });
      const { initializeSingleTab, getCurrentTab } = await setupNoTab({ stateStorage });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual('none');
      await initializeSingleTab({ tabId: getCurrentTab().id, skipWaitForDataFetching: true });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual([
        'columns',
        'breakdownField',
        'hideChart',
        'hideTable',
        'hideSidebar',
      ]);
    });

    it('should call setProfileStateFieldsToReset correctly with initial hide chart', async () => {
      const stateStorage = createKbnUrlStateStorage();
      const stateStorageGetSpy = jest.spyOn(stateStorage, 'get');
      stateStorageGetSpy.mockReturnValue({ hideChart: true });
      const { initializeSingleTab, getCurrentTab } = await setupNoTab({ stateStorage });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual('none');
      await initializeSingleTab({ tabId: getCurrentTab().id, skipWaitForDataFetching: true });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual([
        'columns',
        'rowHeight',
        'breakdownField',
        'hideTable',
        'hideSidebar',
      ]);
    });

    it('should reset only hideSidebar for persisted Discover session state not set in the URL', async () => {
      const stateStorage = createKbnUrlStateStorage();
      const stateStorageGetSpy = jest.spyOn(stateStorage, 'get');
      stateStorageGetSpy.mockReturnValue({ columns: ['test'], rowHeight: 5 });
      const { initializeSingleTab, getCurrentTab } = await setupNoTab({
        persistedDiscoverSession: getPersistedDiscoverSession({ services: discoverServiceMock }),
        stateStorage,
      });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual('none');
      await initializeSingleTab({ tabId: getCurrentTab().id, skipWaitForDataFetching: true });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual(['hideSidebar']);
    });

    it('should reset all fields for new tabs in persisted Discover session state', async () => {
      const { initializeSingleTab, getCurrentTab, addNewTab } = await setupNoTab({
        persistedDiscoverSession: getPersistedDiscoverSession({ services: discoverServiceMock }),
      });

      await addNewTab({ tab: getTabStateMock({ id: 'new-tab' }) });

      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual('none');
      await initializeSingleTab({ tabId: getCurrentTab().id, skipWaitForDataFetching: true });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual('all');
    });

    it('should not reset hideSidebar for persisted Discover session state set in the URL', async () => {
      const stateStorage = createKbnUrlStateStorage();
      const stateStorageGetSpy = jest.spyOn(stateStorage, 'get');
      stateStorageGetSpy.mockReturnValue({ hideSidebar: true });
      const { initializeSingleTab, getCurrentTab } = await setupNoTab({
        persistedDiscoverSession: getPersistedDiscoverSession({ services: discoverServiceMock }),
        stateStorage,
      });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual('none');
      await initializeSingleTab({ tabId: getCurrentTab().id, skipWaitForDataFetching: true });
      expect(getCurrentTab().defaultProfileState.fieldsToReset).toEqual('none');
    });
  });
});
