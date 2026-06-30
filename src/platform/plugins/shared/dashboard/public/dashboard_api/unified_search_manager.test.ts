/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject, Subject, take } from 'rxjs';
import { FilterStateStore } from '@kbn/es-query';
import { getSampleDashboardState } from '../mocks';
import type { DashboardState } from '../../common';
import { initializeUnifiedSearchManager } from './unified_search_manager';

describe('initializeUnifiedSearchManager', () => {
  describe('startComparing', () => {
    test('Should return no changes when there are no changes', (done) => {
      const lastSavedState$ = new BehaviorSubject<DashboardState>(
        getSampleDashboardState({
          filters: [
            {
              type: 'condition',
              condition: {
                field: 'status',
                operator: 'is',
                value: 'active',
              },
            },
          ],
        })
      );
      const unifiedSearchManager = initializeUnifiedSearchManager(
        lastSavedState$.value,
        new BehaviorSubject<boolean>(false),
        new Subject<void>(),
        () => lastSavedState$.value,
        new Subject(),
        {
          useUnifiedSearchIntegration: false,
        }
      );
      unifiedSearchManager.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
        expect(changes).toMatchInlineSnapshot(`Object {}`);
        done();
      });
    });

    describe('timeRange', () => {
      test('Should not return timeRanage change when timeRestore is false', (done) => {
        const lastSavedState$ = new BehaviorSubject<DashboardState>(getSampleDashboardState());
        const unifiedSearchManager = initializeUnifiedSearchManager(
          lastSavedState$.value,
          new BehaviorSubject<boolean>(false),
          new Subject<void>(),
          () => lastSavedState$.value,
          new Subject(),
          {
            useUnifiedSearchIntegration: false,
          }
        );
        unifiedSearchManager.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
          expect(changes).toMatchInlineSnapshot(`Object {}`);
          done();
        });

        unifiedSearchManager.api.setTimeRange({
          to: 'now',
          from: 'now-30m',
        });
      });

      test('Should return timeRanage change when timeRestore is true', (done) => {
        const lastSavedState$ = new BehaviorSubject<DashboardState>(getSampleDashboardState());
        const unifiedSearchManager = initializeUnifiedSearchManager(
          lastSavedState$.value,
          new BehaviorSubject<boolean>(true),
          new Subject<void>(),
          () => lastSavedState$.value,
          new Subject(),
          {
            useUnifiedSearchIntegration: false,
          }
        );
        unifiedSearchManager.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
          expect(changes).toMatchInlineSnapshot(`
            Object {
              "time_range": Object {
                "from": "now-30m",
                "to": "now",
              },
            }
          `);
          done();
        });

        unifiedSearchManager.api.setTimeRange({
          to: 'now',
          from: 'now-30m',
        });
      });

      test('Should not return timeRanage change when timeRestore resets to false', (done) => {
        const lastSavedState$ = new BehaviorSubject<DashboardState>(getSampleDashboardState());
        const timeRestore$ = new BehaviorSubject<boolean>(false);
        const unifiedSearchManager = initializeUnifiedSearchManager(
          lastSavedState$.value,
          timeRestore$,
          new Subject<void>(),
          () => lastSavedState$.value,
          new Subject(),
          {
            useUnifiedSearchIntegration: false,
          }
        );
        let emitCount = 0;
        unifiedSearchManager.internalApi
          .startComparing(lastSavedState$)
          .pipe(take(2))
          .subscribe((changes) => {
            emitCount++;

            if (emitCount === 1) {
              expect(changes).toMatchInlineSnapshot(`
              Object {
                "time_range": Object {
                  "from": "now-30m",
                  "to": "now",
                },
              }
            `);
              // reset timeRestore to false
              timeRestore$.next(false);
            }

            if (emitCount === 2) {
              expect(changes).toMatchInlineSnapshot(`Object {}`);
              done();
            }
          });

        timeRestore$.next(true);
        unifiedSearchManager.api.setTimeRange({
          to: 'now',
          from: 'now-30m',
        });
      });
    });
  });
  describe('reset', () => {
    test('preserves pinned filters in reset when as-code flag path is enabled', () => {
      const lastSavedState$ = new BehaviorSubject<DashboardState>(
        getSampleDashboardState({
          filters: [
            {
              type: 'condition',
              condition: {
                field: 'status',
                operator: 'is',
                value: 'active',
              },
            },
          ],
        })
      );
      const unifiedSearchManager = initializeUnifiedSearchManager(
        lastSavedState$.value,
        new BehaviorSubject<boolean>(false),
        new Subject<void>(),
        () => lastSavedState$.value,
        new Subject(),
        {
          useUnifiedSearchIntegration: false,
          unifiedSearchSettings: {
            kbnUrlStateStorage: {} as any,
            useAsCodeFilters: true,
          },
        }
      );

      unifiedSearchManager.api.setFilters([
        {
          meta: {
            key: 'host.name',
            type: 'phrase',
            params: { query: 'web-01' },
            disabled: false,
            negate: false,
            alias: null,
          },
          query: {
            match_phrase: {
              'host.name': 'web-01',
            },
          },
          $state: { store: FilterStateStore.GLOBAL_STATE },
        },
      ]);

      unifiedSearchManager.internalApi.reset(lastSavedState$.value);

      expect(unifiedSearchManager.internalApi.getState().filters).toEqual([
        {
          type: 'condition',
          condition: {
            field: 'status',
            operator: 'is',
            value: 'active',
          },
        },
      ]);
    });
  });

  describe('getState', () => {
    test('Should return as code filters', () => {
      const lastSavedState$ = new BehaviorSubject<DashboardState>(
        getSampleDashboardState({
          filters: [
            {
              type: 'condition',
              condition: {
                field: 'status',
                operator: 'is',
                value: 'active',
              },
            },
          ],
        })
      );
      const unifiedSearchManager = initializeUnifiedSearchManager(
        lastSavedState$.value,
        new BehaviorSubject<boolean>(false),
        new Subject<void>(),
        () => lastSavedState$.value,
        new Subject(),
        {
          useUnifiedSearchIntegration: false,
        }
      );
      // change the unified search filter
      unifiedSearchManager.api.setFilters([
        {
          meta: {
            key: 'status',
            type: 'phrase',
          },
          query: {
            match_phrase: {
              status: 'inactive',
            },
          },
        },
      ]);
      expect(unifiedSearchManager.internalApi.getState().filters).toEqual([
        {
          type: 'condition',
          condition: {
            field: 'status',
            operator: 'is',
            value: 'inactive',
          },
        },
      ]);
    });
  });
});
