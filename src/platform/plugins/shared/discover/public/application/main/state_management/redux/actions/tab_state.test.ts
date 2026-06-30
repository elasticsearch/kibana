/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getDiscoverInternalStateMock } from '../../../../../__mocks__/discover_state.mock';
import { type DiscoverAppState, internalStateActions, selectTab } from '..';
import { DataSourceType } from '../../../../../../common/data_sources';
import { APP_STATE_URL_KEY } from '../../../../../../common';
import { GLOBAL_STATE_URL_KEY } from '../../../../../../common/constants';
import { createDiscoverServicesMock } from '../../../../../__mocks__/services';
import { dataViewMockWithTimeField } from '@kbn/discover-utils/src/__mocks__';
import { createDiscoverSessionMock } from '@kbn/saved-search-plugin/common/mocks';
import { mockControlState } from '../../../../../__mocks__/esql_controls';
import { getPersistedTabMock } from '../__mocks__/internal_state.mocks';
import { selectDataSourceProfileId } from '../runtime_state';

const setup = async () => {
  const services = createDiscoverServicesMock();
  const toolkit = getDiscoverInternalStateMock({
    services,
    persistedDataViews: [dataViewMockWithTimeField],
  });

  const persistedTab = getPersistedTabMock({
    dataView: dataViewMockWithTimeField,
    services,
    appStateOverrides: {
      query: { esql: 'FROM test-index' },
      dataSource: { type: DataSourceType.Esql },
      columns: ['field1', 'field2'],
    },
  });

  await toolkit.initializeTabs({
    persistedDiscoverSession: createDiscoverSessionMock({
      id: 'test-session',
      tabs: [persistedTab],
    }),
  });
  await toolkit.initializeSingleTab({ tabId: persistedTab.id });

  return {
    ...toolkit,
    tabId: persistedTab.id,
  };
};

describe('tab_state actions', () => {
  describe('setAppState', () => {
    it('should sync snapshotsByProfileId for the current profile', async () => {
      const { internalState, runtimeStateManager, tabId } = await setup();
      const profileId = selectDataSourceProfileId(runtimeStateManager, tabId);

      internalState.dispatch(
        internalStateActions.setAppState({
          tabId,
          appState: {
            query: { language: 'kuery', query: 'response:200' },
            columns: ['message'],
            rowHeight: 3,
            breakdownField: 'extension',
            hideChart: true,
          },
        })
      );

      const snapshotsByProfileId = selectTab(internalState.getState(), tabId).defaultProfileState
        .snapshotsByProfileId;

      expect(snapshotsByProfileId[profileId]).toEqual({
        columns: ['message'],
        rowHeight: 3,
        breakdownField: 'extension',
        hideChart: true,
      });
    });
  });

  describe('syncProfileStateSnapshot', () => {
    it('should sync snapshotsByProfileId for the current profile when triggered separately', async () => {
      const { internalState, runtimeStateManager, tabId } = await setup();
      const profileId = selectDataSourceProfileId(runtimeStateManager, tabId);
      const snapshotsByProfileId = selectTab(internalState.getState(), tabId).defaultProfileState
        .snapshotsByProfileId;

      internalState.dispatch(
        internalStateActions.setAppState({
          tabId,
          appState: {
            columns: ['message'],
            hideChart: true,
          },
          isSystemTriggered: true,
        })
      );

      expect(
        selectTab(internalState.getState(), tabId).defaultProfileState.snapshotsByProfileId
      ).toBe(snapshotsByProfileId);

      internalState.dispatch(internalStateActions.syncProfileStateSnapshot({ tabId }));

      const currentSnapshotsByProfileId = selectTab(internalState.getState(), tabId)
        .defaultProfileState.snapshotsByProfileId;

      expect(currentSnapshotsByProfileId[profileId]).not.toBeUndefined();
      expect(currentSnapshotsByProfileId[profileId]?.columns).toEqual(['message']);
      expect(currentSnapshotsByProfileId[profileId]?.hideChart).toBe(true);
    });
  });

  describe('updateAppStateAndReplaceUrl', () => {
    it('should only sync changed app state fields after replacing the URL for the active tab', async () => {
      const { internalState, runtimeStateManager, stateStorageContainer, tabId } = await setup();
      const profileId = selectDataSourceProfileId(runtimeStateManager, tabId);

      internalState.dispatch(
        internalStateActions.setAppState({
          tabId,
          appState: {
            columns: ['field1'],
            rowHeight: 3,
          },
        })
      );

      internalState.dispatch(
        internalStateActions.setAppState({
          tabId,
          appState: {
            columns: ['field1'],
            rowHeight: 8,
          },
          isSystemTriggered: true,
        })
      );

      await internalState.dispatch(
        internalStateActions.updateAppStateAndReplaceUrl({
          tabId,
          appState: {
            columns: ['message'],
          },
        })
      );

      const currentTab = selectTab(internalState.getState(), tabId);
      const persistedAppState = stateStorageContainer.get<DiscoverAppState>(APP_STATE_URL_KEY);

      expect(persistedAppState).toEqual(currentTab.appState);
      expect(currentTab.appState.columns).toEqual(['message']);
      expect(currentTab.appState.rowHeight).toBe(8);
      expect(currentTab.defaultProfileState.snapshotsByProfileId[profileId]).toEqual({
        columns: ['message'],
        rowHeight: 3,
      });
    });

    it('should not sync snapshotsByProfileId after replacing the URL for system-triggered updates', async () => {
      const { internalState, runtimeStateManager, tabId } = await setup();
      const profileId = selectDataSourceProfileId(runtimeStateManager, tabId);

      internalState.dispatch(
        internalStateActions.setAppState({
          tabId,
          appState: {
            columns: ['field1'],
          },
        })
      );

      await internalState.dispatch(
        internalStateActions.updateAppStateAndReplaceUrl({
          tabId,
          appState: {
            columns: ['field2'],
          },
          isSystemTriggered: true,
        })
      );

      const snapshotsByProfileId = selectTab(internalState.getState(), tabId).defaultProfileState
        .snapshotsByProfileId;

      expect(snapshotsByProfileId[profileId]).toEqual({
        breakdownField: undefined,
        columns: ['field1'],
        hideChart: undefined,
        rowHeight: undefined,
      });
    });
  });

  describe('pushCurrentTabStateToUrl', () => {
    it('should write the current tab state to the URL even when state is unchanged', async () => {
      const { internalState, stateStorageContainer, tabId } = await setup();
      const currentTab = selectTab(internalState.getState(), tabId);
      const setUrlStateSpy = jest.spyOn(stateStorageContainer, 'set');

      await internalState.dispatch(internalStateActions.pushCurrentTabStateToUrl({ tabId }));

      expect(setUrlStateSpy).toHaveBeenCalledWith(APP_STATE_URL_KEY, currentTab.appState, {
        replace: true,
      });
      expect(setUrlStateSpy).toHaveBeenCalledWith(
        GLOBAL_STATE_URL_KEY,
        {
          time: currentTab.globalState.timeRange,
          refreshInterval: currentTab.globalState.refreshInterval,
          filters: currentTab.globalState.filters,
        },
        {
          replace: true,
        }
      );
      expect(stateStorageContainer.get<DiscoverAppState>(APP_STATE_URL_KEY)).toEqual(
        currentTab.appState
      );
    });
  });

  describe('transitionFromESQLToDataView', () => {
    it('should transition from ES|QL mode to Data View mode', async () => {
      const { internalState, runtimeStateManager, tabId } = await setup();
      const profileId = selectDataSourceProfileId(runtimeStateManager, tabId);
      const dataViewId = 'test-data-view-id';
      let state = internalState.getState();
      let tab = selectTab(state, tabId);
      const prevDefaultProfileState = tab.defaultProfileState;

      expect(tab.appState.query).toStrictEqual({ esql: 'FROM test-index' });
      expect(tab.appState.columns).toHaveLength(2);
      expect(tab.appState.dataSource).toStrictEqual({
        type: DataSourceType.Esql,
      });

      expect(prevDefaultProfileState.fieldsToReset).toBe('none');
      expect(typeof prevDefaultProfileState.resetId).toBe('string');
      expect(prevDefaultProfileState.resetId).not.toEqual('');
      expect(prevDefaultProfileState.snapshotsByProfileId[profileId]).toEqual({
        breakdownField: '',
        columns: ['field1', 'field2'],
        hideChart: false,
        hideTable: false,
        hideSidebar: undefined,
        rowHeight: undefined,
      });

      // Transition to data view mode
      internalState.dispatch(
        internalStateActions.transitionFromESQLToDataView({
          tabId,
          dataViewId,
        })
      );

      // Get the updated tab state
      state = internalState.getState();
      tab = selectTab(state, tabId);

      // Verify the state was updated correctly
      expect(tab.appState.query).toStrictEqual({
        language: 'kuery',
        query: '',
      });
      expect(tab.appState.columns).toEqual([]);
      expect(tab.appState.dataSource).toStrictEqual({
        type: DataSourceType.DataView,
        dataViewId,
      });

      expect(tab.defaultProfileState.fieldsToReset).toBe('all');
      expect(typeof tab.defaultProfileState.resetId).toBe('string');
      expect(tab.defaultProfileState.snapshotsByProfileId[profileId]).toEqual({
        breakdownField: '',
        columns: [],
        hideChart: false,
        hideTable: false,
        hideSidebar: undefined,
        rowHeight: undefined,
      });
      expect(tab.defaultProfileState.resetId).not.toEqual(prevDefaultProfileState.resetId);
      expect(tab.defaultProfileState.resetId).not.toEqual('');
    });
  });

  describe('transitionFromDataViewToESQL', () => {
    it('should transition from Data View mode to ES|QL mode', async () => {
      const { internalState, runtimeStateManager, tabId } = await setup();
      const profileId = selectDataSourceProfileId(runtimeStateManager, tabId);
      const dataView = dataViewMockWithTimeField;

      const query = { query: "foo: 'bar'", language: 'kuery' };
      const filters = [{ meta: { index: 'the-data-view-id' }, query: { match_all: {} } }];
      internalState.dispatch(
        internalStateActions.setGlobalState({
          tabId,
          globalState: { filters },
        })
      );
      internalState.dispatch(
        internalStateActions.setAppState({
          tabId,
          appState: {
            query,
            dataSource: {
              type: DataSourceType.DataView,
              dataViewId: 'the-data-view-id',
            },
            sort: [
              ['@timestamp', 'asc'],
              ['bytes', 'desc'],
            ],
          },
        })
      );

      let state = internalState.getState();
      let tab = selectTab(state, tabId);
      const prevDefaultProfileState = tab.defaultProfileState;

      expect(tab.appState.query).toStrictEqual(query);
      expect(tab.appState.sort).toEqual([
        ['@timestamp', 'asc'],
        ['bytes', 'desc'],
      ]);
      expect(tab.globalState.filters).toStrictEqual(filters);
      expect(tab.appState.filters).toBeUndefined();
      expect(tab.appState.dataSource).toStrictEqual({
        type: DataSourceType.DataView,
        dataViewId: 'the-data-view-id',
      });

      expect(prevDefaultProfileState.fieldsToReset).toBe('none');
      expect(typeof prevDefaultProfileState.resetId).toBe('string');
      expect(prevDefaultProfileState.resetId).not.toEqual('');
      expect(prevDefaultProfileState.snapshotsByProfileId[profileId]).toEqual({
        breakdownField: undefined,
        columns: undefined,
        hideChart: undefined,
        hideTable: undefined,
        rowHeight: undefined,
      });

      // Transition to ES|QL mode
      internalState.dispatch(
        internalStateActions.transitionFromDataViewToESQL({
          tabId,
          dataView,
        })
      );

      // Get the updated tab state
      state = internalState.getState();
      tab = selectTab(state, tabId);

      // Verify the state was updated correctly
      expect(tab.appState.query).toStrictEqual({
        esql: 'FROM the-data-view-title | WHERE KQL("""foo: \'bar\'""")',
      });
      expect(tab.appState.sort).toEqual([['bytes', 'desc']]);
      expect(tab.globalState.filters).toStrictEqual([]);
      expect(tab.appState.filters).toStrictEqual([]);
      expect(tab.appState.dataSource).toStrictEqual({
        type: DataSourceType.Esql,
      });

      expect(tab.defaultProfileState.fieldsToReset).toBe('all');
      expect(typeof tab.defaultProfileState.resetId).toBe('string');
      expect(tab.defaultProfileState.snapshotsByProfileId[profileId]).toEqual({
        breakdownField: undefined,
        columns: [],
        hideChart: undefined,
        hideTable: undefined,
        rowHeight: undefined,
      });
      expect(tab.defaultProfileState.resetId).not.toEqual(prevDefaultProfileState.resetId);
      expect(tab.defaultProfileState.resetId).not.toEqual('');
    });
  });

  describe('updateESQLQuery', () => {
    it('should update the ES|QL query string', async () => {
      const { internalState, tabId } = await setup();

      let state = internalState.getState();
      let tab = selectTab(state, tabId);

      expect(tab.appState.query).toStrictEqual({ esql: 'FROM test-index' });

      // Update the ES|QL query string
      internalState.dispatch(
        internalStateActions.updateESQLQuery({
          tabId,
          queryOrUpdater: 'FROM test-index | WHERE status = 200',
        })
      );

      // Get the updated tab state
      state = internalState.getState();
      tab = selectTab(state, tabId);

      // Verify the query string was updated correctly
      expect(tab.appState.query).toStrictEqual({ esql: 'FROM test-index | WHERE status = 200' });
    });

    it('should update the ES|QL query string using an updater function', async () => {
      const { internalState, tabId } = await setup();

      let state = internalState.getState();
      let tab = selectTab(state, tabId);

      expect(tab.appState.query).toStrictEqual({ esql: 'FROM test-index' });

      // Update the ES|QL query string using an updater function
      internalState.dispatch(
        internalStateActions.updateESQLQuery({
          tabId,
          queryOrUpdater: (currentQuery) => {
            return currentQuery + ' | WHERE status = 404';
          },
        })
      );

      // Get the updated tab state
      state = internalState.getState();
      tab = selectTab(state, tabId);

      // Verify the query string was updated correctly
      expect(tab.appState.query).toStrictEqual({ esql: 'FROM test-index | WHERE status = 404' });
    });
  });

  describe('updateAttributes', () => {
    it('should update individual tab attributes', async () => {
      const { internalState, tabId } = await setup();

      let state = internalState.getState();
      let tab = selectTab(state, tabId);

      expect(tab.attributes.controlGroupState).toBeUndefined();

      // Update the hideChart attribute
      internalState.dispatch(
        internalStateActions.updateAttributes({
          tabId,
          attributes: {
            controlGroupState: mockControlState,
          },
        })
      );

      // Get the updated tab state
      state = internalState.getState();
      tab = selectTab(state, tabId);

      // Verify the controlGroupState attribute was updated correctly
      expect(tab.attributes).toStrictEqual({
        controlGroupState: mockControlState,
        visContext: undefined,
        timeRestore: false,
      });
    });

    it('should not overwrite existing attributes when updating', async () => {
      const { internalState, tabId } = await setup();

      let state = internalState.getState();
      let tab = selectTab(state, tabId);

      expect(tab.attributes.visContext).toBeUndefined();
      const visContext = { some: 'context' };

      internalState.dispatch(
        internalStateActions.updateAttributes({
          tabId,
          attributes: {
            visContext,
          },
        })
      );

      internalState.dispatch(
        internalStateActions.updateAttributes({
          tabId,
          attributes: {
            controlGroupState: mockControlState,
          },
        })
      );

      // Get the updated tab state
      state = internalState.getState();
      tab = selectTab(state, tabId);

      // Verify the visContext attribute was not overwritten
      expect(tab.attributes.visContext).toBe(visContext);
      // Verify the controlGroupState attribute was updated correctly
      expect(tab.attributes.controlGroupState).toBe(mockControlState);
    });

    it('should not update attributes if they are the same', async () => {
      const { internalState, tabId } = await setup();

      let state = internalState.getState();
      let tab = selectTab(state, tabId);

      expect(tab.attributes.visContext).toBeUndefined();
      const visContext = { some: 'context' };

      internalState.dispatch(
        internalStateActions.updateAttributes({
          tabId,
          attributes: {
            visContext,
          },
        })
      );

      // Capture state after first update
      state = internalState.getState();
      tab = selectTab(state, tabId);
      expect(tab.attributes.visContext).toBe(visContext);

      const stateAfterFirstUpdate = state;

      // Dispatch the same update again
      internalState.dispatch(
        internalStateActions.updateAttributes({
          tabId,
          attributes: {
            visContext,
          },
        })
      );

      // Get the updated tab state
      state = internalState.getState();
      tab = selectTab(state, tabId);

      // Verify the state has not changed
      expect(state).toBe(stateAfterFirstUpdate);
      // Verify the visContext attribute remains the same
      expect(tab.attributes.visContext).toBe(visContext);
    });
  });
});
