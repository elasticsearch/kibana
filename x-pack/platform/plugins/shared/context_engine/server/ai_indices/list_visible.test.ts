/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { AiIndexHttpItem } from '../../common/http_api/ai_indices';
import { buildAiIndexSpaceFilter } from '../../common/space_filter';
import { resolveAiIndexVisibility } from './list_visible';

const aiIndex = (id: string, target = `ai-index-idx-${id}`): AiIndexHttpItem => ({
  id,
  dest: { type: 'index', value: target },
  managed: false,
  automations: [],
  sources: [],
  date_created: '2026-01-01T00:00:00.000Z',
  date_modified: '2026-01-01T00:00:00.000Z',
});

const shards = { total: 1, successful: 1, skipped: 0, failed: 0 };
const hits = (count: number, extra: Record<string, unknown> = {}) => ({
  timed_out: false,
  _shards: shards,
  hits: { hits: Array.from({ length: count }, () => ({})) },
  ...extra,
});
const failed = (type: string, reason?: string) => ({ status: 403, error: { type, reason } });

describe('resolveAiIndexVisibility', () => {
  const msearch = jest.fn();
  const esClient = { msearch } as unknown as ElasticsearchClient;
  const logger = loggingSystemMock.createLogger();
  const params = { esClient, spaceId: 'team-a', logger };

  beforeEach(() => {
    msearch.mockReset();
    logger.debug.mockReset();
  });

  it('skips Elasticsearch when the registry is empty', async () => {
    expect(await resolveAiIndexVisibility({ ...params, aiIndices: [] })).toEqual([]);
    expect(msearch).not.toHaveBeenCalled();
  });

  it('sends two existence probes per AI Index in one msearch', async () => {
    msearch.mockResolvedValue({ responses: [hits(1), hits(1), hits(0), hits(0)] });

    await resolveAiIndexVisibility({
      ...params,
      aiIndices: [aiIndex('a'), aiIndex('b', 'ai-index-ds-b')],
    });

    const header = (index: string) => ({ index, allow_partial_search_results: false });
    const body = (query: unknown) => ({
      size: 1,
      _source: false,
      terminate_after: 1,
      track_total_hits: false,
      query,
    });
    expect(msearch).toHaveBeenCalledTimes(1);
    expect(msearch).toHaveBeenCalledWith({
      searches: [
        header('ai-index-idx-a'),
        body({ match_all: {} }),
        header('ai-index-idx-a'),
        body(buildAiIndexSpaceFilter('team-a')),
        header('ai-index-ds-b'),
        body({ match_all: {} }),
        header('ai-index-ds-b'),
        body(buildAiIndexSpaceFilter('team-a')),
      ],
    });
  });

  it('classifies each AI Index from its probe pair', async () => {
    msearch.mockResolvedValue({
      responses: [
        hits(1),
        hits(1), // visible
        hits(0),
        hits(0), // empty
        failed('index_not_found_exception', 'no such index [ai-index-idx-missing]'),
        failed('index_not_found_exception', 'no such index [ai-index-idx-missing]'), // empty
        hits(1),
        hits(0), // hidden
        failed('security_exception', 'unauthorized for user'),
        hits(0), // unknown
        hits(1),
        failed('index_closed_exception'), // unknown
        hits(0, { timed_out: true }),
        hits(0), // unknown: an incomplete "no documents" must not count as empty
        hits(1),
        hits(0, { _shards: { ...shards, total: 3, successful: 2, failed: 1 } }), // unknown
      ],
    });

    const result = await resolveAiIndexVisibility({
      ...params,
      aiIndices: [
        'visible',
        'empty',
        'missing',
        'hidden',
        'forbidden',
        'closed',
        'slow',
        'degraded',
      ].map((id) => aiIndex(id)),
    });

    expect(result.map(({ aiIndex: { id }, visibility }) => [id, visibility])).toEqual([
      ['visible', 'visible'],
      ['empty', 'empty'],
      ['missing', 'empty'],
      ['hidden', 'hidden'],
      ['forbidden', 'unknown'],
      ['closed', 'unknown'],
      ['slow', 'unknown'],
      ['degraded', 'unknown'],
    ]);
    expect(logger.debug.mock.calls.map(([message]) => message)).toEqual([
      "AI index 'forbidden' visibility unknown: unauthorized for user",
      "AI index 'closed' visibility unknown: index_closed_exception",
      "AI index 'slow' visibility unknown: timed out",
      "AI index 'degraded' visibility unknown: 1 shard(s) failed",
    ]);
  });

  // `existing,missing` is a 404 as a whole, so it says nothing about `existing`.
  it('does not trust not-found for comma-separated targets or mismatched probe pairs', async () => {
    const notFound = failed('index_not_found_exception', 'no such index [ai-index-idx-missing]');
    msearch.mockResolvedValue({
      responses: [notFound, notFound, notFound, hits(1)],
    });

    const result = await resolveAiIndexVisibility({
      ...params,
      aiIndices: [
        aiIndex('list', 'ai-index-idx-existing,ai-index-idx-missing'),
        aiIndex('mismatched'),
      ],
    });

    expect(result.map(({ visibility }) => visibility)).toEqual(['unknown', 'unknown']);
  });

  it('propagates a failed msearch request', async () => {
    msearch.mockRejectedValue(new Error('unavailable'));

    await expect(
      resolveAiIndexVisibility({ ...params, aiIndices: [aiIndex('a')] })
    ).rejects.toThrow('unavailable');
  });
});
