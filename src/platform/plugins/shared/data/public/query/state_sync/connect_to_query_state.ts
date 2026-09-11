/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Subscription } from 'rxjs';
import { filter, map } from 'rxjs';
import _ from 'lodash';
import { COMPARE_ALL_OPTIONS, compareFilters, FilterStateStore } from '@kbn/es-query';
import type { BaseStateContainer } from '@kbn/kibana-utils-plugin/public';
import type { QuerySetup, QueryStart } from '../query_service';
import type { QueryState } from '../query_state';
import type { QueryStateChange } from './types';
import { validateTimeRange } from '../timefilter';

/**
 * Helper to setup two-way syncing of global data and a state container
 * @param QueryService: either setup or start
 * @param stateContainer to use for syncing
 */
export const connectToQueryState = <S extends QueryState>(
  {
    timefilter: { timefilter },
    filterManager,
    queryString,
    state$,
  }: Pick<QueryStart | QuerySetup, 'timefilter' | 'filterManager' | 'queryString' | 'state$'>,
  stateContainer: BaseStateContainer<S>,
  syncConfig: {
    time?: boolean;
    refreshInterval?: boolean;
    filters?: FilterStateStore | boolean;
    query?: boolean;
  }
) => {
  const syncKeys: Array<keyof QueryStateChange> = [];
  if (syncConfig.time) {
    syncKeys.push('time');
  }
  if (syncConfig.query) {
    syncKeys.push('query');
  }
  if (syncConfig.refreshInterval) {
    syncKeys.push('refreshInterval');
  }
  if (syncConfig.filters) {
    switch (syncConfig.filters) {
      case true:
        syncKeys.push('filters');
        break;
      case FilterStateStore.APP_STATE:
        syncKeys.push('appFilters');
        break;
      case FilterStateStore.GLOBAL_STATE:
        syncKeys.push('globalFilters');
        break;
    }
  }

  // initial syncing
  // TODO:
  // data services take precedence, this seems like a good default,
  // and apps could anyway set their own value after initialisation,
  // but maybe maybe this should be a configurable option?
  const initialState: QueryState = { ...stateContainer.get() };
  let initialDirty = false;
  if (syncConfig.time && !_.isEqual(initialState.time, timefilter.getTime())) {
    initialState.time = timefilter.getTime();
    initialDirty = true;
  }
  if (
    syncConfig.refreshInterval &&
    !_.isEqual(initialState.refreshInterval, timefilter.getRefreshInterval())
  ) {
    initialState.refreshInterval = timefilter.getRefreshInterval();
    initialDirty = true;
  }

  if (syncConfig.filters) {
    if (syncConfig.filters === true) {
      if (
        !initialState.filters ||
        !compareFilters(initialState.filters, filterManager.getFilters(), COMPARE_ALL_OPTIONS)
      ) {
        initialState.filters = filterManager.getFilters();
        initialDirty = true;
      }
    } else if (syncConfig.filters === FilterStateStore.GLOBAL_STATE) {
      if (
        !initialState.filters ||
        !compareFilters(initialState.filters, filterManager.getGlobalFilters(), {
          ...COMPARE_ALL_OPTIONS,
          state: false,
        })
      ) {
        initialState.filters = filterManager.getGlobalFilters();
        initialDirty = true;
      }
    } else if (syncConfig.filters === FilterStateStore.APP_STATE) {
      if (
        !initialState.filters ||
        !compareFilters(initialState.filters, filterManager.getAppFilters(), {
          ...COMPARE_ALL_OPTIONS,
          state: false,
        })
      ) {
        initialState.filters = filterManager.getAppFilters();
        initialDirty = true;
      }
    }
  }

  if (initialDirty) {
    stateContainer.set({ ...stateContainer.get(), ...initialState });
  }

  // to ignore own state updates
  let updateInProgress = false;

  const subs: Subscription[] = [
    state$
      .pipe(
        filter(({ changes, state }) => {
          if (updateInProgress) return false;
          return syncKeys.some((syncKey) => changes[syncKey]);
        }),
        map(({ changes }) => {
          const newState: QueryState = {};
          if (syncConfig.time && changes.time) {
            newState.time = timefilter.getTime();
          }
          if (syncConfig.query && changes.query) {
            newState.query = queryString.getQuery();
          }
          if (syncConfig.refreshInterval && changes.refreshInterval) {
            newState.refreshInterval = timefilter.getRefreshInterval();
          }
          if (syncConfig.filters) {
            if (syncConfig.filters === true && changes.filters) {
              newState.filters = filterManager.getFilters();
            } else if (
              syncConfig.filters === FilterStateStore.GLOBAL_STATE &&
              changes.globalFilters
            ) {
              newState.filters = filterManager.getGlobalFilters();
            } else if (syncConfig.filters === FilterStateStore.APP_STATE && changes.appFilters) {
              newState.filters = filterManager.getAppFilters();
            }
          }
          return newState;
        })
      )
      .subscribe((newState) => {
        stateContainer.set({ ...stateContainer.get(), ...newState });
      }),
    stateContainer.state$.subscribe((state) => {
      updateInProgress = true;

      // cloneDeep is required because services are mutating passed objects
      // and state in state container is frozen
      if (syncConfig.time) {
        const isTimeValid = validateTimeRange(state.time);
        const time = isTimeValid ? state.time : timefilter.getTimeDefaults();
        if (!_.isEqual(time, timefilter.getTime())) {
          timefilter.setTime(_.cloneDeep(time!));
        }
        // an invalid time range (e.g. edited directly in the URL) must not be echoed back
        // into the state container, otherwise consumers like the DateRangePicker would
        // render the raw, unvalidated value instead of the normalized default
        if (!isTimeValid) {
          stateContainer.set({ ...state, time: _.cloneDeep(time) });
        }
      }

      if (syncConfig.refreshInterval) {
        const refreshInterval = state.refreshInterval || timefilter.getRefreshIntervalDefaults();
        if (!_.isEqual(refreshInterval, timefilter.getRefreshInterval())) {
          timefilter.setRefreshInterval(_.cloneDeep(refreshInterval));
        }
      }

      if (syncConfig.query) {
        const curQuery = state.query || queryString.getQuery();
        if (!_.isEqual(curQuery, queryString.getQuery())) {
          queryString.setQuery(_.cloneDeep(curQuery));
        }
      }

      if (syncConfig.filters) {
        const filters = state.filters || [];
        if (syncConfig.filters === true) {
          if (!compareFilters(filters, filterManager.getFilters(), COMPARE_ALL_OPTIONS)) {
            filterManager.setFilters(_.cloneDeep(filters));
          }
        } else if (syncConfig.filters === FilterStateStore.APP_STATE) {
          if (
            !compareFilters(filters, filterManager.getAppFilters(), {
              ...COMPARE_ALL_OPTIONS,
              state: false,
            })
          ) {
            filterManager.setAppFilters(_.cloneDeep(filters));
          }
        } else if (syncConfig.filters === FilterStateStore.GLOBAL_STATE) {
          if (
            !compareFilters(filters, filterManager.getGlobalFilters(), {
              ...COMPARE_ALL_OPTIONS,
              state: false,
            })
          ) {
            filterManager.setGlobalFilters(_.cloneDeep(filters));
          }
        }
      }

      updateInProgress = false;
    }),
  ];

  return () => {
    subs.forEach((s) => s.unsubscribe());
  };
};
