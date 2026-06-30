/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../../../../../context_awareness/toolkit';
import { getDiscoverInternalStateMock } from '../../../../../__mocks__/discover_state.mock';
import { createDiscoverServicesMock } from '../../../../../__mocks__/services';
import { dataViewMockWithTimeField } from '@kbn/discover-utils/src/__mocks__';
import { createDiscoverSessionMock } from '@kbn/saved-search-plugin/common/mocks';
import { getPersistedTabMock } from '../__mocks__/internal_state.mocks';
import { createTabItem } from '../utils';
import {
  createRuntimeStateManager,
  selectAllTabs,
  selectTab,
  internalStateActions,
  DEFAULT_TAB_STATE,
} from '..';
import * as runtimeStateModule from '../runtime_state';
import * as contextAwarenessToolkitModule from '../context_awareness_toolkit';

const setup = async () => {
  const services = createDiscoverServicesMock();
  const runtimeStateManager = createRuntimeStateManager();
  const toolkit = getDiscoverInternalStateMock({
    services,
    runtimeStateManager,
    persistedDataViews: [dataViewMockWithTimeField],
  });

  const persistedTab = getPersistedTabMock({
    dataView: dataViewMockWithTimeField,
    services,
  });

  await toolkit.initializeTabs({
    persistedDiscoverSession: createDiscoverSessionMock({
      id: 'test-session',
      tabs: [persistedTab],
    }),
  });

  return toolkit;
};

describe('tabs actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('openInNewTabExtPointAction', () => {
    it('maps ext point params into a new tab state', async () => {
      const { internalState } = await setup();
      const initialTabs = selectAllTabs(internalState.getState());
      const params = {
        query: { esql: 'FROM logs-* | LIMIT 10' },
        timeRange: {
          from: 'now-15m',
          to: 'now',
        },
        tabLabel: 'Logs',
      };

      await internalState.dispatch(internalStateActions.openInNewTabExtPointAction(params));

      const tabs = selectAllTabs(internalState.getState());
      const newTab = tabs[tabs.length - 1];

      expect(tabs).toHaveLength(initialTabs.length + 1);
      expect(newTab.label).toBe('Logs');
      expect(newTab.appState.query).toEqual(params.query);
      expect(newTab.globalState.timeRange).toEqual(params.timeRange);
    });
  });

  describe('setTabs', () => {
    it('passes per-tab context awareness toolkit into createTabRuntimeState', async () => {
      const { internalState, runtimeStateManager, getCurrentTab } = await setup();
      const currentTab = getCurrentTab();
      const allTabs = selectAllTabs(internalState.getState());
      const newTab = {
        ...DEFAULT_TAB_STATE,
        ...createTabItem(allTabs),
      };
      const expectedToolkit = EMPTY_CONTEXT_AWARENESS_TOOLKIT;

      jest
        .spyOn(contextAwarenessToolkitModule, 'createContextAwarenessToolkit')
        .mockReturnValue(expectedToolkit);
      const createTabRuntimeStateSpy = jest.spyOn(runtimeStateModule, 'createTabRuntimeState');

      internalState.dispatch(
        internalStateActions.setTabs({
          allTabs: [...allTabs, newTab],
          selectedTabId: currentTab.id,
          recentlyClosedTabs: [],
        })
      );

      expect(createTabRuntimeStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolkit: expectedToolkit,
        })
      );

      expect(runtimeStateManager.tabs.byId[newTab.id]).toBeDefined();
    });
  });

  describe('updateTabs', () => {
    it('copies profile state when duplicating a tab', async () => {
      const { internalState, getCurrentTab } = await setup();
      const currentTab = getCurrentTab();
      const allTabs = selectAllTabs(internalState.getState());

      internalState.dispatch(
        internalStateActions.setProfileState({
          tabId: currentTab.id,
          key: 'testProfileState',
          profileState: { color: 'primary' },
        })
      );

      const duplicatedTab = {
        ...createTabItem(allTabs),
        duplicatedFromId: currentTab.id,
      };

      await internalState.dispatch(
        internalStateActions.updateTabs({
          items: [...allTabs, duplicatedTab],
          selectedItem: duplicatedTab,
        })
      );

      expect(selectTab(internalState.getState(), duplicatedTab.id).profileState).toEqual({
        testProfileState: { color: 'primary' },
      });
    });

    it('starts fresh tabs with empty profile state', async () => {
      const { internalState } = await setup();
      const allTabs = selectAllTabs(internalState.getState());
      const newTab = createTabItem(allTabs);

      await internalState.dispatch(
        internalStateActions.updateTabs({
          items: [...allTabs, newTab],
          selectedItem: newTab,
        })
      );

      expect(selectTab(internalState.getState(), newTab.id).profileState).toEqual({});
    });

    it('resets profile state when restoring a recently closed tab', async () => {
      const { internalState, getCurrentTab } = await setup();
      const currentTab = getCurrentTab();
      const allTabs = selectAllTabs(internalState.getState());
      const remainingTab = {
        ...DEFAULT_TAB_STATE,
        ...createTabItem(allTabs),
      };

      internalState.dispatch(
        internalStateActions.setTabs({
          allTabs: [...allTabs, remainingTab],
          selectedTabId: currentTab.id,
          recentlyClosedTabs: [],
        })
      );
      internalState.dispatch(
        internalStateActions.setProfileState({
          tabId: currentTab.id,
          key: 'testProfileState',
          profileState: { color: 'primary' },
        })
      );
      internalState.dispatch(
        internalStateActions.setTabs({
          allTabs: [remainingTab],
          selectedTabId: remainingTab.id,
          recentlyClosedTabs: [],
        })
      );

      const restoredTab = {
        ...createTabItem([remainingTab]),
        restoredFromId: currentTab.id,
      };

      await internalState.dispatch(
        internalStateActions.updateTabs({
          items: [remainingTab, restoredTab],
          selectedItem: restoredTab,
        })
      );

      expect(selectTab(internalState.getState(), restoredTab.id).profileState).toEqual({});
    });
  });
});
