/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { StateComparators } from '@kbn/presentation-publishing';
import { diffComparators } from '@kbn/presentation-publishing';
import { BehaviorSubject, combineLatestWith, debounceTime, map, skip, startWith } from 'rxjs';
import type { DashboardState } from '../../server';

export function initializeApproximationManager(initialState: DashboardState) {
  const useApproximation$ = new BehaviorSubject<boolean>(initialState.use_approximation ?? false);

  function setUseApproximation(value: boolean) {
    if (value !== useApproximation$.value) {
      useApproximation$.next(value);
    }
  }

  const comparators: StateComparators<Pick<DashboardState, 'use_approximation'>> = {
    use_approximation: 'referenceEquality',
  };

  const getState = (): Pick<DashboardState, 'use_approximation'> => ({
    use_approximation: useApproximation$.value,
  });

  const anyStateChange$ = useApproximation$.pipe(
    skip(1),
    map(() => undefined)
  );

  return {
    api: {
      useApproximation$,
      setUseApproximation,
    },
    internalApi: {
      anyStateChange$,
      startComparing: (lastSavedState$: BehaviorSubject<DashboardState>) => {
        return anyStateChange$.pipe(
          startWith(undefined),
          debounceTime(100),
          map(() => getState()),
          combineLatestWith(lastSavedState$),
          map(([latestState, lastSavedState]) => {
            return diffComparators(
              comparators,
              { use_approximation: lastSavedState.use_approximation ?? false },
              latestState
            );
          })
        );
      },
      comparators,
      getState,
      reset: (lastSavedState: DashboardState) => {
        setUseApproximation(lastSavedState.use_approximation ?? false);
      },
    },
  };
}
