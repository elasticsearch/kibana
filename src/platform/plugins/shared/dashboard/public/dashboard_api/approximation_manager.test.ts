/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import { getSampleDashboardState } from '../mocks';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { initializeApproximationManager } from './approximation_manager';

describe('approximationManager', () => {
  const createLastSavedState = (esql_approximation?: boolean) =>
    new BehaviorSubject<DashboardState>({
      ...getSampleDashboardState({ esql_approximation }),
    });

  test('initializes with the value from initial state', () => {
    const manager = initializeApproximationManager(
      getSampleDashboardState({ esql_approximation: true })
    );
    expect(manager.api.isApproximate$.value).toBe(true);
  });

  test('setEsqlApproximation updates the subject', () => {
    const manager = initializeApproximationManager(getSampleDashboardState());

    manager.api.setEsqlApproximation(true);
    expect(manager.api.isApproximate$.value).toBe(true);

    manager.api.setEsqlApproximation(false);
    expect(manager.api.isApproximate$.value).toBe(false);
  });

  test('setEsqlApproximation does not emit when value is unchanged', () => {
    const manager = initializeApproximationManager(
      getSampleDashboardState({ esql_approximation: true })
    );
    const emissions: Array<boolean | undefined> = [];
    manager.api.isApproximate$.subscribe((v) => emissions.push(v));

    manager.api.setEsqlApproximation(true);
    expect(emissions).toHaveLength(1); // only the initial emission
  });

  test('getState returns current esql_approximation value', () => {
    const manager = initializeApproximationManager(getSampleDashboardState());

    manager.api.setEsqlApproximation(true);
    expect(manager.internalApi.getState()).toEqual({ esql_approximation: true });
  });

  test('reset restores esql_approximation from last saved state', () => {
    const manager = initializeApproximationManager(
      getSampleDashboardState({ esql_approximation: true })
    );

    manager.api.setEsqlApproximation(false);
    expect(manager.api.isApproximate$.value).toBe(false);

    manager.internalApi.reset(getSampleDashboardState({ esql_approximation: true }));
    expect(manager.api.isApproximate$.value).toBe(true);
  });

  test('startComparing detects change from false to true', (done) => {
    const manager = initializeApproximationManager(getSampleDashboardState());
    const lastSavedState$ = createLastSavedState(false);

    manager.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
      expect(changes).toEqual({ esql_approximation: true });
      done();
    });

    manager.api.setEsqlApproximation(true);
  });

  test('startComparing emits empty object when value matches saved state', (done) => {
    const manager = initializeApproximationManager(
      getSampleDashboardState({ esql_approximation: true })
    );
    const lastSavedState$ = createLastSavedState(true);

    manager.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
      expect(changes).toEqual({});
      done();
    });

    manager.api.setEsqlApproximation(true);
  });
});
