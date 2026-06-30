/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TracedElasticsearchClient } from '@kbn/traced-es-client';
import { getSigEventsLogPatternsEsql } from './get_log_patterns';

const createEsClient = (
  columns: Array<{ name: string; type: string }> = [{ name: 'message', type: 'text' }]
) => {
  const esql = jest.fn();
  const rawEsqlQuery = jest.fn().mockResolvedValueOnce({ columns, values: [] });

  return {
    esClient: {
      esql,
      client: { esql: { query: rawEsqlQuery } },
    } as unknown as TracedElasticsearchClient,
    esql,
    rawEsqlQuery,
  };
};

const countResponse = (total: number) => ({
  columns: [{ name: 'total', type: 'long' }],
  values: [[total]],
});

const categorizeResponse = (
  values: unknown[][] = [
    [10, 'error one', 'error'],
    [5, 'warn two', 'warn'],
  ]
) => ({
  columns: [
    { name: 'count', type: 'long' },
    { name: 'sample', type: 'keyword' },
    { name: 'pattern', type: 'keyword' },
  ],
  values,
});

describe('getSigEventsLogPatternsEsql', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds ES|QL count and single-pass categorize queries', async () => {
    const { esClient, esql, rawEsqlQuery } = createEsClient([{ name: 'body.text', type: 'text' }]);
    esql
      .mockResolvedValueOnce(countResponse(10))
      .mockResolvedValueOnce(categorizeResponse([[10, 'error one', 'error']]));

    const result = await getSigEventsLogPatternsEsql({
      esClient,
      samplingSource: 'logs-*',
      start: 100,
      end: 200,
      fields: ['body.text'],
      kql: 'service.name:"checkout"',
    });

    expect(esql.mock.calls[0]).toEqual([
      'count_docs_for_sigevents_log_patterns',
      expect.objectContaining({
        query: 'FROM logs-* | WHERE KQL("service.name:\\"checkout\\"") | STATS total = COUNT(*)',
      }),
    ]);
    expect(esql.mock.calls[1]).toEqual([
      'categorize_sigevents_log_patterns',
      expect.objectContaining({
        query:
          'FROM logs-* | WHERE KQL("service.name:\\"checkout\\"") | STATS count = COUNT(*), `sample` = TOP(body.text::KEYWORD, 1, "desc") BY pattern = CATEGORIZE(body.text) | SORT count DESC | LIMIT 1000',
      }),
    ]);
    expect(rawEsqlQuery).toHaveBeenCalledTimes(1);
    expect(rawEsqlQuery.mock.calls[0]).toEqual([
      expect.objectContaining({
        query: 'FROM logs-* | LIMIT 0',
      }),
    ]);
    expect(result).toEqual([
      { field: 'body.text', pattern: 'error', count: 10, sample: 'error one' },
    ]);
  });

  it('short-circuits when schema returns no eligible text fields', async () => {
    const { esClient, esql } = createEsClient([{ name: 'host.name', type: 'keyword' }]);

    const result = await getSigEventsLogPatternsEsql({
      esClient,
      samplingSource: 'logs-*',
      start: 100,
      end: 200,
      fields: ['message'],
    });

    expect(esql).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('short-circuits when the count query returns zero', async () => {
    const { esClient, esql } = createEsClient();
    esql.mockResolvedValueOnce(countResponse(0));

    const result = await getSigEventsLogPatternsEsql({
      esClient,
      samplingSource: 'logs-*',
      start: 100,
      end: 200,
      fields: ['message'],
    });

    expect(esql).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it('scales sampled counts back to population counts', async () => {
    const { esClient, esql } = createEsClient();
    esql
      .mockResolvedValueOnce(countResponse(1_000_000))
      .mockResolvedValueOnce(categorizeResponse([[16, 'error one', 'error']]));

    const result = await getSigEventsLogPatternsEsql({
      esClient,
      samplingSource: 'logs-*',
      start: 100,
      end: 200,
      fields: ['message'],
    });

    expect(esql.mock.calls[1][1].query).toContain('| SAMPLE 0.1 |');
    expect(result[0].count).toBe(160);
  });

  it('sorts by count and deduplicates by sample', async () => {
    const { esClient, esql } = createEsClient([
      { name: 'message', type: 'text' },
      { name: 'body.text', type: 'text' },
    ]);
    esql
      .mockResolvedValueOnce(countResponse(10))
      .mockResolvedValueOnce(categorizeResponse([[2, 'same', 'message low']]))
      .mockResolvedValueOnce(categorizeResponse([[8, 'same', 'body high']]));

    const result = await getSigEventsLogPatternsEsql({
      esClient,
      samplingSource: 'logs-*',
      start: 100,
      end: 200,
      fields: ['message', 'body.text'],
    });

    expect(result).toEqual([
      { field: 'body.text', pattern: 'body high', count: 8, sample: 'same' },
    ]);
  });

  it('tolerates a TOP sample value returned as a single-item array', async () => {
    const { esClient, esql } = createEsClient();
    esql
      .mockResolvedValueOnce(countResponse(10))
      .mockResolvedValueOnce(categorizeResponse([[3, ['array sample'], 'error']]));

    const result = await getSigEventsLogPatternsEsql({
      esClient,
      samplingSource: 'logs-*',
      start: 100,
      end: 200,
      fields: ['message'],
    });

    expect(result).toEqual([
      { field: 'message', pattern: 'error', count: 3, sample: 'array sample' },
    ]);
  });
});
