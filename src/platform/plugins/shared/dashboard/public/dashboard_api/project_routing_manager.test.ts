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
import { initializeProjectRoutingManager } from './project_routing_manager';
import { cpsService } from '../services/kibana_services';

jest.mock('../services/kibana_services', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { cpsServiceMock } = require('@kbn/cps/public/__mocks__');
  return {
    cpsService: cpsServiceMock,
  };
});

describe('projectRouting', () => {
  const createLastSavedState = (projectRouting?: string) =>
    new BehaviorSubject<DashboardState>({
      ...getSampleDashboardState({ project_routing: projectRouting }),
    });

  const initManager = (projectRoutingRestore: boolean, initialProjectRouting?: string) => {
    const projectRoutingRestore$ = new BehaviorSubject<boolean>(projectRoutingRestore);
    const dashboardState = initialProjectRouting
      ? { ...getSampleDashboardState({ project_routing: initialProjectRouting }) }
      : getSampleDashboardState();

    return {
      manager: initializeProjectRoutingManager(dashboardState, projectRoutingRestore$),
      projectRoutingRestore$,
    };
  };

  beforeEach(() => {
    // Reset the project routing subject before each test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resetCpsMock } = require('@kbn/cps/public/__mocks__');
    resetCpsMock();
  });

  test('Should update projectRouting via setProjectRouting', () => {
    const { manager } = initManager(true);

    // initializes with undefined projectRouting by default
    expect(manager!.api.projectRouting$.value).toBeUndefined();

    manager!.api.setProjectRouting('_alias:_origin');
    expect(manager!.api.projectRouting$.value).toBe('_alias:_origin');

    manager!.api.setProjectRouting(undefined);
    expect(manager!.api.projectRouting$.value).toBeUndefined();
  });

  test('Should detect projectRouting change from _alias:_origin to ALL when projectRoutingRestore is true', (done) => {
    const { manager } = initManager(true, '_alias:_origin');
    const lastSavedState$ = createLastSavedState('_alias:_origin');

    // initializes with _alias:_origin projectRouting if set in last saved state
    expect(manager!.api.projectRouting$.value).toBe('_alias:_origin');

    manager!.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
      // When projectRoutingRestore is true, changing to '_alias:*' is detected
      expect(changes).toEqual({
        project_routing: '_alias:*',
      });
      done();
    });

    manager!.api.setProjectRouting('_alias:*');
  });

  test('Should detect change when setting projectRouting to _alias:* from undefined', (done) => {
    const { manager } = initManager(true);
    const lastSavedState$ = createLastSavedState();

    manager!.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
      // When projectRoutingRestore is true, setting to '_alias:*' should be detected as a change
      expect(changes).toEqual({
        project_routing: '_alias:*',
      });
      done();
    });

    // Setting to '_alias:*' when projectRoutingRestore is true should be detected
    manager!.api.setProjectRouting('_alias:*');
  });

  test('Should restore projectRouting in reset', () => {
    const { manager } = initManager(true, '_alias:_origin');
    const lastSavedState$ = createLastSavedState('_alias:_origin');

    // Change projectRouting
    manager!.api.setProjectRouting(undefined);
    expect(manager!.api.projectRouting$.value).toBeUndefined();

    // Reset to last saved state
    manager!.internalApi.reset(lastSavedState$.value);
    expect(manager!.api.projectRouting$.value).toBe('_alias:_origin');
  });

  test('Should NOT detect projectRouting changes when projectRoutingRestore is false', (done) => {
    const { manager } = initManager(false, '_alias:_origin');
    const lastSavedState$ = createLastSavedState('_alias:_origin');

    manager!.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
      // Should not detect changes when projectRoutingRestore is false
      expect(changes).toEqual({});
      done();
    });

    // Change projectRouting - should not be detected as a change
    manager!.api.setProjectRouting('_alias:_new');
  });

  test('Should not include projectRouting in getState when projectRoutingRestore is false', () => {
    const { manager } = initManager(false);

    manager!.api.setProjectRouting('_alias:_origin');
    const state = manager!.internalApi.getState();

    // projectRouting should not be included when projectRoutingRestore is false
    expect(state.project_routing).toBeUndefined();
  });

  test('Should include projectRouting in getState when projectRoutingRestore is true', () => {
    const { manager } = initManager(true);

    manager!.api.setProjectRouting('_alias:_origin');
    const state = manager!.internalApi.getState();

    // projectRouting should be included when projectRoutingRestore is true
    expect(state.project_routing).toBe('_alias:_origin');
  });

  test('Should save current routing when projectRoutingRestore is true', () => {
    const { manager } = initManager(true);

    // Set projectRouting to '_alias:*'
    manager!.api.setProjectRouting('_alias:*');
    const state = manager!.internalApi.getState();

    // projectRouting should be saved as '_alias:*' when projectRoutingRestore is true
    expect(state.project_routing).toBe('_alias:*');
  });

  test('Should distinguish between ALL (saved with all projects) and undefined (not saved)', () => {
    const { manager } = initManager(true, '_alias:*');

    // Should initialize with '_alias:*' from saved state
    expect(manager!.api.projectRouting$.value).toBe('_alias:*');

    const state = manager!.internalApi.getState();
    // getState should return '_alias:*' when projectRouting is '_alias:*'
    expect(state.project_routing).toBe('_alias:*');
  });

  test('Should not detect change when projectRouting remains the same', (done) => {
    const { manager } = initManager(true, '_alias:*');
    const lastSavedState$ = createLastSavedState('_alias:*');

    manager!.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
      // When projectRouting is set to the same value as saved, no change detected
      expect(changes).toEqual({});
      done();
    });

    // Set to same value as saved state - should not detect a change
    manager!.api.setProjectRouting('_alias:*');
  });

  test('Should return undefined when CPS is not enabled', () => {
    // Mock cpsService as disabled (no cpsManager)
    const originalCpsManager = cpsService?.cpsManager;
    if (cpsService) {
      delete cpsService.cpsManager;
    }

    const projectRoutingRestore$ = new BehaviorSubject<boolean>(true);
    const projectRoutingManager = initializeProjectRoutingManager(
      getSampleDashboardState(),
      projectRoutingRestore$
    );

    // Should return undefined when CPS is not enabled
    expect(projectRoutingManager).toBeUndefined();

    // Restore original mock
    if (cpsService && originalCpsManager) {
      cpsService.cpsManager = originalCpsManager;
    }
  });
});
