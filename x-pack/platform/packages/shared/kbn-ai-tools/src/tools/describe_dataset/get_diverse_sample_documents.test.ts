/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import objectHash from 'object-hash';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { getSampleDocumentsEsql } from './get_sample_documents';
import { getDiverseSampleDocuments } from './get_diverse_sample_documents';

jest.mock('./get_sample_documents', () => ({
  getSampleDocumentsEsql: jest.fn(),
}));

const getSampleDocumentsEsqlMock = jest.mocked(getSampleDocumentsEsql);

const createEsClient = () => {
  const query = jest.fn();

  return {
    esClient: { esql: { query } } as unknown as ElasticsearchClient,
    query,
  };
};

const logger = {
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

const countResponse = (total: number) => ({
  columns: [{ name: 'total', type: 'long' }],
  values: [[total]],
});

const schemaResponse = (
  columns: Array<{ name: string; type: string }> = [{ name: 'message', type: 'text' }]
) => ({
  columns,
  values: [],
});

// Single-pass categorize result: count, representative sample value, pattern.
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

// Concrete index source fetch (METADATA _id, _source survives).
const concreteFetchResponse = (
  values: unknown[][] = [
    ['doc-1', { message: 'error one' }],
    ['doc-2', { message: 'warn two' }],
  ]
) => ({
  columns: [
    { name: '_id', type: 'keyword' },
    { name: '_source', type: '_source' },
  ],
  values,
});

// ES|QL view source fetch: _id/_source dropped, only projected columns remain.
const viewFetchResponse = (
  values: unknown[][] = [
    ['2026-06-18T00:00:00Z', 'error one'],
    ['2026-06-18T00:01:00Z', 'warn two'],
  ]
) => ({
  columns: [
    { name: '@timestamp', type: 'date' },
    { name: 'message', type: 'text' },
  ],
  values,
});

// Concrete index where the categorized field is an ES|QL alias/runtime field
// (here `message` aliases `body.text`): the field is a queryable column but is
// absent from `_source` (OTel logs). The join must use the column, not _source.
const aliasFetchResponse = (
  values: unknown[][] = [
    ['error one', 'doc-1', { 'body.text': 'error one' }],
    ['warn two', 'doc-2', { 'body.text': 'warn two' }],
  ]
) => ({
  columns: [
    { name: 'message', type: 'text' },
    { name: '_id', type: 'keyword' },
    { name: '_source', type: '_source' },
  ],
  values,
});

describe('getDiverseSampleDocuments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('categorizes and fetches sources without _index/_id metadata (concrete indices)', async () => {
    const { esClient, query } = createEsClient();
    query
      .mockResolvedValueOnce(schemaResponse())
      .mockResolvedValueOnce(countResponse(10))
      .mockResolvedValueOnce(categorizeResponse())
      .mockResolvedValueOnce(concreteFetchResponse());

    const result = await getDiverseSampleDocuments({
      esClient,
      index: ['logs-a', 'logs-b'],
      start: 100,
      end: 200,
      size: 2,
      offset: 0,
      logger,
    });

    const categorizeQuery = query.mock.calls[2][0].query;
    expect(categorizeQuery).not.toContain('METADATA');
    expect(categorizeQuery).toContain(
      'STATS count = COUNT(*), `sample` = TOP(message::KEYWORD, 1, "desc") BY pattern = CATEGORIZE(message)'
    );
    expect(categorizeQuery).toContain('SORT count DESC');
    expect(categorizeQuery).toContain('LIMIT 2');

    const fetchQuery = query.mock.calls[3][0].query;
    expect(fetchQuery).toContain('FROM logs-a, logs-b METADATA _id, _source');
    expect(fetchQuery).toContain('WHERE message::KEYWORD IN ("error one", "warn two")');
    expect(fetchQuery).toContain('LIMIT 20');

    expect(result.hits).toEqual([
      { _index: '', _id: 'doc-1', _source: { message: 'error one' } },
      { _index: '', _id: 'doc-2', _source: { message: 'warn two' } },
    ]);
  });

  it('reconstructs sources for ES|QL views that drop _id/_source metadata', async () => {
    const { esClient, query } = createEsClient();
    query
      .mockResolvedValueOnce(schemaResponse())
      .mockResolvedValueOnce(countResponse(10))
      .mockResolvedValueOnce(categorizeResponse())
      .mockResolvedValueOnce(viewFetchResponse());

    const result = await getDiverseSampleDocuments({
      esClient,
      index: '$.query',
      start: 100,
      end: 200,
      size: 2,
      offset: 0,
      logger,
    });

    // Views expose no `_id`, so a stable content hash is synthesized so the doc
    // can be deduped across the diverse/random buckets in mergeDocuments.
    const firstSource = { '@timestamp': '2026-06-18T00:00:00Z', message: 'error one' };
    const secondSource = { '@timestamp': '2026-06-18T00:01:00Z', message: 'warn two' };
    expect(result.hits).toEqual([
      { _index: '', _id: objectHash(firstSource), _source: firstSource },
      { _index: '', _id: objectHash(secondSource), _source: secondSource },
    ]);
  });

  it('joins on the field column when it is an alias absent from _source (OTel logs)', async () => {
    const { esClient, query } = createEsClient();
    query
      .mockResolvedValueOnce(schemaResponse())
      .mockResolvedValueOnce(countResponse(10))
      .mockResolvedValueOnce(categorizeResponse())
      .mockResolvedValueOnce(aliasFetchResponse());

    const result = await getDiverseSampleDocuments({
      esClient,
      index: 'logs.otel.android',
      start: 100,
      end: 200,
      size: 2,
      offset: 0,
      logger,
    });

    // `_source` has no `message` (it lives under `body.text`); reading the join
    // value from the `message` column still resolves both representatives.
    expect(result.hits).toEqual([
      { _index: '', _id: 'doc-1', _source: { 'body.text': 'error one' } },
      { _index: '', _id: 'doc-2', _source: { 'body.text': 'warn two' } },
    ]);
  });

  it('adds SAMPLE when the population is large', async () => {
    const { esClient, query } = createEsClient();
    query
      .mockResolvedValueOnce(schemaResponse())
      .mockResolvedValueOnce(countResponse(10_000_000))
      .mockResolvedValueOnce(categorizeResponse([[10, 'error one', 'error']]))
      .mockResolvedValueOnce(concreteFetchResponse([['doc-1', { message: 'error one' }]]));

    await getDiverseSampleDocuments({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      size: 1,
      offset: 0,
      logger,
    });

    expect(query.mock.calls[2][0].query).toContain('| SAMPLE 0.01 |');
  });

  it('short-circuits when the count query returns zero', async () => {
    const { esClient, query } = createEsClient();
    query.mockResolvedValueOnce(schemaResponse()).mockResolvedValueOnce(countResponse(0));

    const result = await getDiverseSampleDocuments({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      size: 1,
      offset: 0,
      logger,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ hits: [] });
  });

  it('falls back to random ES|QL sampling when no message field exists', async () => {
    const { esClient, query } = createEsClient();
    query
      .mockResolvedValueOnce(schemaResponse([{ name: 'host.name', type: 'keyword' }]))
      .mockResolvedValueOnce(countResponse(10));
    getSampleDocumentsEsqlMock.mockResolvedValueOnce({
      hits: [{ _index: 'logs-a', _id: 'doc-1', _source: { event: 'one' } }],
      total: 1,
    });

    const result = await getDiverseSampleDocuments({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      size: 1,
      offset: 0,
      logger,
    });

    expect(getSampleDocumentsEsqlMock).toHaveBeenCalledWith({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      sampleSize: 1,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(result.hits).toEqual([{ _index: 'logs-a', _id: 'doc-1', _source: { event: 'one' } }]);
  });

  it('uses body.text when it is the first available text field candidate', async () => {
    const { esClient, query } = createEsClient();
    query
      .mockResolvedValueOnce(
        schemaResponse([
          { name: 'message', type: 'keyword' },
          { name: 'body.text', type: 'text' },
        ])
      )
      .mockResolvedValueOnce(countResponse(10))
      .mockResolvedValueOnce(categorizeResponse([[10, 'body value', 'body pattern']]))
      .mockResolvedValueOnce(concreteFetchResponse([['doc-1', { body: { text: 'body value' } }]]));

    const result = await getDiverseSampleDocuments({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      size: 1,
      offset: 0,
      logger,
    });

    expect(query.mock.calls[2][0].query).toContain('CATEGORIZE(body.text)');
    expect(query.mock.calls[3][0].query).toContain('WHERE body.text::KEYWORD IN ("body value")');
    expect(result.hits).toEqual([
      { _index: '', _id: 'doc-1', _source: { body: { text: 'body value' } } },
    ]);
  });

  it('applies the offset window before fetching sources', async () => {
    const { esClient, query } = createEsClient();
    query
      .mockResolvedValueOnce(schemaResponse())
      .mockResolvedValueOnce(countResponse(10))
      .mockResolvedValueOnce(
        categorizeResponse([
          [10, 'error one', 'error'],
          [5, 'warn two', 'warn'],
        ])
      )
      .mockResolvedValueOnce(concreteFetchResponse([['doc-2', { message: 'warn two' }]]));

    const result = await getDiverseSampleDocuments({
      esClient,
      index: 'logs-*',
      start: 100,
      end: 200,
      size: 1,
      offset: 1,
      logger,
    });

    expect(query.mock.calls[2][0].query).toContain('LIMIT 2');
    expect(query.mock.calls[3][0].query).toContain('WHERE message::KEYWORD IN ("warn two")');
    expect(result.hits).toEqual([{ _index: '', _id: 'doc-2', _source: { message: 'warn two' } }]);
  });

  it('re-queries only the still-missing values, then stops when a round resolves nothing', async () => {
    const { esClient, query } = createEsClient();
    query
      .mockResolvedValueOnce(schemaResponse())
      .mockResolvedValueOnce(countResponse(10))
      .mockResolvedValueOnce(categorizeResponse())
      // Round 1 resolves only "error one"; "warn two" is crowded out / missing.
      .mockResolvedValueOnce(concreteFetchResponse([['doc-1', { message: 'error one' }]]))
      // Round 2 re-queries just "warn two" and finds nothing → loop stops.
      .mockResolvedValueOnce(concreteFetchResponse([]));

    const result = await getDiverseSampleDocuments({
      esClient,
      index: ['logs-a', 'logs-b'],
      start: 100,
      end: 200,
      size: 2,
      offset: 0,
      logger,
    });

    expect(query.mock.calls[3][0].query).toContain(
      'WHERE message::KEYWORD IN ("error one", "warn two")'
    );
    expect(query.mock.calls[4][0].query).toContain('WHERE message::KEYWORD IN ("warn two")');
    expect(result.hits).toEqual([{ _index: '', _id: 'doc-1', _source: { message: 'error one' } }]);
    expect(logger.debug).toHaveBeenCalledWith(
      'Diverse sampling: resolved 1/2 representative documents.'
    );
  });
});
