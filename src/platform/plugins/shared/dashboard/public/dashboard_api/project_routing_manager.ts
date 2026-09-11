/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ProjectRouting } from '@kbn/es-query';
import type { PublishingSubject, StateComparators } from '@kbn/presentation-publishing';
import { diffComparators } from '@kbn/presentation-publishing';
import type { Subscription } from 'rxjs';
import { BehaviorSubject, combineLatestWith, debounceTime, map, skip, startWith } from 'rxjs';
import { ProjectRoutingAccess } from '@kbn/cps-utils';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { cpsService } from '../services/kibana_services';

export const COMPARE_DEBOUNCE = 100;

export function initializeProjectRoutingManager(
  initialState: DashboardState,
  projectRoutingRestore$: PublishingSubject<boolean>
) {
  if (!cpsService?.cpsManager) {
    return;
  }
  const cpsManager = cpsService.cpsManager;

  cpsManager.registerAppAccess('dashboards', (location: string) =>
    location.includes('#/list') ? ProjectRoutingAccess.DISABLED : ProjectRoutingAccess.EDITABLE
  );

  const projectRouting$ = new BehaviorSubject<ProjectRouting>(initialState.project_routing);

  // pass the initial state to CPS manager from dashboard state if set
  if (initialState.project_routing) {
    cpsManager.setProjectRouting(initialState.project_routing);
  }

  function setProjectRouting(projectRouting: ProjectRouting) {
    if (projectRouting !== projectRouting$.value) {
      projectRouting$.next(projectRouting);
      cpsManager.setProjectRouting(projectRouting);
    }
  }

  // Subscribe to CPS's projectRouting$ to sync changes from the project picker
  const cpsProjectRoutingSubscription: Subscription | undefined = cpsManager
    .getProjectRouting$()
    .subscribe((cpsProjectRouting: ProjectRouting | undefined) => {
      setProjectRouting(cpsProjectRouting);
    });

  const comparators = {
    project_routing: (_a, _b, lastSavedState, _latestState) => {
      if (!projectRoutingRestore$.value) return true;
      const savedValue = lastSavedState?.project_routing;
      return savedValue === projectRouting$.value;
    },
  } as StateComparators<Pick<DashboardState, 'project_routing'>>;

  const getState = (): Pick<DashboardState, 'project_routing'> => {
    if (!projectRoutingRestore$.value) {
      // Don't save anything when projectRestore is false
      return {};
    }

    // Read from CPS if available, otherwise use internal state
    return {
      project_routing: projectRouting$.value,
    };
  };

  const anyStateChange$ = projectRouting$.pipe(
    skip(1),
    map(() => undefined)
  );

  return {
    api: {
      projectRouting$,
      setProjectRouting,
    },
    internalApi: {
      anyStateChange$,
      startComparing: (lastSavedState$: BehaviorSubject<DashboardState>) => {
        return anyStateChange$.pipe(
          // anyStateChange$ does not emit on subscribe
          // use startWith to compare unsaved changes on subscribe
          startWith(undefined),
          debounceTime(COMPARE_DEBOUNCE),
          map(() => getState()),
          combineLatestWith(lastSavedState$),
          map(([latestState, lastSavedState]) => {
            return diffComparators(comparators, lastSavedState, latestState);
          })
        );
      },
      comparators,
      getState,
      reset: (lastSavedState: DashboardState) => {
        setProjectRouting(lastSavedState.project_routing ?? cpsManager.getDefaultProjectRouting());
      },
    },
    cleanup: () => {
      cpsProjectRoutingSubscription?.unsubscribe();
    },
  };
}
