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
import type { DashboardState } from '@kbn/as-code-dashboard-schema';

export function initializeApproximationManager(initialState: DashboardState) {
  const isApproximate$ = new BehaviorSubject<boolean | undefined>(initialState.esql_approximation);

  function setEsqlApproximation(value: boolean) {
    if (value !== isApproximate$.value) {
      isApproximate$.next(value);
    }
  }

  const comparators: StateComparators<Pick<DashboardState, 'esql_approximation'>> = {
    esql_approximation: (a, b) => Boolean(a) === Boolean(b),
  };

  const getState = (): Pick<DashboardState, 'esql_approximation'> => ({
    esql_approximation: isApproximate$.value,
  });

  const anyStateChange$ = isApproximate$.pipe(
    skip(1),
    map(() => undefined)
  );

  return {
    api: {
      isApproximate$,
      setEsqlApproximation,
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
              { esql_approximation: lastSavedState.esql_approximation ?? false },
              latestState
            );
          })
        );
      },
      comparators,
      getState,
      reset: (lastSavedState: DashboardState) => {
        setEsqlApproximation(lastSavedState.esql_approximation ?? false);
      },
    },
  };
}
