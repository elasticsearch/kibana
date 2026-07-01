/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { dataViewMockWithTimeField } from '@kbn/discover-utils/src/__mocks__';
import { createDiscoverSessionMock } from '@kbn/saved-search-plugin/common/mocks';
import { DataSourceType } from '../../../../../common/data_sources';
import { getDiscoverInternalStateMock } from '../../../../__mocks__/discover_state.mock';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import { getPersistedTabMock } from './__mocks__/internal_state.mocks';
import { createContextAwarenessToolkit } from './context_awareness_toolkit';
import { createTabItem, internalStateActions, selectAllTabs, selectTab, type TabState } from '.';
import { TEST_PROFILE_STATE_DEF } from '../../../../context_awareness/__mocks__/profile_state';

describe('createContextAwarenessToolkit', () => {
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
      },
    });

    await toolkit.initializeTabs({
      persistedDiscoverSession: createDiscoverSessionMock({
        id: 'test-session',
        tabs: [persistedTab],
      }),
    });

    return {
      internalState: toolkit.internalState,
      profileStateRegistry: services.profileStateRegistry,
      tabId: persistedTab.id,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wires updateESQLQuery to updateESQLQuery action with tab id', async () => {
    const { internalState, profileStateRegistry, tabId } = await setup();
    const updateEsqlQuerySpy = jest.spyOn(internalStateActions, 'updateESQLQuery');
    const queryOrUpdater = 'FROM logs-*';

    createContextAwarenessToolkit({
      internalState,
      profileStateRegistry,
      tabId,
    }).actions.updateESQLQuery?.(queryOrUpdater);

    expect(updateEsqlQuerySpy).toHaveBeenCalledWith({ tabId, queryOrUpdater });
  });

  it('wires addFilter to addFilter action with tab id', async () => {
    const { internalState, profileStateRegistry, tabId } = await setup();
    const addFilterSpy = jest.spyOn(internalStateActions, 'addFilter');

    createContextAwarenessToolkit({
      internalState,
      profileStateRegistry,
      tabId,
    }).actions.addFilter?.('status', 200, '+');

    expect(addFilterSpy).toHaveBeenCalledWith({
      tabId,
      field: 'status',
      value: 200,
      mode: '+',
    });
  });

  it('maps setExpandedDoc options.initialTabId to initialDocViewerTabId', async () => {
    const { internalState, profileStateRegistry, tabId } = await setup();
    const setExpandedDocSpy = jest.spyOn(internalStateActions, 'setExpandedDoc');

    createContextAwarenessToolkit({
      internalState,
      profileStateRegistry,
      tabId,
    }).actions.setExpandedDoc?.(undefined, {
      initialTabId: 'overview',
    });

    expect(setExpandedDocSpy).toHaveBeenCalledWith({
      tabId,
      expandedDoc: undefined,
      initialDocViewerTabId: 'overview',
    });
  });

  it('dispatches openInNewTab through openInNewTabExtPointAction', async () => {
    const { internalState, profileStateRegistry, tabId } = await setup();
    const openInNewTabSpy = jest.spyOn(internalStateActions, 'openInNewTabExtPointAction');
    const params = {
      query: { esql: 'FROM logs-*' },
      timeRange: { from: 'now-15m', to: 'now' },
      tabLabel: 'Logs',
    };

    createContextAwarenessToolkit({
      internalState,
      profileStateRegistry,
      tabId,
    }).actions.openInNewTab?.(params);

    expect(openInNewTabSpy).toHaveBeenCalledWith(params);
  });

  it('dispatches refreshData through fetchData with tab id', async () => {
    const { internalState, profileStateRegistry, tabId } = await setup();
    const fetchDataSpy = jest.spyOn(internalStateActions, 'fetchData');

    createContextAwarenessToolkit({
      internalState,
      profileStateRegistry,
      tabId,
    }).actions.refreshData?.();

    expect(fetchDataSpy).toHaveBeenCalledWith({ tabId });
  });

  it('awaits updateAdHocDataViews dispatch', async () => {
    const { internalState, profileStateRegistry, tabId } = await setup();
    const updateAdHocDataViewsSpy = jest.spyOn(internalStateActions, 'updateAdHocDataViews');
    const adHocDataViews = [dataViewMockWithTimeField];

    await createContextAwarenessToolkit({
      internalState,
      profileStateRegistry,
      tabId,
    }).actions.updateAdHocDataViews?.(adHocDataViews);

    expect(updateAdHocDataViewsSpy).toHaveBeenCalledWith(adHocDataViews);
  });

  it('returns an adapter for registered profile state', async () => {
    const { internalState, profileStateRegistry, tabId } = await setup();
    profileStateRegistry.registerDefinition(TEST_PROFILE_STATE_DEF);

    const stateAdapter = createContextAwarenessToolkit({
      internalState,
      profileStateRegistry,
      tabId,
    }).getStateAdapter(TEST_PROFILE_STATE_DEF);

    expect(stateAdapter.getState()).toEqual(TEST_PROFILE_STATE_DEF.defaultState);
    expect(selectTab(internalState.getState(), tabId).profileState).toEqual({});

    const firstState = {
      ...TEST_PROFILE_STATE_DEF.defaultState,
      uiValue: 'primary',
      nestedValue: { count: 50 },
    };
    stateAdapter.setState(firstState);
    expect(stateAdapter.getState()).toEqual(firstState);
    expect(selectTab(internalState.getState(), tabId).profileState).toEqual({
      testProfileState: firstState,
    });

    stateAdapter.updateState({ nestedValue: { count: 100 } });
    expect(stateAdapter.getState()).toEqual({ ...firstState, nestedValue: { count: 100 } });
  });

  it('emits profile state updates', async () => {
    const { internalState, profileStateRegistry, tabId } = await setup();
    profileStateRegistry.registerDefinition(TEST_PROFILE_STATE_DEF);
    const stateAdapter = createContextAwarenessToolkit({
      internalState,
      profileStateRegistry,
      tabId,
    }).getStateAdapter(TEST_PROFILE_STATE_DEF);
    const emittedValues: TabState['profileState'][string][] = [];
    const subscription = stateAdapter.getState$().subscribe((state) => emittedValues.push(state));

    const firstState = {
      ...TEST_PROFILE_STATE_DEF.defaultState,
      uiValue: 'primary',
      nestedValue: { count: 50 },
    };
    stateAdapter.setState(firstState);
    stateAdapter.updateState({ nestedValue: { count: 100 } });
    subscription.unsubscribe();

    expect(emittedValues).toEqual([
      TEST_PROFILE_STATE_DEF.defaultState,
      firstState,
      { ...firstState, nestedValue: { count: 100 } },
    ]);
  });

  it('isolates profile state between tabs', async () => {
    const { internalState, profileStateRegistry, tabId } = await setup();
    profileStateRegistry.registerDefinition(TEST_PROFILE_STATE_DEF);
    const allTabs = selectAllTabs(internalState.getState());
    const otherTab = createTabItem(allTabs);

    await internalState.dispatch(
      internalStateActions.updateTabs({
        items: [...allTabs, otherTab],
        selectedItem: otherTab,
      })
    );

    const firstTabStateAdapter = createContextAwarenessToolkit({
      internalState,
      profileStateRegistry,
      tabId,
    }).getStateAdapter(TEST_PROFILE_STATE_DEF);
    const otherTabStateAdapter = createContextAwarenessToolkit({
      internalState,
      profileStateRegistry,
      tabId: otherTab.id,
    }).getStateAdapter(TEST_PROFILE_STATE_DEF);

    const firstState = {
      ...TEST_PROFILE_STATE_DEF.defaultState,
      uiValue: 'primary',
      nestedValue: { count: 50 },
    };
    firstTabStateAdapter.setState(firstState);

    expect(firstTabStateAdapter.getState()).toEqual(firstState);
    expect(otherTabStateAdapter.getState()).toEqual(TEST_PROFILE_STATE_DEF.defaultState);
    expect(selectTab(internalState.getState(), otherTab.id).profileState).toEqual({});
  });
});
