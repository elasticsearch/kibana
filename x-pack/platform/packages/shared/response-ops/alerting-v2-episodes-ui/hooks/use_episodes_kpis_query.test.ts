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
import { expressionsPluginMock } from '@kbn/expressions-plugin/public/mocks';
import { spacesPluginMock } from '@kbn/spaces-plugin/public/mocks';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import type { GetUserProfileResponse } from '@kbn/core-user-profile-browser';
import { useEpisodesKpisQuery } from './use_episodes_kpis_query';
import { executeEsqlQuery } from '../utils/execute_esql_query';
import { createTestEpisodeSource } from '../types/episode_data_source.mock';
import type { EpisodeSourceKpis } from '../types/episode_data_source';
import { EpisodeDataSourceProvider } from '../context/episode_data_source_context';
import { useSpaceId } from './use_space_id';

jest.mock('../utils/execute_esql_query');
jest.mock('./use_space_id');

const mockExecuteEsqlQuery = jest.mocked(executeEsqlQuery);
const mockUseSpaceId = jest.mocked(useSpaceId);
mockUseSpaceId.mockReturnValue('default');

const sourceWithKpis = (fetchKpis: () => Promise<EpisodeSourceKpis>) =>
  createTestEpisodeSource({ fetchKpis });

const mockUserProfile = userProfileServiceMock.createStart();
mockUserProfile.getCurrent.mockResolvedValue({ uid: 'user-123' } as GetUserProfileResponse);

const mockServices = {
  expressions: expressionsPluginMock.createStartContract(),
  spaces: spacesPluginMock.createStartContract(),
  userProfile: mockUserProfile,
  http: httpServiceMock.createStartContract(),
};

const mockTimeRange = {
  from: '2024-01-01T00:00:00.000Z',
  to: '2024-01-01T02:00:00.000Z',
};

const mockKpisRow = {
  alerts_count: 5,
  firing_rules: 2,
  assigned_to_me: 1,
  unassigned: 3,
  acknowledged: 4,
  snoozed: 0,
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
  mockUseSpaceId.mockReturnValue('default');
});

describe('useEpisodesKpisQuery', () => {
  it('returns mapped KPI data when the query succeeds', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([mockKpisRow]);

    const { result } = renderHook(
      () =>
        useEpisodesKpisQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual({
      alertsCount: 5,
      firingRules: 2,
      assignedToMe: 1,
      unassigned: 3,
      acknowledged: 4,
      snoozed: 0,
    });
  });

  it('returns undefined data and isError=true when the query fails', async () => {
    mockExecuteEsqlQuery.mockRejectedValue(new Error('ES|QL error'));

    const { result } = renderHook(
      () =>
        useEpisodesKpisQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns undefined data when ES|QL returns no rows', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([]);

    const { result } = renderHook(
      () =>
        useEpisodesKpisQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeUndefined();
  });

  it('sends the time range as an alert-events-only request filter', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([mockKpisRow]);

    renderHook(
      () =>
        useEpisodesKpisQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
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

  it('passes currentUserUid from getCurrent to the query', async () => {
    mockUserProfile.getCurrent.mockResolvedValue({
      uid: 'specific-user-uid',
    } as GetUserProfileResponse);
    mockExecuteEsqlQuery.mockResolvedValue([mockKpisRow]);

    renderHook(
      () =>
        useEpisodesKpisQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockExecuteEsqlQuery).toHaveBeenCalled());
    const queryArg = mockExecuteEsqlQuery.mock.calls[0][0].query;
    expect(queryArg).toContain('specific-user-uid');
  });

  it('still fetches KPIs when the user has no profile', async () => {
    // `getCurrent` resolves `null` at runtime for anonymous or proxy-authenticated
    // users, even though its return type is non-nullable.
    mockUserProfile.getCurrent.mockResolvedValue(null as unknown as GetUserProfileResponse);
    mockExecuteEsqlQuery.mockResolvedValue([mockKpisRow]);

    const { result } = renderHook(
      () =>
        useEpisodesKpisQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({
      alertsCount: 5,
      firingRules: 2,
      assignedToMe: 1,
      unassigned: 3,
      acknowledged: 4,
      snoozed: 0,
    });
  });

  it('merges source KPI counts additively with v2 counts', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([mockKpisRow]);

    const { result } = renderHook(
      () =>
        useEpisodesKpisQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
        }),
      {
        wrapper: createWrapper(
          sourceWithKpis(
            jest.fn().mockResolvedValue({
              alerts_count: 10,
              firing_rules: 3,
              assigned_to_me: 0,
              unassigned: 10,
              acknowledged: 2,
              snoozed: 1,
            })
          )
        ),
      }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual({
      alertsCount: 15, // 5 v2 + 10 source
      firingRules: 5, // 2 v2 + 3 source
      assignedToMe: 1, // 1 v2 + 0 source
      unassigned: 13, // 3 v2 + 10 source
      acknowledged: 6, // 4 v2 + 2 source
      snoozed: 1, // 0 v2 + 1 source
    });
  });

  it('returns v2-only KPIs when a source fetch fails', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([mockKpisRow]);

    const { result } = renderHook(
      () =>
        useEpisodesKpisQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
        }),
      {
        wrapper: createWrapper(
          sourceWithKpis(jest.fn().mockRejectedValue(new Error('source fetch failed')))
        ),
      }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual({
      alertsCount: 5,
      firingRules: 2,
      assignedToMe: 1,
      unassigned: 3,
      acknowledged: 4,
      snoozed: 0,
    });
  });

  it('returns v2-only KPIs when a source does not implement KPIs', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([mockKpisRow]);

    const { result } = renderHook(
      () =>
        useEpisodesKpisQuery({
          services: mockServices,
          filterState: {},
          timeRange: mockTimeRange,
        }),
      { wrapper: createWrapper(createTestEpisodeSource()) }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual({
      alertsCount: 5,
      firingRules: 2,
      assignedToMe: 1,
      unassigned: 3,
      acknowledged: 4,
      snoozed: 0,
    });
  });
});
