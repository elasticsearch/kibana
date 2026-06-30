/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const SEARCH_PROFILER_STATE_STORAGE_KEY = 'xpack.searchProfiler.state';

export interface SearchProfilerStoredState {
  index?: string;
  query?: string;
}

const isSearchProfilerStoredState = (value: unknown): value is SearchProfilerStoredState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const { index, query } = value as Partial<Record<keyof SearchProfilerStoredState, unknown>>;

  return (
    (index === undefined || typeof index === 'string') &&
    (query === undefined || typeof query === 'string')
  );
};

export const readSearchProfilerState = (): SearchProfilerStoredState => {
  try {
    const storedValue = window.localStorage.getItem(SEARCH_PROFILER_STATE_STORAGE_KEY);

    if (!storedValue) {
      return {};
    }

    const parsedValue: unknown = JSON.parse(storedValue);

    if (!isSearchProfilerStoredState(parsedValue)) {
      return {};
    }

    return parsedValue;
  } catch {
    return {};
  }
};

export const writeSearchProfilerState = (state: SearchProfilerStoredState): void => {
  try {
    window.localStorage.setItem(SEARCH_PROFILER_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors so Search Profiler remains usable in restricted browser contexts.
  }
};

export const updateSearchProfilerState = (state: SearchProfilerStoredState): void => {
  writeSearchProfilerState({
    ...readSearchProfilerState(),
    ...state,
  });
};
