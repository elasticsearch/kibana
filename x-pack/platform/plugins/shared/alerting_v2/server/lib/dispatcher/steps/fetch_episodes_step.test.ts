/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FetchEpisodesStep, parseAlertEpisodes } from './fetch_episodes_step';
import { createQueryService } from '../../services/query_service/query_service.mock';
import { createDispatchableAlertEventsResponse } from '../fixtures/dispatcher';
import {
  createAlertEpisode,
  createDispatcherPipelineState,
  createStepLogger,
} from '../fixtures/test_utils';
import { EPISODE_QUERY_LIMIT } from '../queries';
import type { AlertEventSeverity } from '@kbn/alerting-v2-schemas';

const logger = createStepLogger();

describe('FetchEpisodesStep', () => {
  it('returns episodes and continues when episodes are found', async () => {
    const { queryService, mockEsClient } = createQueryService();
    const step = new FetchEpisodesStep(queryService);

    const episodes = [
      createAlertEpisode({ rule_id: 'r1', group_hash: 'h1', episode_id: 'e1' }),
      createAlertEpisode({ rule_id: 'r2', group_hash: 'h2', episode_id: 'e2' }),
    ];

    mockEsClient.esql.query.mockResolvedValueOnce(createDispatchableAlertEventsResponse(episodes));

    const state = createDispatcherPipelineState();
    const result = await step.execute(state, logger);

    expect(result.type).toBe('continue');
    if (result.type !== 'continue') return;
    expect(result.data?.scan?.episodes).toHaveLength(2);
    expect(result.data?.scan?.episodes[0].rule_id).toBe('r1');
  });

  it('halts with no_episodes when none are found', async () => {
    const { queryService, mockEsClient } = createQueryService();
    const step = new FetchEpisodesStep(queryService);

    mockEsClient.esql.query.mockResolvedValueOnce(createDispatchableAlertEventsResponse([]));

    const state = createDispatcherPipelineState();
    const result = await step.execute(state, logger);

    expect(result).toEqual({ type: 'halt', reason: 'no_episodes' });
  });

  it('does not cap the Lucene filter at windowEnd so actions stamped after the settle buffer still join last_fired', async () => {
    const { queryService, mockEsClient } = createQueryService();
    const step = new FetchEpisodesStep(queryService);

    mockEsClient.esql.query.mockResolvedValueOnce(
      createDispatchableAlertEventsResponse([createAlertEpisode()])
    );

    const state = createDispatcherPipelineState();
    const { windowStart, windowEnd } = state.input;
    await step.execute(state, logger);

    const request = mockEsClient.esql.query.mock.calls[0][0];
    expect(request.filter).toEqual({
      range: {
        '@timestamp': {
          gte: windowStart.toISOString(),
        },
      },
    });
    expect(request.query).toContain(
      `type IS NULL OR @timestamp >= "${windowStart.toISOString()}"::DATETIME AND @timestamp <= "${windowEnd.toISOString()}"::DATETIME`
    );
  });

  it('sets truncated: true when the query returns exactly EPISODE_QUERY_LIMIT rows', async () => {
    const { queryService, mockEsClient } = createQueryService();
    const step = new FetchEpisodesStep(queryService);

    const maxEpisodes = Array.from({ length: EPISODE_QUERY_LIMIT }, (_, i) =>
      createAlertEpisode({ episode_id: `ep-${i}`, group_hash: `h-${i}` })
    );
    mockEsClient.esql.query.mockResolvedValueOnce(
      createDispatchableAlertEventsResponse(maxEpisodes)
    );

    const state = createDispatcherPipelineState();
    const result = await step.execute(state, logger);

    expect(result.type).toBe('continue');
    if (result.type !== 'continue') return;
    expect(result.data?.scan?.truncated).toBe(true);
  });

  it('sets truncated: false when the query returns fewer than EPISODE_QUERY_LIMIT rows', async () => {
    const { queryService, mockEsClient } = createQueryService();
    const step = new FetchEpisodesStep(queryService);

    const episodes = Array.from({ length: EPISODE_QUERY_LIMIT - 1 }, (_, i) =>
      createAlertEpisode({ episode_id: `ep-${i}`, group_hash: `h-${i}` })
    );
    mockEsClient.esql.query.mockResolvedValueOnce(createDispatchableAlertEventsResponse(episodes));

    const state = createDispatcherPipelineState();
    const result = await step.execute(state, logger);

    expect(result.type).toBe('continue');
    if (result.type !== 'continue') return;
    expect(result.data?.scan?.truncated).toBe(false);
  });

  it('propagates query errors', async () => {
    const { queryService, mockEsClient } = createQueryService();
    const step = new FetchEpisodesStep(queryService);

    mockEsClient.esql.query.mockRejectedValueOnce(new Error('ES error'));

    const state = createDispatcherPipelineState();
    await expect(step.execute(state, logger)).rejects.toThrow('ES error');
  });
});

describe('parseAlertEpisodes', () => {
  it('passes through all core fields', () => {
    const raw = [
      {
        last_event_timestamp: '2026-01-22T07:10:00.000Z',
        rule_id: 'r1',
        source: 'internal',
        space_id: 'default',
        group_hash: 'h1',
        episode_id: 'e1',
        episode_status: 'active' as const,
        severity: null,
      },
    ];

    const result = parseAlertEpisodes(raw);

    expect(result).toHaveLength(1);
    expect(result[0].rule_id).toBe('r1');
    expect(result[0].group_hash).toBe('h1');
    expect(result[0].episode_id).toBe('e1');
    expect(result[0].episode_status).toBe('active');
    expect(result[0]).not.toHaveProperty('data_json');
  });

  it('includes severity when severity is not null', () => {
    const raw = [
      {
        last_event_timestamp: '2026-01-22T07:10:00.000Z',
        rule_id: 'r1',
        source: 'internal',
        space_id: 'default',
        group_hash: 'h1',
        episode_id: 'e1',
        episode_status: 'active' as const,
        severity: 'medium' as AlertEventSeverity,
      },
    ];

    const result = parseAlertEpisodes(raw);

    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('medium');
  });

  it('omits severity when severity is null', () => {
    const raw = [
      {
        last_event_timestamp: '2026-01-22T07:10:00.000Z',
        rule_id: 'r1',
        source: 'internal',
        space_id: 'default',
        group_hash: 'h1',
        episode_id: 'e1',
        episode_status: 'active' as const,
        severity: null,
      },
    ];

    const result = parseAlertEpisodes(raw);

    expect(result).toHaveLength(1);
    expect(result[0].severity).toBeUndefined();
  });

  it('passes source, space_id, and null rule_id through for external episodes', () => {
    const raw = [
      {
        last_event_timestamp: '2026-01-22T07:10:00.000Z',
        rule_id: null,
        source: 'pagerduty',
        space_id: 'space-a',
        group_hash: 'h1',
        episode_id: 'e1',
        episode_status: 'active' as const,
        severity: null,
      },
    ];

    const result = parseAlertEpisodes(raw);

    expect(result).toHaveLength(1);
    expect(result[0].rule_id).toBeNull();
    expect(result[0].source).toBe('pagerduty');
    expect(result[0].space_id).toBe('space-a');
  });
});
