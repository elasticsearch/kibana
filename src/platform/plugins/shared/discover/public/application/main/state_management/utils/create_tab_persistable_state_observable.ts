/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isEqual } from 'lodash';
import { distinctUntilChanged, map, type Observable, skip } from 'rxjs';
import { type DiscoverInternalState, selectTab, type TabState } from '../redux';
import { isEqualState } from './state_comparators';

export type TabPersistableState = Pick<
  TabState,
  'appState' | 'globalState' | 'attributes' | 'profileState'
>;

export const createTabPersistableStateObservable = ({
  tabId,
  internalState$,
  getState,
}: {
  tabId: string;
  internalState$: Observable<DiscoverInternalState>;
  getState: () => DiscoverInternalState;
}): Observable<TabPersistableState> => {
  const getTabState = (): TabPersistableState => {
    const tabState = selectTab(getState(), tabId);

    return {
      appState: tabState.appState,
      globalState: tabState.globalState,
      attributes: tabState.attributes,
      profileState: tabState.profileState,
    };
  };

  return internalState$.pipe(
    map(getTabState),
    distinctUntilChanged(
      (a, b) =>
        isEqualState(a.appState, b.appState) &&
        isEqualState(a.globalState, b.globalState) &&
        isEqual(a.attributes, b.attributes) &&
        isEqual(a.profileState, b.profileState)
    ),
    skip(1)
  );
};
