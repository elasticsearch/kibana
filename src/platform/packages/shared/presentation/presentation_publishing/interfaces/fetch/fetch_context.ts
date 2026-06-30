/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AggregateQuery, Filter, Query, TimeRange, ProjectRouting } from '@kbn/es-query';
import { COMPARE_ALL_OPTIONS, onlyDisabledFiltersChanged } from '@kbn/es-query';
import type { ESQLControlVariable } from '@kbn/esql-types';
import fastIsEqual from 'fast-deep-equal';

export interface FetchContext {
  isReload: boolean;
  filters: Filter[] | undefined;
  query: Query | AggregateQuery | undefined;
  searchSessionId: string | undefined;
  timeRange: TimeRange | undefined;
  timeslice: [number, number] | undefined;
  esqlVariables: ESQLControlVariable[] | undefined;
  projectRouting: ProjectRouting | undefined;
  useApproximation: boolean | undefined;
}

export interface ReloadTimeFetchContext extends Omit<FetchContext, 'isReload'> {
  reloadTimestamp?: number;
}

export function isReloadTimeFetchContextEqual(
  previousContext: ReloadTimeFetchContext,
  currentContext: ReloadTimeFetchContext
): boolean {
  return (
    isReloadTimestampEqualForFetch(
      previousContext.reloadTimestamp,
      currentContext.reloadTimestamp
    ) &&
    areFiltersEqualForFetch(previousContext.filters, currentContext.filters) &&
    isQueryEqualForFetch(previousContext.query, currentContext.query) &&
    isTimeRangeEqualForFetch(previousContext.timeRange, currentContext.timeRange) &&
    isProjectRoutingEqualForFetch(previousContext.projectRouting, currentContext.projectRouting) &&
    isTimeSliceEqualForFetch(previousContext.timeslice, currentContext.timeslice) &&
    areVariablesEqualForFetch(previousContext.esqlVariables, currentContext.esqlVariables) &&
    previousContext.useApproximation === currentContext.useApproximation
  );
}

const isProjectRoutingEqualForFetch = (
  currentProjectRouting: ProjectRouting,
  lastProjectRouting: ProjectRouting
) => {
  return currentProjectRouting === lastProjectRouting;
};

export const areFiltersEqualForFetch = (currentFilters?: Filter[], lastFilters?: Filter[]) => {
  return onlyDisabledFiltersChanged(currentFilters, lastFilters, {
    ...COMPARE_ALL_OPTIONS,
    // do not compare $state to avoid refreshing when filter is pinned/unpinned (which does not impact results)
    state: false,
  });
};

export const isReloadTimestampEqualForFetch = (
  previousReloadTimestamp?: number,
  currentReloadTimestamp?: number
) => {
  if (!currentReloadTimestamp) return true; // if current reload timestamp is not set, this is not a force refresh.
  return currentReloadTimestamp === previousReloadTimestamp;
};

export const isQueryEqualForFetch = (
  currentQuery: Query | AggregateQuery | undefined,
  lastQuery: Query | AggregateQuery | undefined
) => fastIsEqual(currentQuery, lastQuery);

export const isTimeRangeEqualForFetch = (
  currentTimeRange: TimeRange | undefined,
  lastTimeRange: TimeRange | undefined
) => fastIsEqual(currentTimeRange, lastTimeRange);

export const isTimeSliceEqualForFetch = (
  currentTimeslice: [number, number] | undefined,
  lastTimeslice: [number, number] | undefined
) => fastIsEqual(currentTimeslice, lastTimeslice);

const areVariablesEqualForFetch = (
  currentVariables: ESQLControlVariable[] | undefined,
  lastVariables: ESQLControlVariable[] | undefined
) => fastIsEqual(currentVariables, lastVariables);
