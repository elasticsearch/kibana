/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import objectHash from 'object-hash';
import type { ElasticsearchClient } from '@kbn/core/server';
import { getSampleDocumentsEsql } from './get_sample_documents';

const createEsClient = () => {
  const query = jest.fn();
  return {
    esClient: { esql: { query } } as unknown as ElasticsearchClient,
    query,
  };
};

const createResponse = ({
  columns = [
    { name: '_id', type: 'keyword' },
    { name: '_source', type: 'object' },
  ],
  values = [
    ['doc-1', { message: 'first' }],
    ['doc-2', { message: 'second' }],
  ],
}: {
  columns?: Array<{ name: string; type: string }>;
  values?: unknown[][];
} = {}) => ({ columns, values });

describe('getSampleDocumentsEsql', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('builds a simple ES|QL sample query with a time range filter', async () => {
    const { esClient, query } = createEsClient();
    query.mockResolvedValueOnce(createResponse());

    const result = await getSampleDocumentsEsql({
      esClient,
      index: ['logs-a', 'logs-b'],
      start: 100,
      end: 200,
      size: 2,
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({
      query: 'FROM logs-a, logs-b METADATA _id, _source | LIMIT 2',
      filter: {
        bool: {
          filter: [
            {
              range: {
                '@timestamp': {
                  gte: 100,
                  lte: 200,
                  format: 'epoch_millis',
                },
              },
            },
          ],
        },
      },
      drop_null_columns: true,
    });
    expect(result).toEqual({
      hits: [
        { _index: '', _id: 'doc-1', _source: { message: 'first' } },
        { _index: '', _id: 'doc-2', _source: { message: 'second' } },
      ],
      total: 2,
    });
  });

  it('parses _id and _source by column name instead of column position', async () => {
    const { esClient, query } = createEsClient();
    query.mockResolvedValueOnce(
      createResponse({
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: '_source', type: 'object' },
          { name: '_id', type: 'keyword' },
        ],
        values: [
          ['2026-04-28T08:00:00.000Z', { message: 'first' }, 'doc-1'],
          ['2026-04-28T08:01:00.000Z', { message: 'second' }, 'doc-2'],
        ],
      })
    );

    const result = await getSampleDocumentsEsql({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      size: 2,
    });

    expect(result).toEqual({
      hits: [
        { _index: '', _id: 'doc-1', _source: { message: 'first' } },
        { _index: '', _id: 'doc-2', _source: { message: 'second' } },
      ],
      total: 2,
    });
  });

  it('reconstructs documents from row columns when a view drops _id and _source metadata', async () => {
    const { esClient, query } = createEsClient();
    // ES|QL views silently drop outer `METADATA _id, _source`, so the response
    // only contains the view's projected columns.
    query.mockResolvedValueOnce(
      createResponse({
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: 'message', type: 'text' },
          { name: 'service.name', type: 'keyword' },
        ],
        values: [
          ['2026-04-28T08:00:00.000Z', 'first', 'checkout'],
          ['2026-04-28T08:01:00.000Z', 'second', null],
        ],
      })
    );

    const result = await getSampleDocumentsEsql({
      esClient,
      index: '$.query',
      start: 100,
      end: 200,
      size: 2,
    });

    // Views expose no `_id`, so a stable content hash of the reconstructed
    // source is synthesized (enables cross-bucket sample dedup for query streams).
    const firstSource = {
      '@timestamp': '2026-04-28T08:00:00.000Z',
      message: 'first',
      'service.name': 'checkout',
    };
    const secondSource = { '@timestamp': '2026-04-28T08:01:00.000Z', message: 'second' };
    expect(result).toEqual({
      hits: [
        { _index: '', _id: objectHash(firstSource), _source: firstSource },
        { _index: '', _id: objectHash(secondSource), _source: secondSource },
      ],
      total: 2,
    });
  });

  it('combines KQL and ES|QL where conditions and enables unmapped field loading', async () => {
    const { esClient, query } = createEsClient();
    query.mockResolvedValueOnce(createResponse({ values: [] }));

    await getSampleDocumentsEsql({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      kql: 'log.level:"error"',
      whereCondition: esql.exp`NOT ${esql.col(['service', 'name'])} == ${esql.str('checkout')}`,
      unmappedFields: 'LOAD',
      size: 5,
    });

    expect(query.mock.calls[0][0].query).toBe(
      'SET unmapped_fields = "LOAD"; FROM logs-* METADATA _id, _source | WHERE KQL("log.level:\\"error\\"") AND NOT service.name == "checkout" | LIMIT 5'
    );
  });

  it('uses count, SAMPLE, oversample limit, and client-side trim for random sampling', async () => {
    const { esClient, query } = createEsClient();
    query
      .mockResolvedValueOnce({ columns: [{ name: 'total', type: 'long' }], values: [[100]] })
      .mockResolvedValueOnce(
        createResponse({
          values: [
            ['doc-1', { message: 'first' }],
            ['doc-2', { message: 'second' }],
            ['doc-3', { message: 'third' }],
          ],
        })
      );
    jest.spyOn(Math, 'random').mockReturnValue(0);

    const result = await getSampleDocumentsEsql({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      sampleSize: 2,
    });

    expect(query.mock.calls[0][0].query).toBe('FROM logs-* | STATS total = COUNT(*)');
    expect(query.mock.calls[1][0].query).toBe(
      'FROM logs-* METADATA _id, _source | SAMPLE 0.06 | LIMIT 20'
    );
    expect(query.mock.calls[0][0].filter).toEqual(query.mock.calls[1][0].filter);
    expect(result.hits).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it('uses the same KQL, where condition, LOAD, and time filter for random count and sample queries', async () => {
    const { esClient, query } = createEsClient();
    query
      .mockResolvedValueOnce({ columns: [{ name: 'total', type: 'long' }], values: [[10]] })
      .mockResolvedValueOnce(createResponse());

    await getSampleDocumentsEsql({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      kql: 'log.level:"error"',
      whereCondition: esql.exp`${esql.col(['service', 'name'])} == ${esql.str('checkout')}`,
      unmappedFields: 'LOAD',
      sampleSize: 2,
    });

    expect(query.mock.calls[0][0].query).toBe(
      'SET unmapped_fields = "LOAD"; FROM logs-* | WHERE KQL("log.level:\\"error\\"") AND service.name == "checkout" | STATS total = COUNT(*)'
    );
    expect(query.mock.calls[1][0].query).toBe(
      'SET unmapped_fields = "LOAD"; FROM logs-* METADATA _id, _source | WHERE KQL("log.level:\\"error\\"") AND service.name == "checkout" | SAMPLE 0.6 | LIMIT 20'
    );
    expect(query.mock.calls[0][0].filter).toEqual(query.mock.calls[1][0].filter);
  });

  it('emits SET unmapped_fields = "NULLIFY" when unmappedFields is NULLIFY', async () => {
    const { esClient, query } = createEsClient();
    query.mockResolvedValueOnce(createResponse({ values: [] }));

    await getSampleDocumentsEsql({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      whereCondition: esql.exp`MATCH_PHRASE(${esql.col('message')}, ${esql.str('error')})`,
      unmappedFields: 'NULLIFY',
      size: 5,
    });

    expect(query.mock.calls[0][0].query).toBe(
      'SET unmapped_fields = "NULLIFY"; FROM logs-* METADATA _id, _source | WHERE MATCH_PHRASE(message, "error") | LIMIT 5'
    );
  });

  it('omits SAMPLE when the calculated probability reaches one', async () => {
    const { esClient, query } = createEsClient();
    query
      .mockResolvedValueOnce({ columns: [{ name: 'total', type: 'long' }], values: [[3]] })
      .mockResolvedValueOnce(createResponse());

    await getSampleDocumentsEsql({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      sampleSize: 2,
    });

    expect(query.mock.calls[1][0].query).toBe('FROM logs-* METADATA _id, _source | LIMIT 20');
  });

  it('short-circuits random sampling when the count query returns zero', async () => {
    const { esClient, query } = createEsClient();
    query.mockResolvedValueOnce({ columns: [{ name: 'total', type: 'long' }], values: [[0]] });

    const result = await getSampleDocumentsEsql({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      sampleSize: 2,
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ hits: [], total: 0 });
  });

  it('short-circuits random sampling when the requested sample size is zero', async () => {
    const { esClient, query } = createEsClient();

    const result = await getSampleDocumentsEsql({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      sampleSize: 0,
    });

    expect(query).not.toHaveBeenCalled();
    expect(result).toEqual({ hits: [], total: 0 });
  });

  it('returns an empty result when a view row has no non-null projected columns', async () => {
    const { esClient, query } = createEsClient();
    query.mockResolvedValueOnce(
      createResponse({ columns: [{ name: 'message', type: 'keyword' }], values: [[null]] })
    );

    const result = await getSampleDocumentsEsql({
      esClient,
      index: '$.query',
      start: 100,
      end: 200,
    });

    expect(result).toEqual({ hits: [], total: 0 });
  });
});
