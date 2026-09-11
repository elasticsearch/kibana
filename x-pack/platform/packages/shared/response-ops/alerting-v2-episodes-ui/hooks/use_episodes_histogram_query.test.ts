/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Filter } from '@kbn/es-query';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { HttpStart } from '@kbn/core-http-browser';
import { useEpisodesHistogramQuery } from './use_episodes_histogram_query';
import { executeEsqlQuery } from '../utils/execute_esql_query';
import { createTestEpisodeSource } from '../types/episode_data_source.mock';
import type { EpisodeSourceHistogram } from '../types/episode_data_source';
import { EpisodeDataSourceProvider } from '../context/episode_data_source_context';
import { useSpaceId } from './use_space_id';
import { HISTOGRAM_EPISODE_LIMIT } from '../constants';
import type { HistogramEpisodeRow } from '../utils/histogram_utils';

jest.mock('../utils/execute_esql_query');
jest.mock('./use_space_id');

const mockExecuteEsqlQuery = jest.mocked(executeEsqlQuery);
const mockUseSpaceId = jest.mocked(useSpaceId);
mockUseSpaceId.mockReturnValue('default');

const sourceWithHistogram = (fetchHistogram: () => Promise<EpisodeSourceHistogram>) =>
  createTestEpisodeSource({ fetchHistogram });

const mockServices = {
  expressions: {} as ExpressionsStart,
  spaces: {} as SpacesPluginStart,
  http: {} as HttpStart,
};

const mockTimeRange = {
  from: '2024-01-01T00:00:00.000Z',
  to: '2024-01-01T02:00:00.000Z',
};

const createWrapper = (dataSource?: ReturnType<typeof createTestEpisodeSource>) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => {
    const qcProvider = React.createElement(QueryClientProvider, { client: queryClient }, children);
    return dataSource
      ? React.createElement(EpisodeDataSourceProvider, { dataSource }, qcProvider)
      : qcProvider;
  };
};

afterEach(() => {
  jest.clearAllMocks();
  mockUseSpaceId.mockReturnValue('default'); // restore after clearAllMocks
});

describe('useEpisodesHistogramQuery', () => {
  it('returns a Datatable when the query succeeds', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([
      {
        first_timestamp: '2024-01-01T00:00:00.000Z',
        last_timestamp: '2024-01-01T00:30:00.000Z',
        'episode.status': 'inactive',
      },
    ]);

    const { result } = renderHook(
      () =>
        useEpisodesHistogramQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
          bucketInterval: '1h',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.table).toBeDefined();
    expect(result.current.table?.type).toBe('datatable');
    expect(result.current.isCapHit).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it('sets isCapHit when result has exactly HISTOGRAM_EPISODE_LIMIT rows', async () => {
    mockExecuteEsqlQuery.mockResolvedValue(
      Array.from({ length: HISTOGRAM_EPISODE_LIMIT }, () => ({
        first_timestamp: '2024-01-01T00:00:00.000Z',
        last_timestamp: '2024-01-01T01:00:00.000Z',
        'episode.status': 'inactive',
      }))
    );

    const { result } = renderHook(
      () =>
        useEpisodesHistogramQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
          bucketInterval: '1h',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isCapHit).toBe(true);
  });

  it('returns error when query fails', async () => {
    const mockError = new Error('ES|QL failed');
    mockExecuteEsqlQuery.mockRejectedValue(mockError);

    const { result } = renderHook(
      () =>
        useEpisodesHistogramQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
          bucketInterval: '1h',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeDefined();
    expect(result.current.table).toBeUndefined();
  });

  it('passes breakdownField to the query builder', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([]);

    renderHook(
      () =>
        useEpisodesHistogramQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
          bucketInterval: '1h',
          breakdownField: 'rule.id',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockExecuteEsqlQuery).toHaveBeenCalled());
    const queryArg = mockExecuteEsqlQuery.mock.calls[0][0].query;
    expect(queryArg).toMatch(/rule\.id/);
  });

  it('fills future breakdown buckets with zero-count rows for known categories', async () => {
    // Time range covers two 1-hour buckets; only the first has an episode.
    // The second (future-like) bucket must still appear in the datatable for each known
    // breakdown category so the chart x-axis covers the full selected time range.
    mockExecuteEsqlQuery.mockResolvedValue([
      {
        first_timestamp: '2024-01-01T00:00:00.000Z',
        last_timestamp: '2024-01-01T00:30:00.000Z',
        'episode.status': 'inactive',
      },
    ]);

    const { result } = renderHook(
      () =>
        useEpisodesHistogramQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange, // covers 00:00–02:00 → two 1h buckets
          bucketInterval: '1h',
          breakdownField: 'episode.status',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const rows = result.current.table?.rows ?? [];
    // Both buckets must be present for the known category 'inactive'
    const inactiveRows = rows.filter((r) => r['episode.status'] === 'inactive');
    expect(inactiveRows.length).toBe(2);
    // The second bucket must be zero-count
    const secondBucket = inactiveRows.find(
      (r) =>
        new Date(r.time_bucket as string).getTime() ===
        new Date('2024-01-01T01:00:00.000Z').getTime()
    );
    expect(secondBucket?.count).toBe(0);
  });

  it('sends the time range as an alert-events-only request filter', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([]);

    renderHook(
      () =>
        useEpisodesHistogramQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
          bucketInterval: '1h',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockExecuteEsqlQuery).toHaveBeenCalled());
    const inputArg = mockExecuteEsqlQuery.mock.calls[0][0].input as {
      timeRange?: unknown;
      filters?: Filter[];
    };
    // The range is sent as a request filter on the alert events only, so the
    // action documents are kept whatever their timestamp.
    expect(inputArg.timeRange).toBeUndefined();
    expect(inputArg.filters).toHaveLength(1);
    const should = inputArg.filters?.[0].query?.bool.should;
    expect(should[0].bool.filter[1].range['@timestamp']).toEqual(
      expect.objectContaining({ gte: mockTimeRange.from, lte: mockTimeRange.to })
    );
    expect(should[1]).toEqual({ exists: { field: 'action_type' } });
  });

  it('concatenates source histogram rows with v2 rows', async () => {
    const v2Row: HistogramEpisodeRow = {
      first_timestamp: '2024-01-01T00:00:00.000Z',
      last_timestamp: '2024-01-01T00:30:00.000Z',
      'episode.status': 'inactive',
    };
    const sourceRow: HistogramEpisodeRow = {
      first_timestamp: '2024-01-01T01:00:00.000Z',
      last_timestamp: '2024-01-01T01:30:00.000Z',
      'episode.status': 'active',
    };
    mockExecuteEsqlQuery.mockResolvedValue([v2Row]);

    const { result } = renderHook(
      () =>
        useEpisodesHistogramQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
          bucketInterval: '1h',
        }),
      {
        wrapper: createWrapper(
          sourceWithHistogram(jest.fn().mockResolvedValue({ rows: [sourceRow], isCapHit: false }))
        ),
      }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.table).toBeDefined();
    const rows = result.current.table?.rows ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('does not set isCapHit when combined rows exceed limit but neither source does individually', async () => {
    const half = Math.floor(HISTOGRAM_EPISODE_LIMIT / 2);
    const v2Rows = Array.from({ length: half }, () => ({
      first_timestamp: '2024-01-01T00:00:00.000Z',
      last_timestamp: '2024-01-01T01:00:00.000Z',
      'episode.status': 'inactive' as const,
    }));
    const sourceRows: HistogramEpisodeRow[] = Array.from({ length: half + 1 }, () => ({
      first_timestamp: '2024-01-01T00:00:00.000Z',
      last_timestamp: '2024-01-01T01:00:00.000Z',
      'episode.status': 'active',
    }));

    mockExecuteEsqlQuery.mockResolvedValue(v2Rows);

    const { result } = renderHook(
      () =>
        useEpisodesHistogramQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
          bucketInterval: '1h',
        }),
      {
        wrapper: createWrapper(
          sourceWithHistogram(jest.fn().mockResolvedValue({ rows: sourceRows, isCapHit: false }))
        ),
      }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isCapHit).toBe(false);
  });

  it('sets isCapHit when a source reports hitting its own cap', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([]);

    const { result } = renderHook(
      () =>
        useEpisodesHistogramQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
          bucketInterval: '1h',
        }),
      {
        wrapper: createWrapper(
          sourceWithHistogram(jest.fn().mockResolvedValue({ rows: [], isCapHit: true }))
        ),
      }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isCapHit).toBe(true);
  });

  it('returns v2-only rows when a source fetch fails', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([
      {
        first_timestamp: '2024-01-01T00:00:00.000Z',
        last_timestamp: '2024-01-01T00:30:00.000Z',
        'episode.status': 'inactive',
      },
    ]);

    const { result } = renderHook(
      () =>
        useEpisodesHistogramQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
          bucketInterval: '1h',
        }),
      {
        wrapper: createWrapper(
          sourceWithHistogram(jest.fn().mockRejectedValue(new Error('source fetch failed')))
        ),
      }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.table).toBeDefined();
    expect(result.current.error).toBeUndefined();
  });
});
