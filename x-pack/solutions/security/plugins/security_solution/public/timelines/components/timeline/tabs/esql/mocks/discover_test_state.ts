/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { dataViewMockWithTimeField } from '@kbn/discover-utils/src/__mocks__';
import { APP_STATE_URL_KEY, GLOBAL_STATE_URL_KEY } from '@kbn/discover-plugin/common';
import { createDiscoverServicesMock } from '@kbn/discover-plugin/public/__mocks__/services';
import { getDiscoverInternalStateMock } from '@kbn/discover-plugin/public/__mocks__/discover_state.mock';
import { getExtendedDiscoverStateContainer } from '@kbn/discover-plugin/public/customizations';
import {
  createTabActionInjector,
  selectTab,
  type DiscoverAppState,
} from '@kbn/discover-plugin/public/application/main/state_management/redux';
import type { TimeRange } from '@kbn/es-query';

/**
 * Builds a real Discover state container whose URL already carries the app state and time range
 * of the previously opened timeline, which is what the ES|QL tab finds when it mounts.
 */
export const createTimelineDiscoverTestState = async ({
  urlAppState,
  urlTimeRange,
}: {
  urlAppState: DiscoverAppState;
  urlTimeRange: TimeRange;
}) => {
  const services = createDiscoverServicesMock();
  const toolkit = getDiscoverInternalStateMock({
    services,
    persistedDataViews: [dataViewMockWithTimeField],
  });

  await toolkit.initializeTabs();

  const tabId = toolkit.internalState.getState().tabs.unsafeCurrentId;
  const stateContainer = getExtendedDiscoverStateContainer({
    internalState: toolkit.internalState,
    injectCurrentTab: createTabActionInjector(tabId),
    getCurrentTab: () => selectTab(toolkit.internalState.getState(), tabId),
    runtimeStateManager: toolkit.runtimeStateManager,
    stateStorage: toolkit.stateStorageContainer,
    services,
  });

  await toolkit.stateStorageContainer.set(
    GLOBAL_STATE_URL_KEY,
    { time: urlTimeRange },
    { replace: true }
  );
  await toolkit.stateStorageContainer.set(APP_STATE_URL_KEY, urlAppState, { replace: true });

  return { ...toolkit, services, tabId, stateContainer };
};

/** Sets the app state Discover holds for the tab currently on screen. */
export const setCurrentTabAppState = (
  stateContainer: Awaited<ReturnType<typeof createTimelineDiscoverTestState>>['stateContainer'],
  appState: DiscoverAppState
) => {
  stateContainer.internalState.dispatch(
    stateContainer.injectCurrentTab(stateContainer.internalActions.setAppState)({ appState })
  );
};
