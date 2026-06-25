/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { processLiveHistory } from './process_live_history';

jest.mock('../../lib/get_result_counts_for_actions', () => ({
  getResultCountsForActions: jest.fn(),
}));

const mockGetResultCountsForActions = jest.requireMock('../../lib/get_result_counts_for_actions')
  .getResultCountsForActions as jest.Mock;

const createMockOsqueryContext = () => ({
  getStartServices: jest.fn().mockResolvedValue([
    {
      elasticsearch: {
        client: { asInternalUser: {} },
      },
    },
  ]),
});

const createLiveHit = (
  overrides: {
    _source?: Record<string, unknown>;
    fields?: Record<string, unknown>;
    sort?: Array<string | number>;
  } = {}
) => ({
  _source: {
    action_id: 'action-1',
    queries: [{ action_id: 'query-1', query: 'select 1;', agents: ['agent-1'] }],
    '@timestamp': '2024-06-01T12:00:00.000Z',
    space_id: 'default',
    ...overrides._source,
  },
  fields: { action_id: ['action-1'], ...overrides.fields },
  sort: overrides.sort ?? [1710936000000, 1],
});

describe('processLiveHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetResultCountsForActions.mockResolvedValue(new Map());
  });

  it('maps hits to rows and builds sortValuesMap', async () => {
    const hits = [
      createLiveHit({ fields: { action_id: ['a1'] }, sort: [1000, 1] }),
      createLiveHit({
        _source: { action_id: 'a2' },
        fields: { action_id: ['a2'] },
        sort: [2000, 2],
      }),
    ];
    const result = await processLiveHistory({
      liveHits: hits,
      osqueryContext: createMockOsqueryContext() as never,
      spaceId: 'default',
      logger: {} as never,
    });

    expect(result.liveRows).toHaveLength(2);
    expect(result.liveRows[0].actionId).toBe('a1');
    expect(result.sortValuesMap.get('a1')).toEqual([1000, 1]);
    expect(result.sortValuesMap.get('a2')).toEqual([2000, 2]);
  });

  it('returns all rows without post-fetch source filtering', async () => {
    const hits = [
      createLiveHit({
        _source: { action_id: 'live-1', alert_ids: [], queries: [{ action_id: 'q1', query: 'x' }] },
      }),
      createLiveHit({
        _source: {
          action_id: 'rule-1',
          alert_ids: ['alert-1'],
          queries: [{ action_id: 'q2', query: 'y' }],
        },
      }),
    ];
    const result = await processLiveHistory({
      liveHits: hits,
      osqueryContext: createMockOsqueryContext() as never,
      spaceId: 'default',
      logger: {} as never,
    });

    expect(result.liveRows).toHaveLength(2);
    expect(result.liveRows[0].source).toBe('Live');
    expect(result.liveRows[1].source).toBe('Rule');
  });

  it('enriches single query rows with result counts', async () => {
    mockGetResultCountsForActions.mockResolvedValue(
      new Map([
        [
          'query-1',
          {
            totalRows: 42,
            respondedAgents: 2,
            successfulAgents: 2,
            errorAgents: 0,
          },
        ],
      ])
    );

    const hits = [createLiveHit()];
    const result = await processLiveHistory({
      liveHits: hits,
      osqueryContext: createMockOsqueryContext() as never,
      spaceId: 'default',
      logger: {} as never,
    });

    expect(result.liveRows[0].totalRows).toBe(42);
    expect(result.liveRows[0].successCount).toBe(2);
    expect(result.liveRows[0].errorCount).toBe(0);
    expect(mockGetResultCountsForActions).toHaveBeenCalledWith(
      expect.anything(),
      ['query-1'],
      'default',
      ['default'],
      false
    );
  });

  it('enriches pack rows with aggregated result counts', async () => {
    mockGetResultCountsForActions.mockResolvedValue(
      new Map([
        ['query-1', { totalRows: 10, respondedAgents: 1, successfulAgents: 1, errorAgents: 0 }],
        ['query-2', { totalRows: 20, respondedAgents: 2, successfulAgents: 2, errorAgents: 0 }],
      ])
    );

    const hits = [
      createLiveHit({
        _source: {
          action_id: 'pack-action',
          pack_id: 'pack-1',
          pack_name: 'My Pack',
          queries: [
            { action_id: 'query-1', query: 'select 1' },
            { action_id: 'query-2', query: 'select 2' },
          ],
          '@timestamp': '2024-06-01T12:00:00.000Z',
          space_id: 'default',
        },
      }),
    ];
    const result = await processLiveHistory({
      liveHits: hits,
      osqueryContext: createMockOsqueryContext() as never,
      spaceId: 'default',
      logger: {} as never,
    });

    expect(result.liveRows[0].totalRows).toBe(30);
    expect(result.liveRows[0].queriesWithResults).toBe(2);
    expect(result.liveRows[0].queriesTotal).toBe(2);
    expect(mockGetResultCountsForActions).toHaveBeenCalledWith(
      expect.anything(),
      ['query-1', 'query-2'],
      'default',
      ['default'],
      false
    );
  });

  it('uses integration namespaces and CCS setting for result counts', async () => {
    mockGetResultCountsForActions.mockResolvedValue(
      new Map([
        ['query-1', { totalRows: 5, respondedAgents: 1, successfulAgents: 1, errorAgents: 0 }],
      ])
    );

    await processLiveHistory({
      liveHits: [createLiveHit()],
      osqueryContext: createMockOsqueryContext() as never,
      spaceId: 'production',
      integrationNamespaces: ['prod'],
      ccsEnabled: true,
      logger: {} as never,
    });

    expect(mockGetResultCountsForActions).toHaveBeenCalledWith(
      expect.anything(),
      ['query-1'],
      'production',
      ['prod'],
      true
    );
  });

  it('does not call getResultCountsForActions when no hits', async () => {
    const result = await processLiveHistory({
      liveHits: [],
      osqueryContext: createMockOsqueryContext() as never,
      spaceId: 'default',
      logger: {} as never,
    });

    expect(result.liveRows).toHaveLength(0);
    expect(result.sortValuesMap.size).toBe(0);
    expect(mockGetResultCountsForActions).not.toHaveBeenCalled();
  });
});
