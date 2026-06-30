/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import { runEsqlAsyncSearch } from '../utils/run_esql_async_search';
import { useFetchEpisodeTrendQuery } from './use_fetch_episode_trend_query';

jest.mock('../utils/run_esql_async_search');
jest.mock('./use_space_id', () => ({ useSpaceId: () => 'default' }));

const mockRunEsqlAsyncSearch = jest.mocked(runEsqlAsyncSearch);

const mockServices = {
  data: {} as DataPublicPluginStart,
  spaces: {} as SpacesPluginStart,
};

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useFetchEpisodeTrendQuery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is disabled (does not fetch) when episodeId is undefined', () => {
    const { result } = renderHook(
      () =>
        useFetchEpisodeTrendQuery({
          episodeId: undefined,
          metricLabels: ['count'],
          services: mockServices,
        }),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockRunEsqlAsyncSearch).not.toHaveBeenCalled();
  });

  it('fetches the episode rule-events and maps the projected metric columns to rows', async () => {
    mockRunEsqlAsyncSearch.mockResolvedValue({
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: 'episode.status', type: 'keyword' },
        { name: 'count', type: 'keyword' },
      ],
      values: [['2026-06-18T00:00:00.000Z', 'active', '10']],
    } as Awaited<ReturnType<typeof runEsqlAsyncSearch>>);

    const { result } = renderHook(
      () =>
        useFetchEpisodeTrendQuery({
          episodeId: 'ep1',
          metricLabels: ['count'],
          services: mockServices,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      {
        '@timestamp': '2026-06-18T00:00:00.000Z',
        'episode.status': 'active',
        metrics: { count: 10 },
      },
    ]);
    expect(mockRunEsqlAsyncSearch).toHaveBeenCalledTimes(1);
  });
});
