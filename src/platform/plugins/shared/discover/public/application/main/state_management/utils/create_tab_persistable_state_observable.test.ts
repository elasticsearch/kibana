/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import { dataViewMockWithTimeField } from '@kbn/discover-utils/src/__mocks__';
import { createDiscoverSessionMock } from '@kbn/saved-search-plugin/common/mocks';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import { getDiscoverInternalStateMock } from '../../../../__mocks__/discover_state.mock';
import { getPersistedTabMock } from '../redux/__mocks__/internal_state.mocks';
import {
  createTabPersistableStateObservable,
  type TabPersistableState,
} from './create_tab_persistable_state_observable';
import { internalStateActions, selectTab, type DiscoverInternalState } from '../redux';

describe('createTabPersistableStateObservable', () => {
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
    await toolkit.initializeTabs({
      persistedDiscoverSession: createDiscoverSessionMock({
        id: 'test-session',
        tabs: [persistedTab],
      }),
    });

    const internalState$ = new BehaviorSubject<DiscoverInternalState>(
      toolkit.internalState.getState()
    );

    // Patch the internal state to use the BehaviorSubject
    toolkit.internalState.subscribe = (listener) => {
      const subscription = internalState$.subscribe(() => {
        listener();
      });
      return () => subscription.unsubscribe();
    };

    // Patch dispatch to update the BehaviorSubject
    const originalDispatch = toolkit.internalState.dispatch;
    toolkit.internalState.dispatch = ((action: Parameters<typeof originalDispatch>[0]) => {
      const result = originalDispatch(action);
      internalState$.next(toolkit.internalState.getState());
      return result;
    }) as typeof originalDispatch;

    return {
      internalState: toolkit.internalState,
      internalState$,
      tabId: persistedTab.id,
      services,
    };
  };

  it('should create an observable that emits tab persistable state', async () => {
    const { internalState, internalState$, tabId } = await setup();

    const observable$ = createTabPersistableStateObservable({
      tabId,
      internalState$,
      getState: internalState.getState,
    });

    expect(observable$).toBeDefined();
  });

  it('should skip the first emission due to skip(1)', async () => {
    const { internalState, internalState$, tabId } = await setup();

    const observable$ = createTabPersistableStateObservable({
      tabId,
      internalState$,
      getState: internalState.getState,
    });

    const emittedValues: TabPersistableState[] = [];
    const subscription = observable$.subscribe((value) => {
      emittedValues.push(value);
    });

    // Should not emit on initial subscription
    expect(emittedValues).toHaveLength(0);

    subscription.unsubscribe();
  });

  it('should emit when appState changes', async () => {
    const { internalState, internalState$, tabId } = await setup();

    const observable$ = createTabPersistableStateObservable({
      tabId,
      internalState$,
      getState: internalState.getState,
    });

    const emittedValues: TabPersistableState[] = [];
    const subscription = observable$.subscribe((value) => {
      emittedValues.push(value);
    });

    // Trigger an appState change
    internalState.dispatch(
      internalStateActions.updateAppState({
        tabId,
        appState: { hideChart: true },
      })
    );

    expect(emittedValues).toHaveLength(1);
    expect(emittedValues[0].appState.hideChart).toBe(true);

    subscription.unsubscribe();
  });

  it('should emit when globalState changes', async () => {
    const { internalState, internalState$, tabId } = await setup();

    const observable$ = createTabPersistableStateObservable({
      tabId,
      internalState$,
      getState: internalState.getState,
    });

    const emittedValues: TabPersistableState[] = [];
    const subscription = observable$.subscribe((value) => {
      emittedValues.push(value);
    });

    const newTimeRange = { from: 'now-30d', to: 'now' };

    // Trigger a globalState change
    internalState.dispatch(
      internalStateActions.updateGlobalState({
        tabId,
        globalState: { timeRange: newTimeRange },
      })
    );

    expect(emittedValues).toHaveLength(1);
    expect(emittedValues[0].globalState.timeRange).toEqual(newTimeRange);

    subscription.unsubscribe();
  });

  it('should emit when attributes change', async () => {
    const { internalState, internalState$, tabId } = await setup();

    const observable$ = createTabPersistableStateObservable({
      tabId,
      internalState$,
      getState: internalState.getState,
    });

    const emittedValues: TabPersistableState[] = [];
    const subscription = observable$.subscribe((value) => {
      emittedValues.push(value);
    });

    // Trigger an attributes change
    internalState.dispatch(
      internalStateActions.updateAttributes({
        tabId,
        attributes: { timeRestore: true },
      })
    );

    expect(emittedValues).toHaveLength(1);
    expect(emittedValues[0].attributes.timeRestore).toBe(true);

    subscription.unsubscribe();
  });

  it('should emit when profile state changes', async () => {
    const { internalState, internalState$, tabId } = await setup();

    const observable$ = createTabPersistableStateObservable({
      tabId,
      internalState$,
      getState: internalState.getState,
    });

    const emittedValues: TabPersistableState[] = [];
    const subscription = observable$.subscribe((value) => {
      emittedValues.push(value);
    });

    internalState.dispatch(
      internalStateActions.setProfileState({
        tabId,
        key: 'testProfileState',
        profileState: { color: 'primary' },
      })
    );

    expect(emittedValues).toHaveLength(1);
    expect(emittedValues[0].profileState).toEqual({
      testProfileState: { color: 'primary' },
    });

    subscription.unsubscribe();
  });

  it('should not emit when state has not changed (distinctUntilChanged)', async () => {
    const { internalState, internalState$, tabId } = await setup();

    const observable$ = createTabPersistableStateObservable({
      tabId,
      internalState$,
      getState: internalState.getState,
    });

    const emittedValues: TabPersistableState[] = [];
    const subscription = observable$.subscribe((value) => {
      emittedValues.push(value);
    });

    const currentTab = selectTab(internalState.getState(), tabId);

    // Dispatch the same state
    internalState.dispatch(
      internalStateActions.updateAppState({
        tabId,
        appState: { hideChart: currentTab.appState.hideChart },
      })
    );

    // Should not emit since state hasn't changed
    expect(emittedValues).toHaveLength(0);

    subscription.unsubscribe();
  });

  it('should emit only the picked persistable properties', async () => {
    const { internalState, internalState$, tabId } = await setup();

    const observable$ = createTabPersistableStateObservable({
      tabId,
      internalState$,
      getState: internalState.getState,
    });

    const emittedValues: TabPersistableState[] = [];
    const subscription = observable$.subscribe((value) => {
      emittedValues.push(value);
    });

    // Trigger a change
    internalState.dispatch(
      internalStateActions.updateAppState({
        tabId,
        appState: { hideChart: true },
      })
    );

    expect(emittedValues).toHaveLength(1);

    const emittedState = emittedValues[0];
    expect(emittedState).toHaveProperty('appState');
    expect(emittedState).toHaveProperty('globalState');
    expect(emittedState).toHaveProperty('attributes');
    expect(emittedState).toHaveProperty('profileState');

    // Should not have other TabState properties
    expect(emittedState).not.toHaveProperty('id');
    expect(emittedState).not.toHaveProperty('label');
    expect(emittedState).not.toHaveProperty('initializationState');

    subscription.unsubscribe();
  });

  it('should emit multiple times for multiple distinct changes', async () => {
    const { internalState, internalState$, tabId } = await setup();

    const observable$ = createTabPersistableStateObservable({
      tabId,
      internalState$,
      getState: internalState.getState,
    });

    const emittedValues: TabPersistableState[] = [];
    const subscription = observable$.subscribe((value) => {
      emittedValues.push(value);
    });

    // First change
    internalState.dispatch(
      internalStateActions.updateAppState({
        tabId,
        appState: { hideChart: true },
      })
    );

    // Second change
    internalState.dispatch(
      internalStateActions.updateGlobalState({
        tabId,
        globalState: { timeRange: { from: 'now-1h', to: 'now' } },
      })
    );

    // Third change
    internalState.dispatch(
      internalStateActions.updateAttributes({
        tabId,
        attributes: { timeRestore: true },
      })
    );

    expect(emittedValues).toHaveLength(3);

    subscription.unsubscribe();
  });
});
