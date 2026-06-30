/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  readSearchProfilerState,
  SEARCH_PROFILER_STATE_STORAGE_KEY,
  updateSearchProfilerState,
  writeSearchProfilerState,
} from './search_profiler_state_storage';

describe('search profiler state storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty state when nothing is stored', () => {
    expect(readSearchProfilerState()).toEqual({});
  });

  it('stores and reads the current query and index', () => {
    writeSearchProfilerState({
      index: 'logs-*',
      query: '{ "query": { "match_all": {} } }',
    });

    expect(readSearchProfilerState()).toEqual({
      index: 'logs-*',
      query: '{ "query": { "match_all": {} } }',
    });
  });

  it('merges partial updates into the stored state', () => {
    writeSearchProfilerState({
      index: 'logs-*',
      query: '{ "query": { "match_all": {} } }',
    });

    updateSearchProfilerState({
      index: 'metrics-*',
    });

    expect(readSearchProfilerState()).toEqual({
      index: 'metrics-*',
      query: '{ "query": { "match_all": {} } }',
    });
  });

  it('ignores malformed stored state', () => {
    window.localStorage.setItem(SEARCH_PROFILER_STATE_STORAGE_KEY, '{not valid json');

    expect(readSearchProfilerState()).toEqual({});
  });

  it('ignores stored state with unexpected value types', () => {
    window.localStorage.setItem(
      SEARCH_PROFILER_STATE_STORAGE_KEY,
      JSON.stringify({ index: ['logs-*'], query: 123 })
    );

    expect(readSearchProfilerState()).toEqual({});
  });
});
