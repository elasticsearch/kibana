/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useFetchSignalFirings } from './use_fetch_signal_firings';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { ESQLSearchResponse } from '@kbn/es-types';

jest.mock('@kbn/alerting-v2-episodes-ui/utils/run_esql_async_search', () => ({
  runEsqlAsyncSearch: jest.fn(),
}));
jest.mock('@kbn/alerting-v2-episodes-ui/utils/esql_response_to_rows', () => ({
  esqlResponseToObjectRows: jest.fn(),
}));
jest.mock('@kbn/alerting-v2-episodes-ui/utils/histogram_utils', () => ({
  computeBucketInterval: jest.fn(() => '1h'),
}));

import { runEsqlAsyncSearch } from '@kbn/alerting-v2-episodes-ui/utils/run_esql_async_search';
import { esqlResponseToObjectRows } from '@kbn/alerting-v2-episodes-ui/utils/esql_response_to_rows';

const mockRunEsqlAsyncSearch = runEsqlAsyncSearch as jest.MockedFunction<typeof runEsqlAsyncSearch>;
const mockEsqlResponseToObjectRows = esqlResponseToObjectRows as jest.MockedFunction<
  typeof esqlResponseToObjectRows
>;

const GTE_MS = Date.parse('2026-06-01T00:00:00.000Z');
const LTE_MS = Date.parse('2026-06-02T00:00:00.000Z');
const RULE_ID = 'rule-abc';

const mockData = {} as DataPublicPluginStart;

// Distinct, opaque ES|QL responses used as identity sentinels in the mocks below.
const rawResponse = (): ESQLSearchResponse => ({ columns: [], values: [] });

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

const defaultOptions = { ruleId: RULE_ID, gteMs: GTE_MS, lteMs: LTE_MS, data: mockData };

describe('useFetchSignalFirings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not fetch when ruleId is undefined', async () => {
    renderHook(() => useFetchSignalFirings({ ...defaultOptions, ruleId: undefined }), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(mockRunEsqlAsyncSearch).not.toHaveBeenCalled();
  });

  it('does not fetch when the time range is invalid (lteMs <= gteMs)', async () => {
    renderHook(() => useFetchSignalFirings({ ...defaultOptions, lteMs: GTE_MS }), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(mockRunEsqlAsyncSearch).not.toHaveBeenCalled();
  });

  it('returns isLoading: false when disabled', () => {
    const { result } = renderHook(
      () => useFetchSignalFirings({ ...defaultOptions, ruleId: undefined }),
      { wrapper: createWrapper() }
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('transforms histogram rows into buckets', async () => {
    const RAW = rawResponse();
    const RAW_SUMMARY = rawResponse();
    mockRunEsqlAsyncSearch.mockResolvedValueOnce(RAW).mockResolvedValueOnce(RAW_SUMMARY);

    mockEsqlResponseToObjectRows.mockImplementation((raw) => {
      if (raw === RAW) {
        return [
          { ts: '2026-06-01T00:00:00.000Z', count: 3 },
          { ts: '2026-06-01T01:00:00.000Z', count: 7 },
        ] as never;
      }
      return [] as never;
    });

    const { result } = renderHook(() => useFetchSignalFirings(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.buckets).toEqual([
      { timeMs: Date.parse('2026-06-01T00:00:00.000Z'), count: 3 },
      { timeMs: Date.parse('2026-06-01T01:00:00.000Z'), count: 7 },
    ]);
    expect(result.current.isHistogramError).toBe(false);
  });

  it('filters out buckets with unparseable timestamps', async () => {
    const RAW = rawResponse();
    mockRunEsqlAsyncSearch.mockResolvedValueOnce(RAW).mockResolvedValueOnce(rawResponse());

    mockEsqlResponseToObjectRows.mockImplementation((raw) => {
      if (raw === RAW) {
        return [
          { ts: '2026-06-01T00:00:00.000Z', count: 5 },
          { ts: 'not-a-date', count: 2 },
        ] as never;
      }
      return [] as never;
    });

    const { result } = renderHook(() => useFetchSignalFirings(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.buckets).toHaveLength(1);
    expect(result.current.buckets[0].count).toBe(5);
  });

  it('returns lastFiringMs from the summary query', async () => {
    const LAST_FIRING_ISO = '2026-06-01T14:30:00.000Z';
    const RAW_SUMMARY = rawResponse();
    mockRunEsqlAsyncSearch.mockResolvedValueOnce(rawResponse()).mockResolvedValueOnce(RAW_SUMMARY);

    mockEsqlResponseToObjectRows.mockImplementation((raw) => {
      if (raw === RAW_SUMMARY) {
        return [{ last_firing: LAST_FIRING_ISO }] as never;
      }
      return [] as never;
    });

    const { result } = renderHook(() => useFetchSignalFirings(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lastFiringMs).toBe(Date.parse(LAST_FIRING_ISO));
  });

  it('returns null for lastFiringMs when the summary returns no rows', async () => {
    mockRunEsqlAsyncSearch
      .mockResolvedValueOnce(rawResponse())
      .mockResolvedValueOnce(rawResponse());
    mockEsqlResponseToObjectRows.mockReturnValue([] as never);

    const { result } = renderHook(() => useFetchSignalFirings(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lastFiringMs).toBeNull();
  });

  it('sets isHistogramError when the histogram query rejects', async () => {
    mockRunEsqlAsyncSearch
      .mockRejectedValueOnce(new Error('histogram boom'))
      .mockResolvedValueOnce(rawResponse());
    mockEsqlResponseToObjectRows.mockReturnValue([] as never);

    const { result } = renderHook(() => useFetchSignalFirings(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isHistogramError).toBe(true));
    expect(result.current.isSummaryError).toBe(false);
  });

  it('sets isSummaryError when the summary query rejects', async () => {
    mockRunEsqlAsyncSearch
      .mockResolvedValueOnce(rawResponse())
      .mockRejectedValueOnce(new Error('summary boom'));
    mockEsqlResponseToObjectRows.mockReturnValue([] as never);

    const { result } = renderHook(() => useFetchSignalFirings(defaultOptions), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSummaryError).toBe(true));
    expect(result.current.isHistogramError).toBe(false);
  });
});
