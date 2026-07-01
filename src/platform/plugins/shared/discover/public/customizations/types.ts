/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import type { SavedSearch } from '@kbn/saved-search-plugin/public';
import type { DiscoverCustomizationService } from './customization_service';
import type {
  DiscoverAppState,
  InternalStateStore,
  internalStateActions,
  TabActionInjector,
  TabState,
} from '../application/main/state_management/redux';
import type { TabPersistableState } from '../application/main/state_management/utils/create_tab_persistable_state_observable';

/**
 * Public interface exposed to external consumers (e.g. Security Timeline) via the customization framework.
 * Properties are selected based on actual usage by external consumers.
 */
export interface ExtendedDiscoverStateContainer {
  /**
   * Internal Redux state store for dispatching actions
   */
  internalState: InternalStateStore;
  /**
   * Injects the current tab ID into Redux actions
   */
  injectCurrentTab: TabActionInjector;
  /**
   * Gets the state of the current tab
   */
  getCurrentTab: () => TabState;
  /**
   * State of URL, allows updating and subscribing to URL changes
   */
  stateStorage: IKbnUrlStateStorage;
  /**
   * Creates an observable of the current tab's app state
   */
  createAppStateObservable: () => Observable<DiscoverAppState>;
  /**
   * Creates an observable of the current tab's main state (query, filters, time range, refresh interval, persistable attributes)
   */
  createTabPersistableStateObservable: () => Observable<TabPersistableState>;
  /**
   * Get updated AppState when given a saved search
   */
  getAppStateFromSavedSearch: (newSavedSearch: SavedSearch) => DiscoverAppState;
  /**
   * Builds a SavedSearch object from the current tab's state
   */
  getSavedSearchFromCurrentTab: () => Promise<SavedSearch>;
  /**
   * Returns an observable for the current tab's data view (read-only)
   */
  getCurrentTabDataView$: () => Observable<DataView | undefined>;
  /**
   * A selection of provided Redux actions from the internal state
   */
  internalActions: {
    setAppState: typeof internalStateActions.setAppState;
    updateGlobalState: typeof internalStateActions.updateGlobalState;
    updateAppStateAndReplaceUrl: typeof internalStateActions.updateAppStateAndReplaceUrl;
    resetAppState: typeof internalStateActions.resetAppState;
    initializeAndSync: typeof internalStateActions.initializeAndSync;
    stopSyncing: typeof internalStateActions.stopSyncing;
    openDiscoverSession: typeof internalStateActions.openDiscoverSession;
    fetchData: typeof internalStateActions.fetchData;
  };
}

export interface CustomizationCallbackContext {
  customizations: DiscoverCustomizationService;
  stateContainer: ExtendedDiscoverStateContainer;
}

export type CustomizationCallback = (
  options: CustomizationCallbackContext
) => void | (() => void) | Promise<void | (() => void)>;

export type DiscoverDisplayMode = 'embedded' | 'standalone';

export interface DiscoverCustomizationContext {
  /*
   * Display mode in which discover is running
   */
  displayMode: DiscoverDisplayMode;
}
