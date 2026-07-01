/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getTraceLogsColumns,
  isDiscoverDefaultLogColumns,
  shouldPersistTraceLogsColumnsToUrl,
} from './get_trace_logs_columns';

describe('isDiscoverDefaultLogColumns', () => {
  it('returns true for empty or Summary-only columns', () => {
    expect(isDiscoverDefaultLogColumns()).toBe(true);
    expect(isDiscoverDefaultLogColumns(['_source'])).toBe(true);
    expect(isDiscoverDefaultLogColumns(['@timestamp', '_source'])).toBe(true);
  });

  it('returns false for custom columns', () => {
    expect(isDiscoverDefaultLogColumns(['message'])).toBe(false);
  });
});

describe('getTraceLogsColumns', () => {
  it('prefers URL columns over the setting', () => {
    expect(
      getTraceLogsColumns({
        urlColumns: ['trace.id'],
        defaultColumns: ['message'],
      })
    ).toEqual(['trace.id']);
  });

  it('uses the setting when URL columns are absent', () => {
    expect(
      getTraceLogsColumns({
        defaultColumns: ['message'],
      })
    ).toEqual(['message']);
  });

  it('uses the setting when URL has Discover defaults', () => {
    expect(
      getTraceLogsColumns({
        urlColumns: ['@timestamp', '_source'],
        defaultColumns: ['message'],
      })
    ).toEqual(['message']);
  });

  it('returns undefined when neither URL nor setting provide columns', () => {
    expect(getTraceLogsColumns({ defaultColumns: [] })).toBeUndefined();
  });
});

describe('shouldPersistTraceLogsColumnsToUrl', () => {
  it('does not persist Discover defaults', () => {
    expect(
      shouldPersistTraceLogsColumnsToUrl({
        emittedColumns: ['@timestamp', '_source'],
        defaultColumns: ['message'],
      })
    ).toBe(false);
  });

  it('does not persist columns that match the setting only', () => {
    expect(
      shouldPersistTraceLogsColumnsToUrl({
        emittedColumns: ['message'],
        defaultColumns: ['message'],
      })
    ).toBe(false);
  });

  it('persists columns that differ from the setting', () => {
    expect(
      shouldPersistTraceLogsColumnsToUrl({
        emittedColumns: ['message', 'log.level'],
        defaultColumns: ['message'],
      })
    ).toBe(true);
  });

  it('persists custom columns when no setting is configured', () => {
    expect(
      shouldPersistTraceLogsColumnsToUrl({
        emittedColumns: ['message'],
        defaultColumns: [],
      })
    ).toBe(true);
  });
});
