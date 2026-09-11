/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  filter,
  map,
  merge,
  type Observable,
  type Subject,
} from 'rxjs';

import { startTrackingHistory } from '@kbn/rxjs-history';

import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import type { initializeTrackOverlay } from './track_overlay';

export function initializeHistoryManager({
  anyStateChange$,
  hasOverlays$,
  setState,
  getState,
  dataLoading$,
  initialState$,
}: {
  anyStateChange$: Observable<void>;
  hasOverlays$: ReturnType<typeof initializeTrackOverlay>['hasOverlays$'];
  getState: () => DashboardState;
  setState: (state: DashboardState) => Promise<void>;
  dataLoading$: Observable<boolean>;
  initialState$: Subject<DashboardState>;
}) {
  const pauseHistory$ = new BehaviorSubject<boolean>(false);
  const pauseHistorySubscription = combineLatest([hasOverlays$, dataLoading$]).subscribe(
    ([hasOverlays, dataLoading]) => {
      pauseHistory$.next(hasOverlays || dataLoading);
    }
  );
  const onStateChange$ = combineLatest([anyStateChange$, pauseHistory$]).pipe(
    debounceTime(0), // flatten anyStateChange + dataLoading event updates
    filter(([, paused]) => !paused),
    map(() => {
      const state = getState();
      return {
        ...state,
        panels: state.panels.sort(sortById), // keep panel order consistent so that diffing on array works as expected
      };
    })
  );

  const { api: historyApi, cleanup: cleanupHistoryTracking } = startTrackingHistory<DashboardState>(
    {
      onStateChange$: merge(initialState$, onStateChange$),
      setState,
      maxSize: 100,
      pause$: pauseHistory$,
    }
  );

  return {
    internalApi: historyApi,
    cleanup: () => {
      pauseHistorySubscription.unsubscribe();
      cleanupHistoryTracking();
    },
  };
}

const sortById = (
  { id: idA }: DashboardState['panels'][number] | DashboardState['pinned_panels'][number],
  { id: idB }: DashboardState['panels'][number] | DashboardState['pinned_panels'][number]
) => (idA ?? '').localeCompare(idB ?? '');
