/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { cloneDeep, omit } from 'lodash';
import { map } from 'rxjs';
import type {
  DiscoverStateMockParams,
  InternalStateMockToolkit,
} from '../../../__mocks__/discover_state.mock';
import { createSearchSessionRestorationDataProvider } from './utils/create_search_session_restoration_data_provider';
import {
  fromSavedSearchToSavedObjectTab,
  fromTabStateToSavedObjectTab,
  internalStateActions,
  selectHasUnsavedChanges,
  selectTabRuntimeState,
  createRuntimeStateManager,
  selectTabSavedSearch,
  selectAllTabs,
} from './redux';
import type { History } from 'history';
import { createBrowserHistory, createMemoryHistory } from 'history';
import { createSearchSourceMock } from '@kbn/data-plugin/public/mocks';
import { FilterManager } from '@kbn/data-plugin/public';
import type { SavedSearch, SortOrder } from '@kbn/saved-search-plugin/public';
import {
  savedSearchAdHoc,
  savedSearchMock,
  savedSearchMockWithTimeField,
  savedSearchMockWithTimeFieldNew,
  savedSearchMockWithESQL,
} from '../../../__mocks__/saved_search';
import { createDiscoverServicesMock } from '../../../__mocks__/services';
import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import { waitFor } from '@testing-library/react';
import { FetchStatus } from '../../types';
import { dataViewAdHoc, dataViewComplexMock } from '../../../__mocks__/data_view_complex';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import {
  createKbnUrlStateStorage,
  setStateToKbnUrl,
  Storage,
} from '@kbn/kibana-utils-plugin/public';
import { scopedHistoryMock } from '@kbn/core/public/mocks';
import { mockCustomizationContext } from '../../../customizations/__mocks__/customization_context';
import { createDataViewDataSource, createEsqlDataSource } from '../../../../common/data_sources';
import type { DiscoverServices, HistoryLocationState } from '../../../build_services';
import {
  getDiscoverInternalStateMock,
  getDiscoverStateMock,
  initializeDataStateInDiscoverStateMock,
  createDataStateContainer,
} from '../../../__mocks__/discover_state.mock';
import { getConnectedCustomizationService } from '../../../customizations';
import type { DiscoverSession } from '@kbn/saved-search-plugin/common';
import { VIEW_MODE } from '@kbn/saved-search-plugin/common';
import { DiscoverTabType } from '@kbn/discover-utils';
import { createDiscoverSessionMock } from '@kbn/saved-search-plugin/common/mocks';
import type { Filter, TimeRange } from '@kbn/es-query';
import { FILTERS } from '@kbn/es-query';
import { DataView } from '@kbn/data-views-plugin/common';
import type { SerializableRecord } from '@kbn/utility-types';
import { getTabStateMock } from './redux/__mocks__/internal_state.mocks';
import { PROFILE_STATE_URL_KEY } from '../../../../common/constants';
import {
  ProfileStateType,
  type ProfileStateDefinition,
} from '../../../../common/context_awareness';
import type { DiscoverSessionApiClassicTab, DiscoverSessionApiResponse } from '../../../../server';
import { fromDiscoverSessionApiResponse } from '../../../session/session_conversions';
import { createSessionService } from '../../../session/session_service';
import type {
  DiscoverSessionClient,
  DiscoverSessionRequestData,
} from '../../../session/api_client';
import { TABS_LOCAL_STORAGE_KEY } from './tabs_storage_manager';
import { appLocatorGetLocationCommon } from '../../../../common/app_locator_get_location';

interface MultiUrlProfileState extends SerializableRecord {
  firstUrlValue: string;
  secondUrlValue: string;
  persistentValue: string;
}

const MULTI_URL_PROFILE_STATE_DEF: ProfileStateDefinition<MultiUrlProfileState> = {
  key: 'multiUrlProfileState',
  descriptor: {
    firstUrlValue: { type: ProfileStateType.Url },
    secondUrlValue: { type: ProfileStateType.Url },
    persistentValue: { type: ProfileStateType.Persistent },
  },
  defaultState: {
    firstUrlValue: 'defaultFirstUrl',
    secondUrlValue: 'defaultSecondUrl',
    persistentValue: 'defaultPersistent',
  },
};

jest.mock('../data_fetching/fetch_documents', () => ({
  fetchDocuments: jest.fn().mockResolvedValue({ records: [] }),
}));

jest.mock('../data_fetching/fetch_esql', () => ({
  fetchEsql: jest.fn().mockResolvedValue({ records: [] }),
}));

jest.mock('@kbn/ebt-tools', () => ({
  reportPerformanceMetricEvent: jest.fn(),
}));

async function getState(
  url: string = '/',
  {
    savedSearch,
    services: testServices,
  }: { savedSearch?: SavedSearch; services?: DiscoverServices } = {}
) {
  const nextHistory = createBrowserHistory<HistoryLocationState>();
  nextHistory.push(url);

  const services = testServices ?? createDiscoverServicesMock();
  services.data.query.timefilter.timefilter.getTime = jest.fn(() => {
    return { from: 'now-15d', to: 'now' };
  });
  services.data.query.timefilter.timefilter.getRefreshInterval = jest.fn(() => {
    return { pause: true, value: 1000 };
  });
  if (savedSearch) {
    services.data.search.searchSource.create = jest.fn().mockReturnValue(savedSearch.searchSource);
  }
  const runtimeStateManager = createRuntimeStateManager();
  const nextState = getDiscoverStateMock({
    savedSearch: savedSearch ?? false,
    runtimeStateManager,
    history: nextHistory,
    services,
  });
  nextState.internalState.dispatch(
    internalStateActions.setInitializationState({ hasESData: true, hasUserDataView: true })
  );
  const getCurrentUrl = () => nextHistory.createHref(nextHistory.location);
  return {
    services,
    history: nextHistory,
    state: nextState,
    customizationService: await getConnectedCustomizationService({
      customizationCallbacks: [],
      internalState: nextState.internalState,
      injectCurrentTab: nextState.injectCurrentTab,
      getCurrentTab: nextState.getCurrentTab,
      runtimeStateManager: nextState.runtimeStateManager,
      stateStorage: nextState.stateStorage,
      services,
    }),
    runtimeStateManager,
    getCurrentUrl,
  };
}

describe('Discover state', () => {
  describe('Test discover state', () => {
    let history: History<HistoryLocationState>;
    let state: DiscoverStateMockParams;
    const getCurrentUrl = () => history.createHref(history.location);

    beforeEach(async () => {
      history = createBrowserHistory();
      history.push('/');
      state = getDiscoverStateMock({ history });
      initializeDataStateInDiscoverStateMock(state); // Required: initializeAndSync expects dataStateContainer to exist
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.updateAppStateAndReplaceUrl)({ appState: {} })
      );
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeAndSync)()
      );
    });

    afterEach(() => {
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.disconnectTab)());
    });

    test('setting app state and syncing to URL', async () => {
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.updateAppState)({
          appState: {
            dataSource: createDataViewDataSource({ dataViewId: 'index-pattern-with-timefield-id' }),
          },
        })
      );
      await new Promise(process.nextTick);
      expect(getCurrentUrl()).toMatchInlineSnapshot(
        `"/#?_tab=(tabId:the-saved-search-id-with-timefield)&_a=(columns:!(default_column),dataSource:(dataViewId:index-pattern-with-timefield-id,type:dataView),grid:(),hideChart:!f,hideTable:!f,interval:auto,query:(language:kuery,query:''),sort:!(!(timestamp,desc)))&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15m,to:now))"`
      );
    });

    test('changing URL to be propagated to appState', async () => {
      history.push('/#?_a=(dataSource:(dataViewId:index-pattern-with-timefield-id,type:dataView))');
      expect(state.getCurrentTab().appState).toMatchInlineSnapshot(`
              Object {
                "dataSource": Object {
                  "dataViewId": "index-pattern-with-timefield-id",
                  "type": "dataView",
                },
              }
          `);
    });

    test('URL navigation to url without _a, state should not change', async () => {
      history.push('/#?_a=(dataSource:(dataViewId:index-pattern-with-timefield-id,type:dataView))');
      history.push('/');
      expect(state.getCurrentTab().appState).toEqual({
        dataSource: createDataViewDataSource({ dataViewId: 'index-pattern-with-timefield-id' }),
      });
    });

    test('getPreviousAppState returns the state before the current', async () => {
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.updateAppState)({
          appState: {
            dataSource: createDataViewDataSource({ dataViewId: 'first' }),
          },
        })
      );
      const stateA = state.getCurrentTab().appState;
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.updateAppState)({
          appState: {
            dataSource: createDataViewDataSource({ dataViewId: 'second' }),
          },
        })
      );
      expect(state.getCurrentTab().previousAppState).toEqual(stateA);
    });

    test('pauseAutoRefreshInterval sets refreshInterval.pause to true', async () => {
      history.push('/#?_g=(refreshInterval:(pause:!f,value:5000))');
      expect(getCurrentUrl()).toBe('/#?_g=(refreshInterval:(pause:!f,value:5000))');
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.assignNextDataView)({
          dataView: dataViewMock,
        })
      );
      await new Promise(process.nextTick);
      expect(getCurrentUrl()).toBe('/#?_g=(refreshInterval:(pause:!t,value:5000))');
    });
  });

  describe('Test discover state with overridden state storage', () => {
    let history: History<HistoryLocationState>;
    let stateStorage: IKbnUrlStateStorage;
    let state: DiscoverStateMockParams;

    beforeEach(async () => {
      jest.useFakeTimers();
      history = createMemoryHistory({
        initialEntries: [
          {
            pathname: '/',
            hash: `?_a=()`,
          },
        ],
      });
      stateStorage = createKbnUrlStateStorage({
        history,
        useHash: false,
        useHashQuery: true,
      });
      state = getDiscoverStateMock({ stateStorageContainer: stateStorage, history });
      initializeDataStateInDiscoverStateMock(state); // Required: initializeAndSync expects dataStateContainer to exist
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.updateAppStateAndReplaceUrl)({ appState: {} })
      );
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeAndSync)()
      );
    });

    afterEach(() => {
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
      jest.useRealTimers();
    });

    test('setting app state and syncing to URL', async () => {
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.updateAppState)({
          appState: {
            dataSource: createDataViewDataSource({ dataViewId: 'index-pattern-with-timefield-id' }),
          },
        })
      );

      await jest.runAllTimersAsync();

      expect(history.createHref(history.location)).toMatchInlineSnapshot(
        `"/#?_a=(columns:!(default_column),dataSource:(dataViewId:index-pattern-with-timefield-id,type:dataView),grid:(),hideChart:!f,hideTable:!f,interval:auto,query:(language:kuery,query:''),sort:!(!(timestamp,desc)))&_tab=(tabId:the-saved-search-id-with-timefield)&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15m,to:now))"`
      );
    });

    test('changing URL to be propagated to appState', async () => {
      history.push('/#?_a=(dataSource:(dataViewId:index-pattern-with-timefield-id,type:dataView))');

      await jest.runAllTimersAsync();

      expect(state.getCurrentTab().appState).toMatchInlineSnapshot(`
              Object {
                "dataSource": Object {
                  "dataViewId": "index-pattern-with-timefield-id",
                  "type": "dataView",
                },
              }
          `);
    });
  });

  describe('Test discover initial state sort handling', () => {
    test('Non-empty sort in URL should not be overwritten by saved search sort', async () => {
      const savedSearch = {
        ...savedSearchMockWithTimeField,
        ...{ sort: [['bytes', 'desc']] },
      } as SavedSearch;

      const { state } = await getState('/#?_a=(sort:!(!(timestamp,desc)))', { savedSearch });
      initializeDataStateInDiscoverStateMock(state); // Required: initializeAndSync expects dataStateContainer to exist
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeAndSync)()
      );
      expect(state.getCurrentTab().appState.sort).toEqual([['timestamp', 'desc']]);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('Empty URL should use saved search sort for state', async () => {
      const nextSavedSearch = {
        ...savedSearchMock,
        ...{ sort: [['bytes', 'desc']] as SortOrder[] },
      };
      const { state, customizationService } = await getState('/', { savedSearch: nextSavedSearch });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(state.getCurrentTab().appState.sort).toEqual([['bytes', 'desc']]);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });
  });

  describe('Loading a session with an inline data view', () => {
    const storedFilters: Filter[] = [
      {
        query: { match_phrase: { 'service.name': 'checkout' } },
        meta: {
          index: 'stored-inline-id',
          type: FILTERS.PHRASE,
          key: 'service.name',
          params: { query: 'checkout' },
          disabled: false,
          negate: false,
        },
      },
      {
        query: { match_phrase: { 'host.name': 'worker-1' } },
        meta: {
          index: 'other-data-view',
          type: FILTERS.PHRASE,
          key: 'host.name',
          params: { query: 'worker-1' },
          disabled: false,
          negate: true,
        },
      },
    ];
    const apiFilters: DiscoverSessionApiClassicTab['filters'] = [
      {
        type: 'condition',
        condition: { field: 'service.name', operator: 'is', value: 'checkout' },
        disabled: false,
      },
      {
        type: 'condition',
        condition: {
          field: 'host.name',
          operator: 'is',
          value: 'worker-1',
          negate: true,
        },
        data_view_id: 'other-data-view',
        disabled: false,
      },
    ];
    const response: DiscoverSessionApiResponse = {
      id: 'inline-session',
      data: {
        title: 'Inline session',
        description: '',
        tabs: [
          {
            id: 'inline-tab',
            label: 'Logs',
            type: DiscoverTabType.Default,
            data_source: { type: 'data_view_spec', index_pattern: 'logs-*' },
            query: { language: 'kql', expression: '' },
            filters: apiFilters,
            sort: [],
            column_order: [],
            view_mode: VIEW_MODE.DOCUMENT_LEVEL,
            hide_chart: true,
            hide_table: false,
          },
        ],
      },
      meta: { managed: false },
    };
    const legacySession = createDiscoverSessionMock({
      id: response.id,
      title: response.data.title,
      description: '',
      tabs: [
        {
          id: 'inline-tab',
          label: 'Logs',
          sort: [],
          columns: [],
          grid: {},
          hideChart: true,
          hideTable: false,
          isTextBasedQuery: false,
          usesAdHocDataView: true,
          serializedSearchSource: {
            index: { id: 'stored-inline-id', title: 'logs-*' },
            query: { language: 'kuery', query: '' },
            filter: cloneDeep(storedFilters),
          },
        },
      ],
    });
    const states: InternalStateMockToolkit[] = [];

    // Use real DataView serialization, including the defaults added to an inline spec.
    const createState = (services: DiscoverServices) => {
      const filterManager = new FilterManager(services.uiSettings);
      services.filterManager = filterManager;
      services.data.query.filterManager = filterManager;
      // The query-service mock does not forward filter updates to the tab state.
      services.data.query.state$ = filterManager.getUpdates$().pipe(
        map(() => ({
          state: { filters: filterManager.getFilters() },
          changes: { filters: true, appFilters: true, globalFilters: true },
        }))
      );
      const state = getDiscoverInternalStateMock({ services, tabsStorageEnabled: true });
      jest.spyOn(services.dataViews, 'create').mockImplementation(async (spec) => {
        return new DataView({ spec, fieldFormats: services.fieldFormats });
      });
      states.push(state);
      return state;
    };

    const expectLoadedFilters = (
      services: DiscoverServices,
      inlineDataViewId: string | undefined
    ) => {
      // FilterManager adds metadata; check the conditions and references without relying on it.
      expect(services.filterManager.getFilters()).toMatchObject([
        {
          query: { match_phrase: { 'service.name': 'checkout' } },
          meta: { index: inlineDataViewId, disabled: false, negate: false },
        },
        {
          query: { match_phrase: { 'host.name': 'worker-1' } },
          meta: { index: 'other-data-view', disabled: false, negate: true },
        },
      ]);
    };

    beforeEach(() => {
      localStorage.removeItem(TABS_LOCAL_STORAGE_KEY);
    });

    afterEach(() => {
      for (const state of states) {
        for (const tab of selectAllTabs(state.internalState.getState())) {
          state.internalState.dispatch(internalStateActions.disconnectTab({ tabId: tab.id }));
        }
      }
      states.length = 0;
      localStorage.removeItem(TABS_LOCAL_STORAGE_KEY);
    });

    it.each([
      { source: 'legacy', loadSession: () => cloneDeep(legacySession) },
      { source: 'HTTP', loadSession: () => fromDiscoverSessionApiResponse(cloneDeep(response)) },
    ])('does not show unsaved changes after $source refresh', async ({ loadSession }) => {
      const services = createDiscoverServicesMock();
      services.storage = new Storage(localStorage);
      services.history = createMemoryHistory();
      const firstLoad = createState(services);

      // The UI still loads through the legacy entry point; supply the prepared HTTP data there.
      await firstLoad.initializeTabs({ persistedDiscoverSession: loadSession() });
      const tabId = firstLoad.getCurrentTab().id;
      await firstLoad.initializeSingleTab({ tabId });

      expect(
        selectHasUnsavedChanges(firstLoad.internalState.getState(), {
          runtimeStateManager: firstLoad.runtimeStateManager,
          services,
        }).hasUnsavedChanges
      ).toBe(false);

      const dataViewBeforeRefresh = selectTabRuntimeState(
        firstLoad.runtimeStateManager,
        tabId
      ).currentDataView$.getValue();
      expect(dataViewBeforeRefresh?.id).toBeDefined();
      expectLoadedFilters(services, dataViewBeforeRefresh?.id);

      // Wait for the real storage listener to persist the loaded Data View, including its ID.
      await waitFor(() => {
        expect(services.storage.get(TABS_LOCAL_STORAGE_KEY)).toMatchObject({
          discoverSessionId: response.id,
          openTabs: [
            {
              id: tabId,
              internalState: {
                serializedSearchSource: { index: { id: dataViewBeforeRefresh?.id } },
              },
            },
          ],
        });
      });
      const url = services.history.createHref(services.history.location);
      firstLoad.internalState.dispatch(internalStateActions.disconnectTab({ tabId }));

      // A refresh keeps the URL and storage, but creates fresh services and runtime state.
      const reloadedServices = createDiscoverServicesMock();
      reloadedServices.storage = services.storage;
      reloadedServices.history = createMemoryHistory({ initialEntries: [url] });
      const reloaded = createState(reloadedServices);

      await reloaded.initializeTabs({ persistedDiscoverSession: loadSession() });
      expect(reloaded.getCurrentTab().initialInternalState?.serializedSearchSource?.index).toEqual(
        expect.objectContaining({ id: dataViewBeforeRefresh?.id })
      );
      await reloaded.initializeSingleTab({ tabId });

      expect(
        selectTabRuntimeState(reloaded.runtimeStateManager, tabId).currentDataView$.getValue()?.id
      ).toBe(dataViewBeforeRefresh?.id);
      expectLoadedFilters(reloadedServices, dataViewBeforeRefresh?.id);
      expect(
        selectHasUnsavedChanges(reloaded.internalState.getState(), {
          runtimeStateManager: reloaded.runtimeStateManager,
          services: reloadedServices,
        }).hasUnsavedChanges
      ).toBe(false);
    });

    it.each([
      { views: 'shared', indexPattern: 'logs-*', sameId: true },
      { views: 'different', indexPattern: 'metrics-*', sameId: false },
    ])('keeps $views inline views stable when switching tabs', async ({ indexPattern, sameId }) => {
      const secondTab: DiscoverSessionApiClassicTab = {
        id: 'second-tab',
        label: 'Other logs',
        type: DiscoverTabType.Default,
        data_source: { type: 'data_view_spec', index_pattern: indexPattern },
        query: { language: 'kql', expression: '' },
        filters: cloneDeep(apiFilters),
        sort: [],
        column_order: [],
        view_mode: VIEW_MODE.DOCUMENT_LEVEL,
        hide_chart: true,
        hide_table: false,
      };
      const multiTabResponse = cloneDeep(response);
      multiTabResponse.data.tabs.push(secondTab);
      const services = createDiscoverServicesMock();
      services.storage = new Storage(localStorage);
      services.history = createMemoryHistory();
      const state = createState(services);
      const getUnsavedChanges = () =>
        selectHasUnsavedChanges(state.internalState.getState(), {
          runtimeStateManager: state.runtimeStateManager,
          services,
        });

      await state.initializeTabs({
        persistedDiscoverSession: fromDiscoverSessionApiResponse(multiTabResponse),
      });
      const firstTabId = state.getCurrentTab().id;
      await state.initializeSingleTab({ tabId: firstTabId });
      const firstDataViewId = selectTabRuntimeState(
        state.runtimeStateManager,
        firstTabId
      ).currentDataView$.getValue()?.id;
      expect(firstDataViewId).toEqual(expect.any(String));
      expectLoadedFilters(services, firstDataViewId);

      await state.initializeSingleTab({ tabId: secondTab.id });
      const secondDataViewId = selectTabRuntimeState(
        state.runtimeStateManager,
        secondTab.id
      ).currentDataView$.getValue()?.id;
      expect(secondDataViewId).toEqual(expect.any(String));
      expect(firstDataViewId === secondDataViewId).toBe(sameId);
      expectLoadedFilters(services, secondDataViewId);
      expect(getUnsavedChanges()).toEqual({ hasUnsavedChanges: false, unsavedTabIds: [] });

      await state.switchToTab({ tabId: firstTabId });
      expect(
        selectTabRuntimeState(state.runtimeStateManager, firstTabId).currentDataView$.getValue()?.id
      ).toBe(firstDataViewId);
      expectLoadedFilters(services, firstDataViewId);
      expect(getUnsavedChanges()).toEqual({ hasUnsavedChanges: false, unsavedTabIds: [] });

      // Sharing a Data View must not share filter edits between tabs or hide real changes.
      const [inlineFilter, foreignFilter] = services.filterManager.getAppFilters();
      services.filterManager.setAppFilters([
        { ...inlineFilter, meta: { ...inlineFilter.meta, disabled: true } },
        foreignFilter,
      ]);
      await waitFor(() => {
        expect(getUnsavedChanges()).toEqual({
          hasUnsavedChanges: true,
          unsavedTabIds: [firstTabId],
        });
      });

      await state.switchToTab({ tabId: secondTab.id });
      expect(
        selectTabRuntimeState(state.runtimeStateManager, secondTab.id).currentDataView$.getValue()
          ?.id
      ).toBe(secondDataViewId);
      expectLoadedFilters(services, secondDataViewId);
      expect(getUnsavedChanges()).toEqual({
        hasUnsavedChanges: true,
        unsavedTabIds: [firstTabId],
      });

      await state.switchToTab({ tabId: firstTabId });
      expect(services.filterManager.getAppFilters()).toMatchObject([
        { ...inlineFilter, meta: { ...inlineFilter.meta, disabled: true } },
        foreignFilter,
      ]);
      expect(getUnsavedChanges()).toEqual({
        hasUnsavedChanges: true,
        unsavedTabIds: [firstTabId],
      });
    });

    it.each([
      { action: 'Save', copyOnSave: false, savedId: response.id, method: 'upsert' as const },
      { action: 'Save As', copyOnSave: true, savedId: 'copied-session', method: 'create' as const },
    ])('keeps inline IDs after $action and refresh', async ({ copyOnSave, savedId, method }) => {
      const services = createDiscoverServicesMock();
      services.storage = new Storage(localStorage);
      services.history = createMemoryHistory();
      const firstLoad = createState(services);
      await firstLoad.initializeTabs({ persistedDiscoverSession: cloneDeep(legacySession) });
      const tabId = firstLoad.getCurrentTab().id;
      await firstLoad.initializeSingleTab({ tabId });

      const savedResponse = cloneDeep(response);
      savedResponse.id = savedId;
      const respondToSave = async (data: DiscoverSessionRequestData) => {
        expect(data.tabs).toHaveLength(1);
        expect(data.tabs[0]).toMatchObject({
          data_source: { type: 'data_view_spec', index_pattern: 'logs-*' },
          filters: apiFilters,
        });
        expect(data.tabs[0].data_source).not.toHaveProperty('id');
        // Save As assigns a new tab ID; the API still returns the inline spec without its ID.
        savedResponse.data.tabs[0].id = data.tabs[0].id;
        return cloneDeep(savedResponse);
      };
      const apiClient: jest.Mocked<DiscoverSessionClient> = {
        create: jest.fn(respondToSave),
        upsert: jest.fn((_id: string, data: DiscoverSessionRequestData) => respondToSave(data)),
        get: jest.fn(async (_id: string) => ({ ...cloneDeep(savedResponse), resolve: {} })),
      };
      const sessionService = createSessionService({
        apiClient,
        legacyClient: services.savedSearch,
        useHttpApi: true,
      });
      // Exercise HTTP through the existing save boundary without connecting production callers.
      jest
        .spyOn(services.savedSearch, 'saveDiscoverSession')
        .mockImplementation((session, options = {}) => sessionService.save(session, options));

      await firstLoad.saveDiscoverSession({ newCopyOnSave: copyOnSave });

      expect(apiClient[method]).toHaveBeenCalledTimes(1);
      expect(apiClient.get).not.toHaveBeenCalled();
      const savedSession = firstLoad.internalState.getState().persistedDiscoverSession;
      const savedTab = savedSession?.tabs[0];
      const savedDataViewId = savedTab?.serializedSearchSource.filter?.[0].meta.index;
      expect(savedSession?.id).toBe(savedId);
      expect(savedDataViewId).toEqual(expect.any(String));
      expect(savedTab?.serializedSearchSource.index).toEqual(
        expect.objectContaining({ id: savedDataViewId })
      );
      expect(savedTab?.id === tabId).toBe(!copyOnSave);
      expect(savedDataViewId === 'stored-inline-id').toBe(!copyOnSave);
      expect(
        selectHasUnsavedChanges(firstLoad.internalState.getState(), {
          runtimeStateManager: firstLoad.runtimeStateManager,
          services,
        }).hasUnsavedChanges
      ).toBe(false);

      await waitFor(() => {
        expect(services.storage.get(TABS_LOCAL_STORAGE_KEY)).toMatchObject({
          discoverSessionId: savedId,
          openTabs: [
            {
              id: savedTab?.id,
              internalState: { serializedSearchSource: { index: { id: savedDataViewId } } },
            },
          ],
        });
      });
      const url = services.history.createHref(services.history.location);
      firstLoad.internalState.dispatch(
        internalStateActions.disconnectTab({ tabId: firstLoad.getCurrentTab().id })
      );

      const reloadedServices = createDiscoverServicesMock();
      reloadedServices.storage = services.storage;
      reloadedServices.history = createMemoryHistory({ initialEntries: [url] });
      const reloaded = createState(reloadedServices);
      const loadedSession = await sessionService.get(savedId);
      await reloaded.initializeTabs({ persistedDiscoverSession: loadedSession.session });
      const reloadedTabId = reloaded.getCurrentTab().id;
      await reloaded.initializeSingleTab({ tabId: reloadedTabId });

      expect(apiClient.get).toHaveBeenCalledTimes(1);
      expect(apiClient.get).toHaveBeenCalledWith(savedId);
      expect(reloadedTabId).toBe(savedTab?.id);
      expect(
        selectTabRuntimeState(
          reloaded.runtimeStateManager,
          reloadedTabId
        ).currentDataView$.getValue()?.id
      ).toBe(savedDataViewId);
      expectLoadedFilters(reloadedServices, savedDataViewId);
      expect(
        selectHasUnsavedChanges(reloaded.internalState.getState(), {
          runtimeStateManager: reloaded.runtimeStateManager,
          services: reloadedServices,
        }).hasUnsavedChanges
      ).toBe(false);
    });

    it.each([
      { source: 'legacy', loadSession: () => cloneDeep(legacySession) },
      { source: 'HTTP', loadSession: () => fromDiscoverSessionApiResponse(cloneDeep(response)) },
    ])('keeps $source locator loads unchanged without local tabs', async ({ loadSession }) => {
      const services = createDiscoverServicesMock();
      const dataViewSpec = { id: 'stored-inline-id', title: 'logs-*' };
      const location = await appLocatorGetLocationCommon(
        { useHash: false, setStateToKbnUrl, profileStateRegistry: services.profileStateRegistry },
        {
          savedSearchId: response.id,
          tab: { id: 'inline-tab' },
          dataViewSpec,
          filters: cloneDeep(storedFilters),
        }
      );
      services.storage = new Storage(localStorage);
      services.history = createMemoryHistory({ initialEntries: [location.path] });
      jest
        .spyOn(services, 'getScopedHistory')
        .mockReturnValue(scopedHistoryMock.create({ state: location.state }));
      const state = createState(services);

      expect(localStorage.getItem(TABS_LOCAL_STORAGE_KEY)).toBeNull();
      await state.initializeTabs({ persistedDiscoverSession: loadSession() });
      const tabId = state.getCurrentTab().id;

      // Pass on the captured location state as SingleTabView does when initializing the tab.
      const initialTabState = services.initialTabStateService.consume();
      expect(initialTabState?.dataViewSpec).toEqual(dataViewSpec);
      await state.initializeSingleTab({ tabId, dataViewSpec: initialTabState?.dataViewSpec });

      expect(
        selectTabRuntimeState(state.runtimeStateManager, tabId).currentDataView$.getValue()?.id
      ).toBe(dataViewSpec.id);
      expectLoadedFilters(services, dataViewSpec.id);
      expect(
        selectHasUnsavedChanges(state.internalState.getState(), {
          runtimeStateManager: state.runtimeStateManager,
          services,
        }).hasUnsavedChanges
      ).toBe(false);
    });
  });

  describe('Test discover initial profile state handling', () => {
    test('URL profile state defaults override locally persisted profile state before stripping', async () => {
      const services = createDiscoverServicesMock();
      services.profileStateRegistry.registerDefinition(MULTI_URL_PROFILE_STATE_DEF);
      const {
        internalState,
        stateStorageContainer,
        initializeTabs,
        initializeSingleTab,
        getCurrentTab,
        injectCurrentTab,
      } = getDiscoverInternalStateMock({
        persistedDataViews: [dataViewMock],
        services,
      });

      await initializeTabs();
      const tab = getCurrentTab();

      internalState.dispatch(
        internalStateActions.setTabs({
          allTabs: [
            {
              ...tab,
              profileState: {
                [MULTI_URL_PROFILE_STATE_DEF.key]: {
                  firstUrlValue: 'localFirstUrl',
                  persistentValue: 'localPersistent',
                },
              },
            },
          ],
          selectedTabId: tab.id,
          recentlyClosedTabs: [],
        })
      );
      await stateStorageContainer.set(PROFILE_STATE_URL_KEY, {
        [MULTI_URL_PROFILE_STATE_DEF.key]: {
          firstUrlValue: MULTI_URL_PROFILE_STATE_DEF.defaultState.firstUrlValue,
          secondUrlValue: 'urlSecondUrl',
        },
      });

      await initializeSingleTab({ tabId: tab.id, skipWaitForDataFetching: true });

      expect(getCurrentTab().profileState).toEqual({
        [MULTI_URL_PROFILE_STATE_DEF.key]: {
          secondUrlValue: 'urlSecondUrl',
          persistentValue: 'localPersistent',
        },
      });
      internalState.dispatch(injectCurrentTab(internalStateActions.stopSyncing)({}));
    });

    test('restores profile state with tab, locator Persistent, and URL precedence', async () => {
      const services = createDiscoverServicesMock();
      services.profileStateRegistry.registerDefinition(MULTI_URL_PROFILE_STATE_DEF);
      const {
        internalState,
        stateStorageContainer,
        initializeTabs,
        initializeSingleTab,
        getCurrentTab,
        injectCurrentTab,
      } = getDiscoverInternalStateMock({
        persistedDataViews: [dataViewMock],
        services,
      });

      await initializeTabs();
      const tab = getCurrentTab();

      internalState.dispatch(
        internalStateActions.setTabs({
          allTabs: [
            {
              ...tab,
              profileState: {
                [MULTI_URL_PROFILE_STATE_DEF.key]: {
                  firstUrlValue: 'localFirstUrl',
                  persistentValue: 'localPersistent',
                },
              },
            },
          ],
          selectedTabId: tab.id,
          recentlyClosedTabs: [],
        })
      );
      await stateStorageContainer.set(PROFILE_STATE_URL_KEY, {
        [MULTI_URL_PROFILE_STATE_DEF.key]: {
          firstUrlValue: MULTI_URL_PROFILE_STATE_DEF.defaultState.firstUrlValue,
          secondUrlValue: 'urlSecondUrl',
        },
      });

      await initializeSingleTab({
        tabId: tab.id,
        skipWaitForDataFetching: true,
        profileState: {
          [MULTI_URL_PROFILE_STATE_DEF.key]: {
            firstUrlValue: 'ignoredLocatorUrl',
            persistentValue: 'locatorPersistent',
          },
          unknownProfileState: {
            persistentValue: 'ignored',
          },
        },
      });

      expect(getCurrentTab().profileState).toEqual({
        [MULTI_URL_PROFILE_STATE_DEF.key]: {
          secondUrlValue: 'urlSecondUrl',
          persistentValue: 'locatorPersistent',
        },
      });
      internalState.dispatch(injectCurrentTab(internalStateActions.stopSyncing)({}));
    });
  });

  describe('Test discover state with legacy migration', () => {
    test('migration of legacy query ', async () => {
      const { state } = await getState(
        "/#?_a=(query:(query_string:(analyze_wildcard:!t,query:'type:nice%20name:%22yeah%22')))",
        { savedSearch: savedSearchMockWithTimeFieldNew }
      );
      expect(state.getCurrentTab().appState.query).toMatchInlineSnapshot(`
              Object {
                "language": "lucene",
                "query": Object {
                  "query_string": Object {
                    "analyze_wildcard": true,
                    "query": "type:nice name:\\"yeah\\"",
                  },
                },
              }
          `);
    });
  });

  describe('Test createSearchSessionRestorationDataProvider', () => {
    const setupSearchSessionInfoProvider = async ({
      persistedDiscoverSession,
      persistedDataViews,
      services = createDiscoverServicesMock(),
    }: {
      persistedDiscoverSession?: DiscoverSession;
      persistedDataViews?: DataView[];
      services?: DiscoverServices;
    } = {}) => {
      services.profileStateRegistry.registerDefinition(MULTI_URL_PROFILE_STATE_DEF);
      const {
        internalState,
        runtimeStateManager,
        initializeTabs,
        initializeSingleTab,
        getCurrentTab,
      } = getDiscoverInternalStateMock({
        persistedDataViews,
        services,
      });

      await initializeTabs({ persistedDiscoverSession });
      await initializeSingleTab({ tabId: getCurrentTab().id });

      const currentTab = getCurrentTab();
      const scopedProfilesManager = selectTabRuntimeState(
        runtimeStateManager,
        currentTab.id
      ).scopedProfilesManager$.getValue();
      const contexts = scopedProfilesManager.getContexts();
      jest.spyOn(scopedProfilesManager, 'getContexts').mockReturnValue({
        ...contexts,
        dataSourceContext: {
          ...contexts.dataSourceContext,
          profileState: MULTI_URL_PROFILE_STATE_DEF,
        },
      });
      internalState.dispatch(
        internalStateActions.setProfileState({
          tabId: currentTab.id,
          profileStateDefinition: MULTI_URL_PROFILE_STATE_DEF,
          profileState: {
            ...MULTI_URL_PROFILE_STATE_DEF.defaultState,
            firstUrlValue: 'customFirstUrl',
          },
        })
      );

      return createSearchSessionRestorationDataProvider({
        data: services.data,
        getPersistedDiscoverSession: () => internalState.getState().persistedDiscoverSession,
        getCurrentTab,
        getCurrentTabRuntimeState: () =>
          selectTabRuntimeState(runtimeStateManager, getCurrentTab().id),
        profileStateRegistry: services.profileStateRegistry,
        runtimeStateManager,
      });
    };

    describe('session name', () => {
      test('No persisted saved search returns default name', async () => {
        const searchSessionInfoProvider = await setupSearchSessionInfoProvider();
        expect(await searchSessionInfoProvider.getName()).toBe('Discover');
      });

      test('Saved Search with a title returns saved search title', async () => {
        const persistedDiscoverSession = createDiscoverSessionMock({ id: 'id', title: 'Name' });
        const searchSessionInfoProvider = await setupSearchSessionInfoProvider({
          persistedDiscoverSession,
        });
        expect(await searchSessionInfoProvider.getName()).toBe('Name');
      });

      test('Saved Search without a title returns default name', async () => {
        const persistedDiscoverSession = createDiscoverSessionMock({ id: 'id', title: '' });
        const searchSessionInfoProvider = await setupSearchSessionInfoProvider({
          persistedDiscoverSession,
        });
        expect(await searchSessionInfoProvider.getName()).toBe('Discover');
      });
    });

    describe('session state', () => {
      test('restoreState has sessionId and initialState has not', async () => {
        const services = createDiscoverServicesMock();
        const searchSessionId = 'id';
        jest.mocked(services.data.search.session.getSessionId).mockReturnValue(searchSessionId);
        const searchSessionInfoProvider = await setupSearchSessionInfoProvider({ services });
        const { initialState, restoreState } = await searchSessionInfoProvider.getLocatorData();
        expect(initialState.searchSessionId).toBeUndefined();
        expect(restoreState.searchSessionId).toBe(searchSessionId);
      });

      test('restoreState has absoluteTimeRange', async () => {
        const services = createDiscoverServicesMock();
        const relativeTime: TimeRange = { from: 'now-42m', to: 'now', mode: 'relative' };
        const absoluteTime: TimeRange = {
          from: '2025-12-01T00:00:00.000Z',
          to: '2025-12-31T00:00:00.000Z',
          mode: 'absolute',
        };
        jest
          .mocked(services.data.query.timefilter.timefilter.getTime)
          .mockReturnValue(relativeTime);
        jest
          .mocked(services.data.query.timefilter.timefilter.getAbsoluteTime)
          .mockReturnValue(absoluteTime);
        const searchSessionInfoProvider = await setupSearchSessionInfoProvider({ services });
        const { initialState, restoreState } = await searchSessionInfoProvider.getLocatorData();
        expect(initialState.timeRange).toBe(relativeTime);
        expect(restoreState.timeRange).toBe(absoluteTime);
      });

      test('restoreState has paused autoRefresh', async () => {
        const searchSessionInfoProvider = await setupSearchSessionInfoProvider();
        const { initialState, restoreState } = await searchSessionInfoProvider.getLocatorData();
        expect(initialState.refreshInterval).toBe(undefined);
        expect(restoreState.refreshInterval).toEqual({
          pause: true,
          value: 0,
        });
      });

      test('both states include expanded active profile locator state', async () => {
        const searchSessionInfoProvider = await setupSearchSessionInfoProvider();
        const { initialState, restoreState } = await searchSessionInfoProvider.getLocatorData();
        const expectedProfileState = {
          [MULTI_URL_PROFILE_STATE_DEF.key]: {
            firstUrlValue: 'customFirstUrl',
            secondUrlValue: 'defaultSecondUrl',
            persistentValue: 'defaultPersistent',
          },
        };

        expect(initialState.profileState).toEqual(expectedProfileState);
        expect(restoreState.profileState).toEqual(expectedProfileState);
      });

      test('restoreState has persisted data view', async () => {
        const services = createDiscoverServicesMock();
        const persistedDiscoverSession = createDiscoverSessionMock({
          id: 'id',
          tabs: [
            fromTabStateToSavedObjectTab({
              tab: getTabStateMock({
                id: 'persisted-tab',
                initialInternalState: {
                  serializedSearchSource: { index: dataViewMock.id },
                },
              }),
              services,
              currentDataView: undefined,
              tabType: undefined,
            }),
          ],
        });
        const searchSessionInfoProvider = await setupSearchSessionInfoProvider({
          persistedDiscoverSession,
          persistedDataViews: [dataViewMock],
          services,
        });
        const { initialState, restoreState } = await searchSessionInfoProvider.getLocatorData();
        expect(initialState.dataViewSpec).toEqual(undefined);
        expect(restoreState.dataViewSpec).toEqual(undefined);
        expect(initialState.dataViewId).toEqual(dataViewMock.id);
      });

      test('restoreState has temporary data view', async () => {
        const services = createDiscoverServicesMock();
        const persistedDiscoverSession = createDiscoverSessionMock({
          id: 'id',
          tabs: [
            fromTabStateToSavedObjectTab({
              tab: getTabStateMock({
                id: 'adhoc-tab',
                initialInternalState: {
                  serializedSearchSource: { index: dataViewAdHoc.toSpec() },
                },
              }),
              services,
              currentDataView: undefined,
              tabType: undefined,
            }),
          ],
        });
        const searchSessionInfoProvider = await setupSearchSessionInfoProvider({
          persistedDiscoverSession,
          services,
        });
        const { initialState, restoreState } = await searchSessionInfoProvider.getLocatorData();
        expect(initialState.dataViewSpec).toEqual(dataViewAdHoc.toMinimalSpec());
        expect(restoreState.dataViewSpec).toEqual(dataViewAdHoc.toMinimalSpec());
      });
    });
  });

  describe('Test discover searchSessionManager', () => {
    test('getting the next session id', async () => {
      const testServices = createDiscoverServicesMock();
      const { state } = await getState(undefined, {
        services: testServices,
      });
      const nextId = 'id';
      testServices.data.search.session.start = jest.fn(() => nextId);
      initializeDataStateInDiscoverStateMock(state); // Required: initializeAndSync expects dataStateContainer to exist
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeAndSync)()
      );
      expect(state.searchSessionManager.getNextSearchSessionId()).toEqual({
        searchSessionId: nextId,
        isSearchSessionRestored: false,
      });
    });
  });

  describe('Test discover state actions', () => {
    test('fetchData', async () => {
      const { state, customizationService } = await getState('/');
      await state.internalState.dispatch(internalStateActions.loadDataViewList());

      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );

      // Get dataStateContainer created by initializeSingleTab
      const tabRuntimeState = selectTabRuntimeState(
        state.runtimeStateManager,
        state.getCurrentTab().id
      );
      const dataState = tabRuntimeState.dataStateContainer$.getValue()!;

      await waitFor(() => {
        expect(dataState.data$.documents$.value.fetchStatus).toBe(FetchStatus.COMPLETE);
      });
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());

      expect(dataState.data$.totalHits$.value.result).toBe(0);
      expect(dataState.data$.documents$.value.result).toEqual([]);
    });

    test('loadDataViewList', async () => {
      const { state } = await getState('');
      await state.internalState.dispatch(internalStateActions.loadDataViewList());
      expect(state.internalState.getState().savedDataViews.length).toBe(3);
    });

    test('loadSavedSearch with no id given an empty URL', async () => {
      const { state, customizationService, getCurrentUrl, services } = await getState('');
      await state.internalState.dispatch(internalStateActions.loadDataViewList());
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(state.internalState.getState().persistedDiscoverSession?.id).toBeUndefined();
      await new Promise(process.nextTick);
      expect(getCurrentUrl()).toMatchInlineSnapshot(
        `"/#?_tab=(tabId:stable-test-initial-tab-id)&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15d,to:now))&_a=(columns:!(default_column),dataSource:(dataViewId:the-data-view-id,type:dataView),interval:auto,query:(language:kuery,query:''),sort:!())"`
      );
      const { hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services,
      });
      expect(hasUnsavedChanges).toBe(false);
      const currentSavedSearch = await selectTabSavedSearch({
        tabId: state.getCurrentTab().id,
        getState: state.internalState.getState,
        runtimeStateManager: state.runtimeStateManager,
        services,
      });
      expect(omit(currentSavedSearch, 'searchSource')).toMatchInlineSnapshot(`
        Object {
          "breakdownField": "",
          "chartInterval": "auto",
          "columns": Array [
            "default_column",
          ],
          "controlGroupJson": undefined,
          "density": undefined,
          "description": undefined,
          "documentsDisplayMode": undefined,
          "grid": Object {},
          "headerRowHeight": undefined,
          "hideAggregatedPreview": undefined,
          "hideChart": false,
          "hideTable": false,
          "id": undefined,
          "isTextBasedQuery": false,
          "jsonModeSettings": undefined,
          "managed": false,
          "references": undefined,
          "refreshInterval": undefined,
          "rowHeight": undefined,
          "rowsPerPage": undefined,
          "sampleSize": undefined,
          "sharingSavedObjectProps": undefined,
          "sort": Array [],
          "tags": undefined,
          "timeRange": undefined,
          "timeRestore": false,
          "title": undefined,
          "usesAdHocDataView": false,
          "viewMode": undefined,
          "visContext": undefined,
        }
      `);
      expect(currentSavedSearch.searchSource.getSerializedFields()).toMatchInlineSnapshot(`
        Object {
          "filter": Array [],
          "index": "the-data-view-id",
          "query": Object {
            "language": "kuery",
            "query": "",
          },
        }
      `);
      const { currentDataView$ } = selectTabRuntimeState(
        state.runtimeStateManager,
        state.getCurrentTab().id
      );
      expect(currentDataView$.getValue()?.id).toEqual('the-data-view-id');
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('loadNewSavedSearch given an empty URL using loadSavedSearch', async () => {
      const { state, customizationService, getCurrentUrl, services } = await getState('/');
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(state.internalState.getState().persistedDiscoverSession?.id).toBeUndefined();
      await new Promise(process.nextTick);
      expect(getCurrentUrl()).toMatchInlineSnapshot(
        `"/#?_tab=(tabId:stable-test-initial-tab-id)&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15d,to:now))&_a=(columns:!(default_column),dataSource:(dataViewId:the-data-view-id,type:dataView),interval:auto,query:(language:kuery,query:''),sort:!())"`
      );
      const { hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services,
      });
      expect(hasUnsavedChanges).toBe(false);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('loadNewSavedSearch with URL changing interval state', async () => {
      const { state, customizationService, getCurrentUrl, services } = await getState(
        '/#?_a=(interval:month,columns:!(bytes))&_g=()'
      );
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(state.internalState.getState().persistedDiscoverSession?.id).toBeUndefined();
      await new Promise(process.nextTick);
      expect(getCurrentUrl()).toMatchInlineSnapshot(
        `"/#?_a=(columns:!(bytes),dataSource:(dataViewId:the-data-view-id,type:dataView),interval:month,query:(language:kuery,query:''),sort:!())&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15d,to:now))&_tab=(tabId:stable-test-initial-tab-id)"`
      );
      const { hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services,
      });
      expect(hasUnsavedChanges).toBe(false);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('loadSavedSearch with no id, given URL changes state', async () => {
      const { state, customizationService, getCurrentUrl, services } = await getState(
        '/#?_a=(interval:month,columns:!(bytes))&_g=()'
      );
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(state.internalState.getState().persistedDiscoverSession?.id).toBeUndefined();
      await new Promise(process.nextTick);
      expect(getCurrentUrl()).toMatchInlineSnapshot(
        `"/#?_a=(columns:!(bytes),dataSource:(dataViewId:the-data-view-id,type:dataView),interval:month,query:(language:kuery,query:''),sort:!())&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15d,to:now))&_tab=(tabId:stable-test-initial-tab-id)"`
      );
      const { hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services,
      });
      expect(hasUnsavedChanges).toBe(false);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('loadSavedSearch given an empty URL, no state changes', async () => {
      const { state, customizationService, getCurrentUrl, services } = await getState('/', {
        savedSearch: savedSearchMock,
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      await new Promise(process.nextTick);
      expect(state.internalState.getState().persistedDiscoverSession?.id).toBe(
        'the-saved-search-id'
      );
      expect(getCurrentUrl()).toMatchInlineSnapshot(
        `"/#?_tab=(tabId:the-saved-search-id)&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15d,to:now))&_a=(columns:!(default_column),dataSource:(dataViewId:the-data-view-id,type:dataView),grid:(),hideChart:!f,hideTable:!f,interval:auto,query:(language:kuery,query:''),sort:!())"`
      );
      const { hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services,
      });
      expect(hasUnsavedChanges).toBe(false);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('loadSavedSearch given a URL with different interval and columns modifying the state', async () => {
      const url = '/#?_a=(interval:month,columns:!(message))&_g=()';
      const { state, customizationService, getCurrentUrl, services } = await getState(url, {
        savedSearch: savedSearchMock,
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      await new Promise(process.nextTick);
      expect(getCurrentUrl()).toMatchInlineSnapshot(
        `"/#?_a=(columns:!(message),dataSource:(dataViewId:the-data-view-id,type:dataView),grid:(),hideChart:!f,hideTable:!f,interval:month,query:(language:kuery,query:''),sort:!())&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15d,to:now))&_tab=(tabId:the-saved-search-id)"`
      );
      const { hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services,
      });
      expect(hasUnsavedChanges).toBe(true);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('loadSavedSearch given a URL with different time range than the stored one showing as changed', async () => {
      const url = '/#?_g=(time:(from:now-24h%2Fh,to:now))';
      const savedSearch = {
        ...savedSearchMock,
        searchSource: createSearchSourceMock({ index: dataViewMock, filter: [] }),
        timeRestore: true,
        timeRange: { from: 'now-15d', to: 'now' },
      };
      const { state, customizationService, services } = await getState(url, {
        savedSearch,
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      await new Promise(process.nextTick);
      const { hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services,
      });
      expect(hasUnsavedChanges).toBe(true);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('loadSavedSearch given a URL with different refresh interval than the stored one showing as changed', async () => {
      const url = '/#?_g=(time:(from:now-15d,to:now),refreshInterval:(pause:!f,value:1234))';
      const testServices = createDiscoverServicesMock();
      const savedSearch = {
        ...savedSearchMock,
        searchSource: createSearchSourceMock({ index: dataViewMock, filter: [] }),
        timeRestore: true,
        timeRange: { from: 'now-15d', to: 'now' },
        refreshInterval: { pause: false, value: 60000 },
      };
      const { state, customizationService } = await getState(url, {
        savedSearch,
        services: testServices,
      });
      testServices.data.query.timefilter.timefilter.getRefreshInterval = jest.fn(() => {
        return { pause: false, value: 1234 };
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      await new Promise(process.nextTick);
      const { hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services: testServices,
      });
      expect(hasUnsavedChanges).toBe(true);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('loadSavedSearch given a URL with matching time range and refresh interval not showing as changed', async () => {
      const url = '/#?_g=(time:(from:now-15d,to:now),refreshInterval:(pause:!f,value:60000))';
      const testServices = createDiscoverServicesMock();
      const savedSearch = {
        ...savedSearchMock,
        searchSource: createSearchSourceMock({
          index: dataViewMock,
          filter: [],
          query: { query: '', language: 'kuery' },
        }),
        timeRestore: true,
        timeRange: { from: 'now-15d', to: 'now' },
        refreshInterval: { pause: false, value: 60000 },
      };
      const { state, customizationService } = await getState(url, {
        savedSearch,
        services: testServices,
      });
      testServices.data.query.timefilter.timefilter.getRefreshInterval = jest.fn(() => {
        return { pause: false, value: 60000 };
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      await new Promise(process.nextTick);
      const { hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services: testServices,
      });
      expect(hasUnsavedChanges).toBe(false);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('loadSavedSearch ignoring hideChart in URL', async () => {
      const url = '/#?_a=(hideChart:true,columns:!(message))&_g=()';
      const { state, customizationService } = await getState(url, { savedSearch: savedSearchMock });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(state.getCurrentTab().appState.hideChart).toBe(undefined);
    });

    test('loadSavedSearch without id ignoring invalid index in URL, adding a warning toast', async () => {
      const url = '/#?_a=(dataSource:(dataViewId:abc,type:dataView))&_g=()';
      const { state, customizationService, services } = await getState(url);
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      const { currentDataView$ } = selectTabRuntimeState(
        state.runtimeStateManager,
        state.getCurrentTab().id
      );
      expect(currentDataView$.getValue()?.id).toBe('the-data-view-id');
      expect(services.toastNotifications.addWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          'data-test-subj': 'dscDataViewNotFoundShowDefaultWarning',
        })
      );
    });

    test('loadSavedSearch without id containing ES|QL, adding no warning toast with an invalid index', async () => {
      const url =
        "/#?_a=(dataSource:(dataViewId:abcde,type:dataView),query:(esql:'FROM test'))&_g=()";
      const { state, customizationService, services } = await getState(url, {
        savedSearch: {
          ...savedSearchMock,
          id: undefined,
        },
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(state.getCurrentTab().appState.dataSource).toEqual(createEsqlDataSource());
      expect(services.toastNotifications.addWarning).not.toHaveBeenCalled();
    });

    test('loadSavedSearch with id ignoring invalid index in URL, adding a warning toast', async () => {
      const url = '/#?_a=(dataSource:(dataViewId:abc,type:dataView))&_g=()';
      const { state, customizationService, services } = await getState(url, {
        savedSearch: savedSearchMock,
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      const { currentDataView$ } = selectTabRuntimeState(
        state.runtimeStateManager,
        state.getCurrentTab().id
      );
      expect(currentDataView$.getValue()?.id).toBe('the-data-view-id');
      expect(services.toastNotifications.addWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          'data-test-subj': 'dscDataViewNotFoundShowSavedWarning',
        })
      );
    });

    test('loadSavedSearch data view handling', async () => {
      const testServices = createDiscoverServicesMock();
      const { state, customizationService, history } = await getState('/', {
        savedSearch: savedSearchMock,
        services: testServices,
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      let { currentDataView$ } = selectTabRuntimeState(
        state.runtimeStateManager,
        state.getCurrentTab().id
      );
      expect(currentDataView$.getValue()?.id).toBe('the-data-view-id');
      let { hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services: testServices,
      });
      expect(hasUnsavedChanges).toBe(false);
      // Simulate loading a different saved search with time field
      const savedSearchWithTimeField = { ...savedSearchMockWithTimeField, id: savedSearchMock.id };
      testServices.data.search.searchSource.create = jest
        .fn()
        .mockReturnValue(savedSearchWithTimeField.searchSource);
      jest.spyOn(testServices.savedSearch, 'getDiscoverSession').mockResolvedValueOnce({
        ...savedSearchWithTimeField,
        id: savedSearchWithTimeField.id ?? '',
        title: savedSearchWithTimeField.title ?? '',
        description: savedSearchWithTimeField.description ?? '',
        tabs: [
          fromSavedSearchToSavedObjectTab({
            tab: {
              id: savedSearchWithTimeField.id ?? '',
              label: savedSearchWithTimeField.title ?? '',
            },
            savedSearch: savedSearchWithTimeField,
            services: testServices,
          }),
        ],
      });
      await state.internalState.dispatch(
        internalStateActions.initializeTabs({ discoverSessionId: savedSearchWithTimeField.id })
      );
      history.push('/');
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            esqlControls: undefined,
            defaultUrlState: {},
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      ({ currentDataView$ } = selectTabRuntimeState(
        state.runtimeStateManager,
        state.getCurrentTab().id
      ));
      expect(currentDataView$.getValue()?.id).toBe('index-pattern-with-timefield-id');
      ({ hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services: testServices,
      }));
      expect(hasUnsavedChanges).toBe(false);
      // Simulate loading back to original saved search
      testServices.data.search.searchSource.create = jest
        .fn()
        .mockReturnValue(savedSearchMock.searchSource);
      jest.spyOn(testServices.savedSearch, 'getDiscoverSession').mockResolvedValueOnce({
        ...savedSearchMock,
        id: savedSearchMock.id ?? '',
        title: savedSearchMock.title ?? '',
        description: savedSearchMock.description ?? '',
        tabs: [
          fromSavedSearchToSavedObjectTab({
            tab: {
              id: savedSearchMock.id ?? '',
              label: savedSearchMock.title ?? '',
            },
            savedSearch: savedSearchMock,
            services: testServices,
          }),
        ],
      });
      await state.internalState.dispatch(
        internalStateActions.initializeTabs({ discoverSessionId: savedSearchMock.id })
      );
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            esqlControls: undefined,
            defaultUrlState: {
              dataSource: createDataViewDataSource({
                dataViewId: 'index-pattern-with-timefield-id',
              }),
            },
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      ({ currentDataView$ } = selectTabRuntimeState(
        state.runtimeStateManager,
        state.getCurrentTab().id
      ));
      expect(currentDataView$.getValue()?.id).toBe('index-pattern-with-timefield-id');
      ({ hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services: testServices,
      }));
      expect(hasUnsavedChanges).toBe(true);
    });

    test('loadSavedSearch generating a new saved search, updated by ad-hoc data view', async () => {
      const testServices = createDiscoverServicesMock();
      const { state, customizationService } = await getState('/', {
        services: testServices,
      });
      const dataViewSpecMock = {
        id: 'mock-id',
        title: 'mock-title',
        timeFieldName: 'mock-time-field-name',
      };
      const dataViewsCreateMock = testServices.dataViews.create as jest.Mock;
      dataViewsCreateMock.mockResolvedValueOnce({
        ...dataViewMock,
        ...dataViewSpecMock,
        isPersisted: () => false,
        toMinimalSpec: () => dataViewSpecMock,
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: dataViewSpecMock,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(state.internalState.getState().persistedDiscoverSession?.id).toEqual(undefined);
      const { currentDataView$ } = selectTabRuntimeState(
        state.runtimeStateManager,
        state.getCurrentTab().id
      );
      expect(currentDataView$.getValue()?.id).toEqual(dataViewSpecMock.id);
      const currentSavedSearch = await selectTabSavedSearch({
        tabId: state.getCurrentTab().id,
        getState: state.internalState.getState,
        runtimeStateManager: state.runtimeStateManager,
        services: testServices,
      });
      expect(currentSavedSearch.searchSource.getField('index')).toEqual(dataViewSpecMock);
      const { hasUnsavedChanges } = selectHasUnsavedChanges(state.internalState.getState(), {
        runtimeStateManager: state.runtimeStateManager,
        services: testServices,
      });
      expect(hasUnsavedChanges).toBe(false);
      expect(state.runtimeStateManager.adHocDataViews$.getValue().length).toBe(1);
    });

    test('loadSavedSearch resetting query & filters of data service', async () => {
      const { state, customizationService, services } = await getState('/', {
        savedSearch: savedSearchMock,
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(services.data.query.queryString.clearQuery).toHaveBeenCalled();
      expect(services.data.query.filterManager.setAppFilters).toHaveBeenCalledWith([]);
    });

    test('loadSavedSearch setting query & filters of data service if query and filters are persisted', async () => {
      const query = { query: "foo: 'bar'", language: 'kql' };
      const filters = [{ meta: { index: 'the-data-view-id' }, query: { match_all: {} } }];
      const searchSourceWithQueryAndFilters = createSearchSourceMock({
        index: dataViewMock,
        query,
        filter: filters,
      });
      const savedSearchWithQueryAndFilters: SavedSearch = {
        ...savedSearchMock,
        searchSource: searchSourceWithQueryAndFilters,
      };
      const { state, customizationService, services } = await getState('/', {
        savedSearch: savedSearchWithQueryAndFilters,
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(services.data.query.queryString.setQuery).toHaveBeenCalledWith(query);
      expect(services.data.query.filterManager.setAppFilters).toHaveBeenCalledWith(filters);
    });

    test('loadSavedSearch with ad-hoc data view being added to internal state adHocDataViews', async () => {
      const adHocDataViewId = savedSearchAdHoc.searchSource.getField('index')!.id;
      const testServices = createDiscoverServicesMock();
      testServices.dataViews.create = jest.fn().mockImplementation((spec) => {
        return Promise.resolve({
          ...dataViewMock,
          isPersisted: () => false,
          toSpec: () => spec,
          ...spec,
        });
      });
      const { state, customizationService } = await getState('/', {
        savedSearch: savedSearchAdHoc,
        services: testServices,
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(state.getCurrentTab().appState.dataSource).toEqual(
        createDataViewDataSource({ dataViewId: adHocDataViewId! })
      );
      expect(state.runtimeStateManager.adHocDataViews$.getValue()[0].id).toBe(adHocDataViewId);
    });

    test('loadSavedSearch with ES|QL, data view index is not overwritten by URL ', async () => {
      const persistedDataViewId = savedSearchMockWithESQL.searchSource.getField('index')!.id;
      const url = "/#?_a=(dataSource:(dataViewId:'the-data-view-id',type:dataView))&_g=()";
      const { state, customizationService } = await getState(url, {
        savedSearch: savedSearchMockWithESQL,
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      const { currentDataView$ } = selectTabRuntimeState(
        state.runtimeStateManager,
        state.getCurrentTab().id
      );
      expect(persistedDataViewId).toBe(currentDataView$.getValue()?.id);
    });

    test('onChangeDataView', async () => {
      const { state, customizationService, getCurrentUrl } = await getState('/', {
        savedSearch: savedSearchMock,
      });

      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );

      // Get dataStateContainer created by initializeSingleTab and set up spy
      const { currentDataView$, dataStateContainer$ } = selectTabRuntimeState(
        state.runtimeStateManager,
        state.getCurrentTab().id
      );
      const dataState = dataStateContainer$.getValue()!;
      jest.spyOn(dataState, 'fetch');

      await new Promise(process.nextTick);
      // test initial state
      expect(currentDataView$.getValue()?.id).toBe(dataViewMock.id);
      expect(getCurrentUrl()).toContain(dataViewMock.id);

      // change data view
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.changeDataView)({
          dataViewOrDataViewId: dataViewComplexMock.id!,
        })
      );
      await new Promise(process.nextTick);

      // test changed state, fetch should be called for the data view change
      expect(dataState.fetch).toHaveBeenCalledTimes(1);
      expect(state.getCurrentTab().appState.dataSource).toEqual(
        createDataViewDataSource({ dataViewId: dataViewComplexMock.id! })
      );
      expect(currentDataView$.getValue()?.id).toBe(dataViewComplexMock.id);
      // check if the changed data view is reflected in the URL
      expect(getCurrentUrl()).toContain(dataViewComplexMock.id);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('onOpenSavedSearch - same target id', async () => {
      const { state, customizationService, services } = await getState('/', {
        savedSearch: savedSearchMock,
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      let currentSavedSearch = await selectTabSavedSearch({
        tabId: state.getCurrentTab().id,
        getState: state.internalState.getState,
        runtimeStateManager: state.runtimeStateManager,
        services,
      });
      expect(currentSavedSearch.id).toBe(savedSearchMock.id);
      expect(currentSavedSearch.hideChart).toBe(false);
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.updateAppState)({
          appState: { hideChart: true },
        })
      );
      currentSavedSearch = await selectTabSavedSearch({
        tabId: state.getCurrentTab().id,
        getState: state.internalState.getState,
        runtimeStateManager: state.runtimeStateManager,
        services,
      });
      expect(currentSavedSearch.hideChart).toBe(true);
      await state.internalState.dispatch(
        internalStateActions.openDiscoverSession({ discoverSessionId: savedSearchMock.id! })
      );
      currentSavedSearch = await selectTabSavedSearch({
        tabId: state.getCurrentTab().id,
        getState: state.internalState.getState,
        runtimeStateManager: state.runtimeStateManager,
        services,
      });
      expect(currentSavedSearch.id).toBe(savedSearchMock.id);
      expect(currentSavedSearch.hideChart).toBe(false);
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('onOpenSavedSearch - cleanup of previous filter', async () => {
      const testServices = createDiscoverServicesMock();
      const { state, customizationService } = await getState(
        "/#?_g=(filters:!(),refreshInterval:(pause:!t,value:60000),time:(from:now-15m,to:now))&_a=(columns:!(customer_first_name),filters:!(('$state':(store:appState),meta:(alias:!n,disabled:!f,index:ff959d40-b880-11e8-a6d9-e546fe2bba5f,key:customer_first_name,negate:!f,params:(query:Mary),type:phrase),query:(match_phrase:(customer_first_name:Mary)))),hideChart:!f,index:ff959d40-b880-11e8-a6d9-e546fe2bba5f,interval:auto,query:(language:kuery,query:''),sort:!())",
        { savedSearch: savedSearchMock, services: testServices }
      );
      jest.spyOn(testServices.filterManager, 'getAppFilters').mockImplementation(() => {
        return state.getCurrentTab().appState.filters!;
      });
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(state.getCurrentTab().appState.filters).toHaveLength(1);
      await state.internalState.dispatch(
        internalStateActions.openDiscoverSession({ discoverSessionId: savedSearchMock.id! })
      );
      expect(state.getCurrentTab().appState.filters).toBeUndefined();
    });

    test('resetDiscoverSession - when changing data views', async () => {
      const { state, customizationService, runtimeStateManager, getCurrentUrl } = await getState(
        '/',
        {
          savedSearch: savedSearchMock,
        }
      );
      // Load a given persisted saved search
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );

      // Get dataStateContainer created by initializeSingleTab and set up spy
      const tabRuntimeState = selectTabRuntimeState(runtimeStateManager, state.getCurrentTab().id);
      const dataState = tabRuntimeState.dataStateContainer$.getValue()!;
      jest.spyOn(dataState, 'fetch');

      await new Promise(process.nextTick);
      expect(getCurrentUrl()).toBe(
        "/#?_tab=(tabId:the-saved-search-id)&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15d,to:now))&_a=(columns:!(default_column),dataSource:(dataViewId:the-data-view-id,type:dataView),grid:(),hideChart:!f,hideTable:!f,interval:auto,query:(language:kuery,query:''),sort:!())"
      );
      expect(tabRuntimeState.currentDataView$.getValue()?.id).toBe(dataViewMock.id);

      // Change the data view, this should change the URL and trigger a fetch
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.changeDataView)({
          dataViewOrDataViewId: dataViewComplexMock.id!,
        })
      );
      await new Promise(process.nextTick);
      expect(getCurrentUrl()).toMatchInlineSnapshot(
        `"/#?_tab=(tabId:the-saved-search-id)&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15d,to:now))&_a=(columns:!(),dataSource:(dataViewId:data-view-with-various-field-types-id,type:dataView),grid:(),hideChart:!f,hideTable:!f,interval:auto,query:(language:kuery,query:''),sort:!(!(data,desc)))"`
      );
      await waitFor(() => {
        expect(dataState.fetch).toHaveBeenCalledTimes(1);
      });
      expect(tabRuntimeState.currentDataView$.getValue()?.id).toBe(dataViewComplexMock.id);

      // Undo all changes to the saved search, this should trigger a fetch, again
      await state.internalState.dispatch(internalStateActions.resetDiscoverSession());
      await new Promise(process.nextTick);
      expect(getCurrentUrl()).toBe(
        "/#?_tab=(tabId:the-saved-search-id)&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15d,to:now))&_a=(columns:!(default_column),dataSource:(dataViewId:the-data-view-id,type:dataView),grid:(),hideChart:!f,hideTable:!f,interval:auto,query:(language:kuery,query:''),sort:!())"
      );
      await waitFor(() => {
        expect(dataState.fetch).toHaveBeenCalledTimes(2);
      });
      expect(tabRuntimeState.currentDataView$.getValue()?.id).toBe(dataViewMock.id);

      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('resetDiscoverSession with timeRestore', async () => {
      const savedSearch = {
        ...savedSearchMockWithTimeField,
        timeRestore: true,
        refreshInterval: { pause: false, value: 1000 },
        timeRange: { from: 'now-15d', to: 'now-10d' },
      };
      const testServices = createDiscoverServicesMock();
      const { state, customizationService } = await getState('/', {
        savedSearch,
        services: testServices,
      });
      const setTime = jest.fn();
      const setRefreshInterval = jest.fn();
      testServices.data.query.timefilter.timefilter.setTime = setTime;
      testServices.data.query.timefilter.timefilter.setRefreshInterval = setRefreshInterval;
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeSingleTab)({
          initializeSingleTabParams: {
            customizationService,
            dataViewSpec: undefined,
            defaultUrlState: undefined,
            esqlControls: undefined,
            dataStateContainer: createDataStateContainer(state),
          },
        })
      );
      expect(setTime).toHaveBeenCalledTimes(1);
      expect(setTime).toHaveBeenLastCalledWith({ from: 'now-15d', to: 'now-10d' });
      expect(setRefreshInterval).toHaveBeenLastCalledWith({ pause: false, value: 1000 });
      await state.internalState.dispatch(internalStateActions.resetDiscoverSession());
      expect(setTime).toHaveBeenCalledTimes(2);
      expect(setTime).toHaveBeenLastCalledWith({ from: 'now-15d', to: 'now-10d' });
      expect(setRefreshInterval).toHaveBeenCalledWith({ pause: false, value: 1000 });
    });
  });

  describe('Test discover state with embedded mode', () => {
    let history: History<HistoryLocationState>;
    let state: DiscoverStateMockParams;
    const getCurrentUrl = () => history.createHref(history.location);

    beforeEach(async () => {
      history = createBrowserHistory();
      history.push('/');
      state = getDiscoverStateMock({
        history,
        customizationContext: {
          ...mockCustomizationContext,
          displayMode: 'embedded',
        },
      });
      initializeDataStateInDiscoverStateMock(state); // Required: initializeAndSync expects dataStateContainer to exist
      await state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.updateAppStateAndReplaceUrl)({ appState: {} })
      );
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.initializeAndSync)()
      );
    });

    afterEach(() => {
      state.internalState.dispatch(state.injectCurrentTab(internalStateActions.stopSyncing)());
    });

    test('setting app state and syncing to URL', async () => {
      state.internalState.dispatch(
        state.injectCurrentTab(internalStateActions.updateAppState)({
          appState: {
            dataSource: createDataViewDataSource({ dataViewId: 'index-pattern-with-timefield-id' }),
          },
        })
      );
      await new Promise(process.nextTick);
      expect(getCurrentUrl()).toMatchInlineSnapshot(
        `"/?_tab=(tabId:the-saved-search-id-with-timefield)&_a=(columns:!(default_column),dataSource:(dataViewId:index-pattern-with-timefield-id,type:dataView),grid:(),hideChart:!f,hideTable:!f,interval:auto,query:(language:kuery,query:''),sort:!(!(timestamp,desc)))&_g=(refreshInterval:(pause:!t,value:1000),time:(from:now-15m,to:now))"`
      );
    });

    test('changing URL to be propagated to appState', async () => {
      history.push('/?_a=(dataSource:(dataViewId:index-pattern-with-timefield-id,type:dataView))');
      expect(state.getCurrentTab().appState).toMatchObject(
        expect.objectContaining({
          dataSource: createDataViewDataSource({ dataViewId: 'index-pattern-with-timefield-id' }),
        })
      );
    });
  });
});
