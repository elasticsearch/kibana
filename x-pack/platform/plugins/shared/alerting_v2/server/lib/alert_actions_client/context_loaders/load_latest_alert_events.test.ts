/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { createQueryService } from '../../services/query_service/query_service.mock';
import { ALERTING_ERROR_CODES } from '../../errors/error_codes';
import { getAlertEventESQLResponse, getEmptyESQLResponse } from '../fixtures/query_responses';
import {
  loadLastEpisodeAlertEventOrThrow,
  loadLastSeriesAlertEventOrThrow,
  loadLatestAlertEventsByEpisodeId,
  loadLatestAlertEventsByGroupHash,
} from './load_latest_alert_events';

describe('loadLatestAlertEventsByGroupHash', () => {
  const SPACE_ID = 'default';

  const setup = () => createQueryService();

  it('short-circuits on an empty input without issuing any ES|QL query', async () => {
    const { queryService, mockEsClient } = setup();

    const events = await loadLatestAlertEventsByGroupHash({
      queryService,
      spaceId: SPACE_ID,
      groupHashes: [],
    });

    expect(events).toEqual([]);
    expect(mockEsClient.esql.query).not.toHaveBeenCalled();
  });

  it('issues a single query keyed by a deduplicated group_hash IN clause', async () => {
    const { queryService, mockEsClient } = setup();
    mockEsClient.esql.query.mockResolvedValueOnce(
      getAlertEventESQLResponse([{ group_hash: 'g-1' }, { group_hash: 'g-2' }])
    );

    await loadLatestAlertEventsByGroupHash({
      queryService,
      spaceId: SPACE_ID,
      groupHashes: ['g-1', 'g-2', 'g-1'],
    });

    expect(mockEsClient.esql.query).toHaveBeenCalledTimes(1);
    const { query } = mockEsClient.esql.query.mock.calls[0][0];
    expect(query).toContain('FROM ".rule-events" METADATA _source');
    expect(query).toContain(`space_id == "${SPACE_ID}"`);
    expect(query).toMatch(/group_hash IN \("g-1",\s*"g-2"\)/);
    expect(query).toContain('BY group_hash, space_id');
  });

  it('maps returned rows into the canonical `AlertEventRecord` shape', async () => {
    const { queryService, mockEsClient } = setup();
    mockEsClient.esql.query.mockResolvedValueOnce(
      getAlertEventESQLResponse([{ group_hash: 'g-1', episode_id: 'ep-1', data_json: '{"k":"v"}' }])
    );

    const events = await loadLatestAlertEventsByGroupHash({
      queryService,
      spaceId: SPACE_ID,
      groupHashes: ['g-1'],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      group_hash: 'g-1',
      episode_id: 'ep-1',
      data_json: { k: 'v' },
    });
  });
});

describe('loadLatestAlertEventsByEpisodeId', () => {
  const SPACE_ID = 'default';

  const setup = () => createQueryService();

  it('short-circuits on an empty input without issuing any ES|QL query', async () => {
    const { queryService, mockEsClient } = setup();

    const events = await loadLatestAlertEventsByEpisodeId({
      queryService,
      spaceId: SPACE_ID,
      episodeIds: [],
    });

    expect(events).toEqual([]);
    expect(mockEsClient.esql.query).not.toHaveBeenCalled();
  });

  it('issues a single query keyed by a deduplicated episode.id IN clause, grouped per episode', async () => {
    const { queryService, mockEsClient } = setup();
    mockEsClient.esql.query.mockResolvedValueOnce(
      getAlertEventESQLResponse([{ episode_id: 'ep-1' }, { episode_id: 'ep-2' }])
    );

    await loadLatestAlertEventsByEpisodeId({
      queryService,
      spaceId: SPACE_ID,
      episodeIds: ['ep-1', 'ep-2', 'ep-1'],
    });

    expect(mockEsClient.esql.query).toHaveBeenCalledTimes(1);
    const { query } = mockEsClient.esql.query.mock.calls[0][0];
    expect(query).toContain('FROM ".rule-events" METADATA _source');
    expect(query).toContain(`space_id == "${SPACE_ID}"`);
    expect(query).toMatch(/episode.id IN \("ep-1",\s*"ep-2"\)/);
    expect(query).toContain('BY episode_id, space_id');
    // group_hash is aggregated off the episode's own events, not a BY key.
    expect(query).toContain('group_hash = LAST(group_hash, @timestamp)');
  });

  it('maps returned rows into the canonical `AlertEventRecord` shape', async () => {
    const { queryService, mockEsClient } = setup();
    mockEsClient.esql.query.mockResolvedValueOnce(
      getAlertEventESQLResponse([
        { episode_id: 'ep-1', group_hash: 'resolved-group', data_json: '{"k":"v"}' },
      ])
    );

    const events = await loadLatestAlertEventsByEpisodeId({
      queryService,
      spaceId: SPACE_ID,
      episodeIds: ['ep-1'],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      episode_id: 'ep-1',
      group_hash: 'resolved-group',
      data_json: { k: 'v' },
    });
  });
});

describe('loadLastSeriesAlertEventOrThrow', () => {
  const SPACE_ID = 'default';

  const setup = () => createQueryService();

  it('returns the latest event of the series on a non-empty response', async () => {
    const { queryService, mockEsClient } = setup();
    mockEsClient.esql.query.mockResolvedValueOnce(
      getAlertEventESQLResponse([{ group_hash: 'g-1', episode_id: 'ep-1' }])
    );

    const record = await loadLastSeriesAlertEventOrThrow({
      queryService,
      spaceId: SPACE_ID,
      groupHash: 'g-1',
    });

    expect(record).toMatchObject({ group_hash: 'g-1', episode_id: 'ep-1' });
  });

  it('throws `Boom.notFound` with `ALERT_EVENT_NOT_FOUND` and only the group_hash detail', async () => {
    const { queryService, mockEsClient } = setup();
    mockEsClient.esql.query.mockResolvedValueOnce(getEmptyESQLResponse());

    const promise = loadLastSeriesAlertEventOrThrow({
      queryService,
      spaceId: SPACE_ID,
      groupHash: 'unknown-group',
    });

    await expect(promise).rejects.toThrow(Boom.Boom);
    await expect(promise).rejects.toMatchObject({
      output: { statusCode: 404 },
      data: {
        code: ALERTING_ERROR_CODES.ALERT_EVENT_NOT_FOUND,
        details: { group_hash: 'unknown-group' },
      },
    });
  });
});

describe('loadLastEpisodeAlertEventOrThrow', () => {
  const SPACE_ID = 'default';

  const setup = () => createQueryService();

  it('returns the latest event of the episode on a non-empty response', async () => {
    const { queryService, mockEsClient } = setup();
    mockEsClient.esql.query.mockResolvedValueOnce(
      getAlertEventESQLResponse([{ episode_id: 'ep-1', group_hash: 'resolved-group' }])
    );

    const record = await loadLastEpisodeAlertEventOrThrow({
      queryService,
      spaceId: SPACE_ID,
      episodeId: 'ep-1',
    });

    expect(record).toMatchObject({ episode_id: 'ep-1', group_hash: 'resolved-group' });
  });

  it('throws `Boom.notFound` with `ALERT_EPISODE_NOT_FOUND` and only the episode_id detail', async () => {
    const { queryService, mockEsClient } = setup();
    mockEsClient.esql.query.mockResolvedValueOnce(getEmptyESQLResponse());

    const promise = loadLastEpisodeAlertEventOrThrow({
      queryService,
      spaceId: SPACE_ID,
      episodeId: 'unknown-episode',
    });

    await expect(promise).rejects.toThrow(Boom.Boom);
    await expect(promise).rejects.toMatchObject({
      output: { statusCode: 404 },
      data: {
        code: ALERTING_ERROR_CODES.ALERT_EPISODE_NOT_FOUND,
        details: { episode_id: 'unknown-episode' },
      },
    });
  });
});
