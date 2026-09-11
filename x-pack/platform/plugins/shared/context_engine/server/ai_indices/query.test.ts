/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core/server';
import {
  DEFAULT_AI_INDEX_QUERY_LIMIT,
  MAX_AI_INDEX_QUERY_LENGTH,
  MAX_AI_INDEX_QUERY_LIMIT,
  MAX_AI_INDEX_QUERY_PARAM_KEY_LENGTH,
  MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH,
  MAX_AI_INDEX_QUERY_PARAMS,
  MAX_AI_INDEX_QUERY_RESPONSE_BYTES,
} from '../../common/constants';
import type { QueryAiIndicesRequest } from '../../common/http_api/ai_indices';
import { buildAiIndexSpaceFilter } from '../../common/space_filter';
import { AiIndexQueryResponseTooLargeError, InvalidAiIndexQueryError } from './errors';
import { queryAiIndices } from './query';

describe('queryAiIndices', () => {
  const esqlQuery = jest.fn();
  const esClient = { esql: { query: esqlQuery } } as unknown as ElasticsearchClient;
  const columns = [{ name: 'title', type: 'keyword' }];
  const values = [['Refund policy']];

  beforeEach(() => {
    esqlQuery.mockReset();
    esqlQuery.mockResolvedValue({ columns, values });
  });

  const lastRequest = () => esqlQuery.mock.calls[0][0];

  it('injects the space filter, response cap, and default limit', async () => {
    const result = await queryAiIndices({
      esClient,
      spaceId: 'marketing',
      query: 'FROM ai-index-idx-a',
    });

    expect(result).toEqual({ columns, values });
    expect(esqlQuery).toHaveBeenCalledWith(
      {
        query: `FROM ai-index-idx-a | LIMIT ${DEFAULT_AI_INDEX_QUERY_LIMIT}`,
        filter: buildAiIndexSpaceFilter('marketing'),
        drop_null_columns: true,
        allow_partial_results: true,
      },
      { maxResponseSize: MAX_AI_INDEX_QUERY_RESPONSE_BYTES }
    );
  });

  it('narrows a trailing LIMIT above the caller limit', async () => {
    await queryAiIndices({
      esClient,
      spaceId: 'default',
      query: 'FROM ai-index-idx-a | LIMIT 5000',
      limit: 50,
    });

    expect(lastRequest().query).toBe('FROM ai-index-idx-a | LIMIT 50');
  });

  it('appends after a parameterised trailing LIMIT', async () => {
    await queryAiIndices({
      esClient,
      spaceId: 'default',
      query: 'FROM ai-index-idx-a | LIMIT ?max',
      params: { max: 5000 },
    });

    expect(lastRequest().query).toBe(
      `FROM ai-index-idx-a | LIMIT ?max | LIMIT ${DEFAULT_AI_INDEX_QUERY_LIMIT}`
    );
  });

  it('accepts the server maximum limit', async () => {
    await queryAiIndices({
      esClient,
      spaceId: 'default',
      query: 'FROM ai-index-idx-a',
      limit: MAX_AI_INDEX_QUERY_LIMIT,
    });

    expect(lastRequest().query).toBe(`FROM ai-index-idx-a | LIMIT ${MAX_AI_INDEX_QUERY_LIMIT}`);
  });

  it('still caps a query the parser rejects', async () => {
    await queryAiIndices({
      esClient,
      spaceId: 'default',
      query: 'FROM ai-index-idx-a | NOT_A_COMMAND',
      limit: 5,
    });

    expect(lastRequest().query).toBe('FROM ai-index-idx-a | NOT_A_COMMAND\n| LIMIT 5');
  });

  describe('input bounds', () => {
    const run = (input: Partial<QueryAiIndicesRequest>) =>
      queryAiIndices({ esClient, spaceId: 'default', query: 'FROM ai-index-idx-a', ...input });

    it.each([
      ['fractional', 1.5],
      ['zero', 0],
      ['negative', -1],
      ['above max', MAX_AI_INDEX_QUERY_LIMIT + 1],
      ['NaN', Number.NaN],
      ['infinite', Number.POSITIVE_INFINITY],
    ])('rejects a %s limit', async (_label, limit) => {
      await expect(run({ limit })).rejects.toBeInstanceOf(InvalidAiIndexQueryError);
      expect(esqlQuery).not.toHaveBeenCalled();
    });

    it('rejects an empty or oversized query', async () => {
      await expect(run({ query: '' })).rejects.toBeInstanceOf(InvalidAiIndexQueryError);
      await expect(
        run({ query: 'a'.repeat(MAX_AI_INDEX_QUERY_LENGTH + 1) })
      ).rejects.toBeInstanceOf(InvalidAiIndexQueryError);
      expect(esqlQuery).not.toHaveBeenCalled();
    });

    it('rejects oversized param records', async () => {
      const tooMany = Object.fromEntries(
        Array.from({ length: MAX_AI_INDEX_QUERY_PARAMS + 1 }, (_, i) => [`p${i}`, i])
      );
      await expect(run({ params: tooMany })).rejects.toBeInstanceOf(InvalidAiIndexQueryError);
      await expect(
        run({ params: { ['k'.repeat(MAX_AI_INDEX_QUERY_PARAM_KEY_LENGTH + 1)]: 1 } })
      ).rejects.toBeInstanceOf(InvalidAiIndexQueryError);
      await expect(
        run({ params: { v: 'x'.repeat(MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH + 1) } })
      ).rejects.toBeInstanceOf(InvalidAiIndexQueryError);
      await expect(run({ params: { v: Number.NaN } })).rejects.toBeInstanceOf(
        InvalidAiIndexQueryError
      );
      expect(esqlQuery).not.toHaveBeenCalled();
    });
  });

  it('passes named params as single-entry objects', async () => {
    await queryAiIndices({
      esClient,
      spaceId: 'default',
      query: 'FROM ai-index-idx-a | WHERE type == ?type AND score > ?min',
      params: { type: 'faq', min: 0.5 },
    });

    expect(lastRequest().params).toEqual([{ type: 'faq' }, { min: 0.5 }]);
  });

  it('omits params when none are given', async () => {
    await queryAiIndices({ esClient, spaceId: 'default', query: 'FROM ai-index-idx-a' });

    expect(lastRequest()).not.toHaveProperty('params');
  });

  it('passes multi-target and wildcard FROM through untouched', async () => {
    await queryAiIndices({
      esClient,
      spaceId: 'default',
      query: 'FROM ai-index-idx-a,ai-index-ds-b,ai-index-* | LIMIT 10',
    });

    expect(lastRequest().query).toBe('FROM ai-index-idx-a, ai-index-ds-b, ai-index-* | LIMIT 10');
  });

  it('maps a response-size abort to AiIndexQueryResponseTooLargeError', async () => {
    esqlQuery.mockRejectedValue(
      new errors.RequestAbortedError(
        'The content length (30000000) is bigger than the maximum allowed buffer (20971520)'
      )
    );

    await expect(
      queryAiIndices({ esClient, spaceId: 'default', query: 'FROM ai-index-idx-a' })
    ).rejects.toBeInstanceOf(AiIndexQueryResponseTooLargeError);
  });

  it('rethrows other errors', async () => {
    esqlQuery.mockRejectedValue(new Error('boom'));

    await expect(
      queryAiIndices({ esClient, spaceId: 'default', query: 'FROM ai-index-idx-a' })
    ).rejects.toThrow('boom');
  });
});
