/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ESQLVariableType } from '@kbn/esql-types';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { Filter } from '@kbn/es-query';
import { buildEpisodesQuery } from '@kbn/alerting-v2-common-queries';
import { executeEsqlQuery } from '../utils/execute_esql_query';
import { fetchAlertingEpisodes } from './fetch_alerting_episodes';

jest.mock('../utils/execute_esql_query');

const mockExecuteEsqlQuery = jest.mocked(executeEsqlQuery);

const SPACE_ID = 'default';

describe('fetchAlertingEpisodes', () => {
  const mockExpressions = {} as ExpressionsStart;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteEsqlQuery.mockResolvedValue([]);
  });

  it('should call executeEsqlQuery with correct parameters', async () => {
    const pageSize = 10;
    const expectedQuery = buildEpisodesQuery(SPACE_ID, {
      sortField: '@timestamp',
      sortDirection: 'desc',
    }).print('basic');

    await fetchAlertingEpisodes({
      spaceId: SPACE_ID,
      pageSize,
      services: { expressions: mockExpressions },
    });

    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
    expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
      expressions: mockExpressions,
      query: expectedQuery,
      input: {
        type: 'kibana_context',
        esqlVariables: [
          {
            key: 'pageSize',
            value: pageSize,
            type: ESQLVariableType.VALUES,
          },
        ],
      },
      abortSignal: undefined,
    });
  });

  it('should call executeEsqlQuery with different page size', async () => {
    const pageSize = 20;
    const expectedQuery = buildEpisodesQuery(SPACE_ID, {
      sortField: '@timestamp',
      sortDirection: 'desc',
    }).print('basic');

    await fetchAlertingEpisodes({
      spaceId: SPACE_ID,
      pageSize,
      services: { expressions: mockExpressions },
    });

    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
    expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
      expressions: mockExpressions,
      query: expectedQuery,
      input: {
        type: 'kibana_context',
        esqlVariables: [
          {
            key: 'pageSize',
            value: pageSize,
            type: ESQLVariableType.VALUES,
          },
        ],
      },
      abortSignal: undefined,
    });
  });

  it('should call executeEsqlQuery with abort signal when provided', async () => {
    const pageSize = 15;
    const abortController = new AbortController();
    const abortSignal = abortController.signal;
    const expectedQuery = buildEpisodesQuery(SPACE_ID, {
      sortField: '@timestamp',
      sortDirection: 'desc',
    }).print('basic');

    await fetchAlertingEpisodes({
      spaceId: SPACE_ID,
      pageSize,
      abortSignal,
      services: { expressions: mockExpressions },
    });

    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
    expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
      expressions: mockExpressions,
      query: expectedQuery,
      input: {
        type: 'kibana_context',
        esqlVariables: [
          {
            key: 'pageSize',
            value: pageSize,
            type: ESQLVariableType.VALUES,
          },
        ],
      },
      abortSignal,
    });
  });

  it('should apply the time range to the alert events only, as a request filter', async () => {
    await fetchAlertingEpisodes({
      spaceId: SPACE_ID,
      pageSize: 10,
      timeRange: { from: '2026-09-10T10:00:00.000Z', to: '2026-09-10T12:00:00.000Z' },
      services: { expressions: mockExpressions },
    });

    const { input, timeField } = mockExecuteEsqlQuery.mock.calls[0][0] as {
      input: { timeRange?: unknown; filters?: Filter[] };
      timeField?: string;
    };
    expect(timeField).toBeUndefined();
    expect(input.timeRange).toBeUndefined();
    expect(input.filters).toHaveLength(1);
    expect(input.filters?.[0].query?.bool.should).toEqual([
      {
        bool: {
          filter: [
            { term: { type: 'alert' } },
            {
              range: {
                '@timestamp': {
                  format: 'strict_date_optional_time',
                  gte: '2026-09-10T10:00:00.000Z',
                  lte: '2026-09-10T12:00:00.000Z',
                },
              },
            },
          ],
        },
      },
      { exists: { field: 'action_type' } },
    ]);
  });

  it('should call executeEsqlQuery with custom sort parameters', async () => {
    const pageSize = 25;
    const sortState = {
      sortField: 'episode.status',
      sortDirection: 'asc' as const,
    };
    const expectedQuery = buildEpisodesQuery(SPACE_ID, sortState).print('basic');

    await fetchAlertingEpisodes({
      spaceId: SPACE_ID,
      pageSize,
      sortState,
      services: { expressions: mockExpressions },
    });

    expect(mockExecuteEsqlQuery).toHaveBeenCalledTimes(1);
    expect(mockExecuteEsqlQuery).toHaveBeenCalledWith({
      expressions: mockExpressions,
      query: expectedQuery,
      input: {
        type: 'kibana_context',
        esqlVariables: [
          {
            key: 'pageSize',
            value: pageSize,
            type: ESQLVariableType.VALUES,
          },
        ],
      },
      abortSignal: undefined,
    });
  });
});
