/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Subscription } from 'rxjs';
import type { Filter } from '@kbn/es-query';
import { FilterStateStore } from '@kbn/es-query';
import type { FilterManager } from '../filter_manager';
import { getFilter } from '../filter_manager/test_helpers/get_stub_filter';
import { UI_SETTINGS } from '../../../common';
import { coreMock } from '@kbn/core/public/mocks';
import type { BaseStateContainer } from '@kbn/kibana-utils-plugin/public';
import { createStateContainer, Storage } from '@kbn/kibana-utils-plugin/public';
import type { QueryStart } from '../query_service';
import { QueryService } from '../query_service';
import { StubBrowserStorage } from '@kbn/test-jest-helpers';
import { connectToQueryState } from './connect_to_query_state';
import type { TimefilterContract } from '../timefilter';
import type { QueryState } from '../query_state';
import { createNowProviderMock } from '../../now_provider/mocks';

const connectToQueryGlobalState = (query: QueryStart, state: BaseStateContainer<QueryState>) =>
  connectToQueryState(query, state, {
    refreshInterval: true,
    time: true,
    filters: FilterStateStore.GLOBAL_STATE,
  });

const connectToQueryAppState = (query: QueryStart, state: BaseStateContainer<QueryState>) =>
  connectToQueryState(query, state, {
    filters: FilterStateStore.APP_STATE,
  });

const setupMock = coreMock.createSetup();
const startMock = coreMock.createStart();

setupMock.uiSettings.get.mockImplementation((key: string) => {
  switch (key) {
    case UI_SETTINGS.FILTERS_PINNED_BY_DEFAULT:
      return true;
    case UI_SETTINGS.SEARCH_QUERY_LANGUAGE:
      return 'kuery';
    case UI_SETTINGS.TIMEPICKER_TIME_DEFAULTS:
      return { from: 'now-15m', to: 'now' };
    case UI_SETTINGS.TIMEPICKER_REFRESH_INTERVAL_DEFAULTS:
      return { pause: false, value: 0 };
    default:
      throw new Error(`sync_query test: not mocked uiSetting: ${key}`);
  }
});

describe('connect_to_global_state', () => {
  let queryServiceStart: QueryStart;
  let filterManager: FilterManager;
  let timeFilter: TimefilterContract;
  let globalState: BaseStateContainer<QueryState>;
  let globalStateSub: Subscription;
  let globalStateChangeTriggered = jest.fn();
  let filterManagerChangeSub: Subscription;
  let filterManagerChangeTriggered = jest.fn();

  let gF1: Filter;
  let gF2: Filter;
  let aF1: Filter;
  let aF2: Filter;

  beforeEach(() => {
    const queryService = new QueryService(1000);
    queryService.setup({
      uiSettings: setupMock.uiSettings,
      storage: new Storage(new StubBrowserStorage()),
      nowProvider: createNowProviderMock(),
    });
    queryServiceStart = queryService.start({
      uiSettings: setupMock.uiSettings,
      storage: new Storage(new StubBrowserStorage()),
      http: startMock.http,
    });
    filterManager = queryServiceStart.filterManager;
    timeFilter = queryServiceStart.timefilter.timefilter;

    globalState = createStateContainer({});
    globalStateChangeTriggered = jest.fn();
    globalStateSub = globalState.state$.subscribe(globalStateChangeTriggered);

    filterManagerChangeTriggered = jest.fn();
    filterManagerChangeSub = filterManager.getUpdates$().subscribe(filterManagerChangeTriggered);

    gF1 = getFilter(FilterStateStore.GLOBAL_STATE, true, true, 'key1', 'value1');
    gF2 = getFilter(FilterStateStore.GLOBAL_STATE, false, false, 'key2', 'value2');
    aF1 = getFilter(FilterStateStore.APP_STATE, true, true, 'key3', 'value3');
    aF2 = getFilter(FilterStateStore.APP_STATE, false, false, 'key4', 'value4');
  });
  afterEach(() => {
    globalStateSub.unsubscribe();
    filterManagerChangeSub.unsubscribe();
  });

  test('state is initialized with state from query service', () => {
    const stop = connectToQueryGlobalState(queryServiceStart, globalState);

    expect(globalState.get()).toEqual({
      filters: filterManager.getGlobalFilters(),
      refreshInterval: timeFilter.getRefreshInterval(),
      time: timeFilter.getTime(),
    });

    stop();
  });

  test('when time range changes, state container contains updated time range', () => {
    const stop = connectToQueryGlobalState(queryServiceStart, globalState);
    timeFilter.setTime({ from: 'now-30m', to: 'now' });
    expect(globalState.get().time).toEqual({
      from: 'now-30m',
      to: 'now',
    });
    stop();
  });

  test('when state container receives an invalid time range, it is normalized back to the timefilter default', () => {
    const stop = connectToQueryGlobalState(queryServiceStart, globalState);

    globalState.set({ ...globalState.get(), time: { from: 'now-15m', to: 'not-a-valid-date' } });

    expect(timeFilter.getTime()).toEqual(timeFilter.getTimeDefaults());
    expect(globalState.get().time).toEqual(timeFilter.getTimeDefaults());
    stop();
  });

  test('when state container receives a time range with null boundary (e.g. _g=(time:(from:now-15m,to:null))), it is normalized back to the timefilter default', () => {
    const stop = connectToQueryGlobalState(queryServiceStart, globalState);

    globalState.set({
      ...globalState.get(),
      time: { from: 'now-15m', to: null as unknown as string },
    });

    expect(timeFilter.getTime()).toEqual(timeFilter.getTimeDefaults());
    expect(globalState.get().time).toEqual(timeFilter.getTimeDefaults());
    stop();
  });

  test('when refresh interval changes, state container contains updated refresh interval', () => {
    const stop = connectToQueryGlobalState(queryServiceStart, globalState);
    timeFilter.setRefreshInterval({ pause: true, value: 5000 });
    expect(globalState.get().refreshInterval).toEqual({
      pause: true,
      value: 5000,
    });
    stop();
  });

  test('when refresh interval is set below min, state container contains min refresh interval', () => {
    const stop = connectToQueryGlobalState(queryServiceStart, globalState);
    timeFilter.setRefreshInterval({ pause: true, value: 100 });
    expect(globalState.get().refreshInterval).toEqual({
      pause: true,
      value: 1000,
    });
    stop();
  });

  test('state changes should propagate to services', () => {
    const stop = connectToQueryGlobalState(queryServiceStart, globalState);
    globalStateChangeTriggered.mockClear();
    globalState.set({
      ...globalState.get(),
      filters: [gF1, gF2],
      refreshInterval: { pause: true, value: 5000 },
      time: { from: 'now-30m', to: 'now' },
    });

    expect(globalStateChangeTriggered).toHaveBeenCalledTimes(1);

    expect(filterManager.getGlobalFilters()).toHaveLength(2);
    expect(timeFilter.getRefreshInterval()).toEqual({ pause: true, value: 5000 });
    expect(timeFilter.getTime()).toEqual({ from: 'now-30m', to: 'now' });
    stop();
  });

  describe('sync from filterManager to global state', () => {
    test('should sync global filters to global state when new global filters set to filterManager', () => {
      const stop = connectToQueryGlobalState(queryServiceStart, globalState);

      filterManager.setFilters([gF1, aF1]);

      expect(globalState.get().filters).toHaveLength(1);
      stop();
    });

    test('should not sync app filters to global state ', () => {
      const stop = connectToQueryGlobalState(queryServiceStart, globalState);

      filterManager.setFilters([aF1, aF2]);

      expect(globalState.get().filters).toHaveLength(0);
      stop();
    });

    test("should not trigger changes when global filters didn't change", () => {
      const stop = connectToQueryGlobalState(queryServiceStart, globalState);
      globalStateChangeTriggered.mockClear();

      filterManager.setFilters([gF1, aF1]);
      filterManager.setFilters([gF1, aF2]);

      expect(globalStateChangeTriggered).toHaveBeenCalledTimes(1);
      expect(globalState.get().filters).toHaveLength(1);

      stop();
    });

    test('should trigger changes when global filters change', () => {
      const stop = connectToQueryGlobalState(queryServiceStart, globalState);
      globalStateChangeTriggered.mockClear();

      filterManager.setFilters([gF1, aF1]);
      filterManager.setFilters([gF2, aF1]);

      expect(globalStateChangeTriggered).toHaveBeenCalledTimes(2);
      expect(globalState.get().filters).toHaveLength(1);

      stop();
    });

    test('resetting filters should sync to global state', () => {
      const stop = connectToQueryGlobalState(queryServiceStart, globalState);

      filterManager.setFilters([gF1, aF1]);

      expect(globalState.get().filters).toHaveLength(1);

      filterManager.removeAll();

      expect(globalState.get().filters).toHaveLength(0);

      stop();
    });

    test("shouldn't sync filters when syncing is stopped", () => {
      const stop = connectToQueryGlobalState(queryServiceStart, globalState);

      filterManager.setFilters([gF1, aF1]);

      expect(globalState.get().filters).toHaveLength(1);

      stop();

      filterManager.removeAll();

      expect(globalState.get().filters).toHaveLength(1);
    });

    test('should pick up initial state from filterManager', () => {
      globalState.set({ filters: [gF1] });
      filterManager.setFilters([aF1]);

      globalStateChangeTriggered.mockClear();
      const stop = connectToQueryGlobalState(queryServiceStart, globalState);
      expect(globalStateChangeTriggered).toHaveBeenCalledTimes(1);
      expect(globalState.get().filters).toHaveLength(0);

      stop();
    });
  });
  describe('sync from global state to filterManager', () => {
    test('changes to global state should be synced to global filters', () => {
      filterManager.setFilters([aF1]);
      const stop = connectToQueryGlobalState(queryServiceStart, globalState);
      globalStateChangeTriggered.mockClear();

      globalState.set({ ...globalState.get(), filters: [gF1] });

      expect(filterManager.getFilters()).toHaveLength(2);
      expect(filterManager.getAppFilters()).toHaveLength(1);
      expect(filterManager.getGlobalFilters()).toHaveLength(1);
      expect(globalStateChangeTriggered).toHaveBeenCalledTimes(1);
      stop();
    });

    test('app filters should remain untouched', () => {
      filterManager.setFilters([gF1, gF2, aF1, aF2]);
      const stop = connectToQueryGlobalState(queryServiceStart, globalState);
      globalStateChangeTriggered.mockClear();

      globalState.set({ ...globalState.get(), filters: [] });

      expect(filterManager.getFilters()).toHaveLength(2);
      expect(filterManager.getAppFilters()).toHaveLength(2);
      expect(filterManager.getGlobalFilters()).toHaveLength(0);
      expect(globalStateChangeTriggered).toHaveBeenCalledTimes(1);
      stop();
    });

    test("if filters are not changed, filterManager shouldn't trigger update", () => {
      filterManager.setFilters([gF1, gF2, aF1, aF2]);
      filterManagerChangeTriggered.mockClear();

      globalState.set({ ...globalState.get(), filters: [gF1, gF2] });
      const stop = connectToQueryGlobalState(queryServiceStart, globalState);
      globalState.set({ ...globalState.get(), filters: [gF1, gF2] });

      expect(filterManagerChangeTriggered).toHaveBeenCalledTimes(0);
      stop();
    });

    test('stop() should stop syncing', () => {
      filterManager.setFilters([gF1, gF2, aF1, aF2]);
      const stop = connectToQueryGlobalState(queryServiceStart, globalState);
      globalState.set({ ...globalState.get(), filters: [] });
      expect(filterManager.getFilters()).toHaveLength(2);
      stop();
      globalState.set({ ...globalState.get(), filters: [gF1] });
      expect(filterManager.getFilters()).toHaveLength(2);
    });
  });
});

describe('connect_to_app_state', () => {
  let queryServiceStart: QueryStart;
  let filterManager: FilterManager;
  let appState: BaseStateContainer<QueryState>;
  let appStateSub: Subscription;
  let appStateChangeTriggered = jest.fn();
  let filterManagerChangeSub: Subscription;
  let filterManagerChangeTriggered = jest.fn();

  let gF1: Filter;
  let gF2: Filter;
  let aF1: Filter;
  let aF2: Filter;

  beforeEach(() => {
    const queryService = new QueryService();
    queryService.setup({
      uiSettings: setupMock.uiSettings,
      storage: new Storage(new StubBrowserStorage()),
      nowProvider: createNowProviderMock(),
    });
    queryServiceStart = queryService.start({
      uiSettings: setupMock.uiSettings,
      storage: new Storage(new StubBrowserStorage()),
      http: startMock.http,
    });
    filterManager = queryServiceStart.filterManager;

    appState = createStateContainer({});
    appStateChangeTriggered = jest.fn();
    appStateSub = appState.state$.subscribe(appStateChangeTriggered);

    filterManagerChangeTriggered = jest.fn();
    filterManagerChangeSub = filterManager.getUpdates$().subscribe(filterManagerChangeTriggered);

    gF1 = getFilter(FilterStateStore.GLOBAL_STATE, true, true, 'key1', 'value1');
    gF2 = getFilter(FilterStateStore.GLOBAL_STATE, false, false, 'key2', 'value2');
    aF1 = getFilter(FilterStateStore.APP_STATE, true, true, 'key3', 'value3');
    aF2 = getFilter(FilterStateStore.APP_STATE, false, false, 'key4', 'value4');
  });
  afterEach(() => {
    appStateSub.unsubscribe();
    filterManagerChangeSub.unsubscribe();
  });

  describe('sync from filterManager to app state', () => {
    test('should sync app filters to app state when new app filters set to filterManager', () => {
      const stop = connectToQueryAppState(queryServiceStart, appState);

      filterManager.setFilters([gF1, aF1]);

      expect(appState.get().filters).toHaveLength(1);
      stop();
    });

    test('should not sync global filters to app state ', () => {
      const stop = connectToQueryAppState(queryServiceStart, appState);

      filterManager.setFilters([gF1, gF2]);

      expect(appState.get().filters).toHaveLength(0);
      stop();
    });

    test("should not trigger changes when app filters didn't change", () => {
      const stop = connectToQueryAppState(queryServiceStart, appState);
      appStateChangeTriggered.mockClear();

      filterManager.setFilters([gF1, aF1]);
      filterManager.setFilters([gF2, aF1]);

      expect(appStateChangeTriggered).toHaveBeenCalledTimes(1);
      expect(appState.get().filters).toHaveLength(1);

      stop();
    });

    test('should trigger changes when app filters change', () => {
      const stop = connectToQueryAppState(queryServiceStart, appState);
      appStateChangeTriggered.mockClear();

      filterManager.setFilters([gF1, aF1]);
      filterManager.setFilters([gF1, aF2]);

      expect(appStateChangeTriggered).toHaveBeenCalledTimes(2);
      expect(appState.get().filters).toHaveLength(1);

      stop();
    });

    test('resetting filters should sync to app state', () => {
      const stop = connectToQueryAppState(queryServiceStart, appState);

      filterManager.setFilters([gF1, aF1]);

      expect(appState.get().filters).toHaveLength(1);

      filterManager.removeAll();

      expect(appState.get().filters).toHaveLength(0);

      stop();
    });

    test("shouldn't sync filters when syncing is stopped", () => {
      const stop = connectToQueryAppState(queryServiceStart, appState);

      filterManager.setFilters([gF1, aF1]);

      expect(appState.get().filters).toHaveLength(1);

      stop();

      filterManager.removeAll();

      expect(appState.get().filters).toHaveLength(1);
    });

    test('should pick up initial state from filterManager', () => {
      appState.set({ filters: [aF1] });
      filterManager.setFilters([gF1]);

      appStateChangeTriggered.mockClear();
      const stop = connectToQueryAppState(queryServiceStart, appState);
      expect(appStateChangeTriggered).toHaveBeenCalledTimes(1);
      expect(appState.get().filters).toHaveLength(0);

      stop();
    });
  });
  describe('sync from app state to filterManager', () => {
    test('changes to app state should be synced to app filters', () => {
      filterManager.setFilters([gF1]);
      const stop = connectToQueryAppState(queryServiceStart, appState);
      appStateChangeTriggered.mockClear();

      appState.set({ filters: [aF1] });

      expect(filterManager.getFilters()).toHaveLength(2);
      expect(filterManager.getAppFilters()).toHaveLength(1);
      expect(filterManager.getGlobalFilters()).toHaveLength(1);
      expect(appStateChangeTriggered).toHaveBeenCalledTimes(1);
      stop();
    });

    test('global filters should remain untouched', () => {
      filterManager.setFilters([gF1, gF2, aF1, aF2]);
      const stop = connectToQueryAppState(queryServiceStart, appState);
      appStateChangeTriggered.mockClear();

      appState.set({ filters: [] });

      expect(filterManager.getFilters()).toHaveLength(2);
      expect(filterManager.getGlobalFilters()).toHaveLength(2);
      expect(appStateChangeTriggered).toHaveBeenCalledTimes(1);
      stop();
    });

    test("if filters are not changed, filterManager shouldn't trigger update", () => {
      filterManager.setFilters([gF1, gF2, aF1, aF2]);
      filterManagerChangeTriggered.mockClear();

      appState.set({ filters: [aF1, aF2] });
      const stop = connectToQueryAppState(queryServiceStart, appState);
      appState.set({ filters: [aF1, aF2] });

      expect(filterManagerChangeTriggered).toHaveBeenCalledTimes(0);
      stop();
    });

    test('stop() should stop syncing', () => {
      filterManager.setFilters([gF1, gF2, aF1, aF2]);
      const stop = connectToQueryAppState(queryServiceStart, appState);
      appState.set({ filters: [] });
      expect(filterManager.getFilters()).toHaveLength(2);
      stop();
      appState.set({ filters: [aF1] });
      expect(filterManager.getFilters()).toHaveLength(2);
    });
  });
});

describe('filters with different state', () => {
  let queryServiceStart: QueryStart;
  let filterManager: FilterManager;
  let state: BaseStateContainer<QueryState>;
  let stateSub: Subscription;
  let stateChangeTriggered = jest.fn();
  let filterManagerChangeSub: Subscription;
  let filterManagerChangeTriggered = jest.fn();

  let filter: Filter;

  beforeEach(() => {
    const queryService = new QueryService();
    queryService.setup({
      uiSettings: setupMock.uiSettings,
      storage: new Storage(new StubBrowserStorage()),
      nowProvider: createNowProviderMock(),
    });
    queryServiceStart = queryService.start({
      uiSettings: setupMock.uiSettings,
      storage: new Storage(new StubBrowserStorage()),
      http: startMock.http,
    });
    filterManager = queryServiceStart.filterManager;

    state = createStateContainer({});
    stateChangeTriggered = jest.fn();
    stateSub = state.state$.subscribe(stateChangeTriggered);

    filterManagerChangeTriggered = jest.fn();
    filterManagerChangeSub = filterManager.getUpdates$().subscribe(filterManagerChangeTriggered);

    filter = getFilter(FilterStateStore.GLOBAL_STATE, true, true, 'key1', 'value1');
  });

  // applies filter state changes, changes only internal $state.store value
  function runChanges() {
    filter = { ...filter, $state: { store: FilterStateStore.GLOBAL_STATE } };

    state.set({
      filters: [filter],
    });

    filter = { ...filter, $state: { store: FilterStateStore.APP_STATE } };

    state.set({
      filters: [filter],
    });

    filter = { ...filter };
    delete filter.$state;

    state.set({
      filters: [filter],
    });
  }

  test('when syncing all filters, changes to filter.state$ should be taken into account', () => {
    const stop = connectToQueryState(queryServiceStart, state, {
      filters: true,
    });

    runChanges();

    expect(filterManagerChangeTriggered).toHaveBeenCalledTimes(3);

    stop();
  });

  test('when syncing app state filters, changes to filter.state$ should be ignored', () => {
    const stop = connectToQueryState(queryServiceStart, state, {
      filters: FilterStateStore.APP_STATE,
    });

    runChanges();

    expect(filterManagerChangeTriggered).toHaveBeenCalledTimes(1);

    stop();
  });

  test('when syncing global state filters, changes to filter.state$ should be ignored', () => {
    const stop = connectToQueryState(queryServiceStart, state, {
      filters: FilterStateStore.GLOBAL_STATE,
    });

    runChanges();

    expect(filterManagerChangeTriggered).toHaveBeenCalledTimes(1);

    stop();
  });

  afterEach(() => {
    stateSub.unsubscribe();
    filterManagerChangeSub.unsubscribe();
  });
});
