/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core/server';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import {
  MAX_AI_INDEX_DESCRIBE_TAG_COUNTS,
  MAX_AI_INDEX_DESCRIBE_TYPE_COUNTS,
} from '../../common/constants';
import { buildAiIndexSpaceFilter } from '../../common/space_filter';
import { describeAiIndexAggregations } from './describe_aggregations';
import type { AiIndexField } from './types';

const field = (path: string, aggregatable: boolean, type = 'keyword'): AiIndexField => ({
  path,
  type,
  searchable: true,
  aggregatable,
});

const esResponseError = (statusCode: number, type: string) =>
  new errors.ResponseError(
    elasticsearchClientMock.createApiResponse({ statusCode, body: { error: { type } } })
  );

describe('describeAiIndexAggregations', () => {
  const search = jest.fn();
  const esClient = { search } as unknown as ElasticsearchClient;
  const params = { esClient, target: 'ai-index-idx-*', spaceId: 'team-a' };

  beforeEach(() => {
    search.mockReset();
    search.mockResolvedValue({ aggregations: {} });
  });

  it('skips the search when neither type nor tags is aggregatable', async () => {
    const result = await describeAiIndexAggregations({
      ...params,
      fields: [field('type', false), field('title', true)],
    });

    expect(search).not.toHaveBeenCalled();
    expect(result).toEqual({ kiTypeCounts: [], tagCounts: [] });
  });

  it('skips fields whose type conflicts across indices or is not a keyword', async () => {
    const result = await describeAiIndexAggregations({
      ...params,
      fields: [field('type', true, 'conflict'), field('tags', true, 'long')],
    });

    expect(search).not.toHaveBeenCalled();
    expect(result).toEqual({ kiTypeCounts: [], tagCounts: [] });
  });

  it('accepts every keyword-family type', async () => {
    await describeAiIndexAggregations({
      ...params,
      fields: [field('type', true, 'constant_keyword'), field('tags', true, 'wildcard')],
    });

    const { aggs } = search.mock.calls[0][0];
    expect(Object.keys(aggs)).toEqual(['types', 'tags']);
  });

  it('runs one space-filtered, hit-free, non-partial search with a terms agg per field', async () => {
    await describeAiIndexAggregations({
      ...params,
      fields: [field('type', true), field('tags', true)],
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith({
      index: 'ai-index-idx-*',
      ignore_unavailable: true,
      allow_no_indices: true,
      allow_partial_search_results: false,
      size: 0,
      track_total_hits: false,
      query: buildAiIndexSpaceFilter('team-a'),
      aggs: {
        types: {
          terms: {
            field: 'type',
            size: MAX_AI_INDEX_DESCRIBE_TYPE_COUNTS,
            order: [{ _count: 'desc' }, { _key: 'asc' }],
          },
        },
        tags: {
          terms: {
            field: 'tags',
            size: MAX_AI_INDEX_DESCRIBE_TAG_COUNTS,
            order: [{ _count: 'desc' }, { _key: 'asc' }],
          },
        },
      },
    });
  });

  it('only aggregates the fields that are aggregatable', async () => {
    await describeAiIndexAggregations({
      ...params,
      fields: [field('type', false), field('tags', true)],
    });

    const { aggs } = search.mock.calls[0][0];
    expect(Object.keys(aggs)).toEqual(['tags']);
  });

  it('maps buckets to counts', async () => {
    search.mockResolvedValue({
      aggregations: {
        types: {
          buckets: [
            { key: 'document', doc_count: 7 },
            { key: 'detection', doc_count: 2 },
          ],
        },
        tags: { buckets: [{ key: 'billing', doc_count: 3 }] },
      },
    });

    const result = await describeAiIndexAggregations({
      ...params,
      fields: [field('type', true), field('tags', true)],
    });

    expect(result).toEqual({
      kiTypeCounts: [
        { type: 'document', count: 7 },
        { type: 'detection', count: 2 },
      ],
      tagCounts: [{ tag: 'billing', count: 3 }],
    });
  });

  it('returns empty counts when Elasticsearch omits aggregations', async () => {
    search.mockResolvedValue({});

    const result = await describeAiIndexAggregations({
      ...params,
      fields: [field('type', true)],
    });

    expect(result).toEqual({ kiTypeCounts: [], tagCounts: [] });
  });

  it('returns empty counts when the caller lacks read on the backing indices', async () => {
    search.mockRejectedValue(esResponseError(403, 'security_exception'));

    const result = await describeAiIndexAggregations({
      ...params,
      fields: [field('type', true)],
    });

    expect(result).toEqual({ kiTypeCounts: [], tagCounts: [] });
  });

  it('rethrows other Elasticsearch errors', async () => {
    search.mockRejectedValue(esResponseError(500, 'search_phase_execution_exception'));

    await expect(
      describeAiIndexAggregations({ ...params, fields: [field('type', true)] })
    ).rejects.toThrow('search_phase_execution_exception');
  });
});
