/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import type {
  IndicesResolveIndexResolveIndexItem,
  IndicesResolveIndexResolveIndexAliasItem,
  IndicesResolveIndexResolveIndexDataStreamsItem,
} from '@elastic/elasticsearch/lib/api/types';
import { EsResourceType } from '@kbn/agent-builder-common';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { listSearchSources } from './list_search_sources';

const indexItem = (
  name: string,
  opts: Partial<Omit<IndicesResolveIndexResolveIndexItem, 'name'>> = {}
): IndicesResolveIndexResolveIndexItem => {
  return { name, attributes: ['open'], ...opts };
};

const aliasItem = (name: string, indices: string[]): IndicesResolveIndexResolveIndexAliasItem => {
  return { name, indices };
};

const datastreamItem = (
  name: string,
  indices: string[]
): IndicesResolveIndexResolveIndexDataStreamsItem => {
  return { name, timestamp_field: '@timestamp', backing_indices: indices };
};

describe('listSearchSources', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [],
      aliases: [],
      data_streams: [],
    });
  });

  it('calls resolveIndex with the right parameters', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [],
      aliases: [],
      data_streams: [],
    });

    await listSearchSources({
      pattern: '*',
      esClient,
    });

    expect(esClient.indices.resolveIndex).toHaveBeenCalledTimes(1);
    expect(esClient.indices.resolveIndex).toHaveBeenCalledWith({
      name: ['*'],
      allow_no_indices: true,
      expand_wildcards: ['open'],
    });
  });

  it('returns indices', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [indexItem('index-1'), indexItem('index-2')],
      aliases: [],
      data_streams: [],
    });

    const results = await listSearchSources({
      pattern: '*',
      esClient,
    });

    expect(results.indices.length).toBe(2);
    expect(results.aliases.length).toBe(0);
    expect(results.data_streams.length).toBe(0);

    expect(results.indices).toEqual([
      { name: 'index-1', type: EsResourceType.index },
      { name: 'index-2', type: EsResourceType.index },
    ]);
  });

  it('returns aliases', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [],
      aliases: [aliasItem('alias-1', ['foo', 'bar']), aliasItem('alias-2', ['hello', 'dolly'])],
      data_streams: [],
    });

    const results = await listSearchSources({
      pattern: '*',
      esClient,
    });

    expect(results.indices.length).toBe(0);
    expect(results.aliases.length).toBe(2);
    expect(results.data_streams.length).toBe(0);

    expect(results.aliases).toEqual([
      { name: 'alias-1', type: EsResourceType.alias, indices: ['foo', 'bar'] },
      { name: 'alias-2', type: EsResourceType.alias, indices: ['hello', 'dolly'] },
    ]);
  });

  it('returns data streams', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [],
      aliases: [],
      data_streams: [
        datastreamItem('stream-1', ['stream-1-1', 'stream-1-2']),
        datastreamItem('stream-2', ['stream-2-1', 'stream-2-2']),
      ],
    });

    const results = await listSearchSources({
      pattern: '*',
      esClient,
    });

    expect(results.indices.length).toBe(0);
    expect(results.aliases.length).toBe(0);
    expect(results.data_streams.length).toBe(2);

    expect(results.data_streams).toEqual([
      {
        name: 'stream-1',
        type: EsResourceType.dataStream,
        timestamp_field: '@timestamp',
        indices: ['stream-1-1', 'stream-1-2'],
      },
      {
        name: 'stream-2',
        type: EsResourceType.dataStream,
        timestamp_field: '@timestamp',
        indices: ['stream-2-1', 'stream-2-2'],
      },
    ]);
  });

  it('excludes indices represented as datastreams by default', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [
        indexItem('index-1'),
        indexItem('index-2'),
        indexItem('stream-1-1', { data_stream: 'stream-1' }),
        indexItem('stream-1-2', { data_stream: 'stream-1' }),
        indexItem('stream-2-1', { data_stream: 'stream-2' }),
        indexItem('stream-2-2', { data_stream: 'stream-2' }),
      ],
      aliases: [],
      data_streams: [
        datastreamItem('stream-1', ['stream-1-1', 'stream-1-2']),
        datastreamItem('stream-2', ['stream-2-1', 'stream-2-2']),
      ],
    });

    const results = await listSearchSources({
      pattern: '*',
      esClient,
    });

    expect(results.indices.length).toBe(2);
    expect(results.aliases.length).toBe(0);
    expect(results.data_streams.length).toBe(2);

    expect(results.indices.map((item) => item.name)).toEqual(['index-1', 'index-2']);
    expect(results.data_streams.map((item) => item.name)).toEqual(['stream-1', 'stream-2']);
  });

  it('includes indices represented as datastreams when excludeIndicesRepresentedAsDatastream=false', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [
        indexItem('index-1'),
        indexItem('index-2'),
        indexItem('stream-1-1', { data_stream: 'stream-1' }),
        indexItem('stream-2-1', { data_stream: 'stream-2' }),
      ],
      aliases: [],
      data_streams: [
        datastreamItem('stream-1', ['stream-1-1']),
        datastreamItem('stream-2', ['stream-2-1']),
      ],
    });

    const results = await listSearchSources({
      pattern: '*',
      excludeIndicesRepresentedAsDatastream: false,
      esClient,
    });

    expect(results.indices.length).toBe(4);
    expect(results.aliases.length).toBe(0);
    expect(results.data_streams.length).toBe(2);

    expect(results.indices.map((item) => item.name)).toEqual([
      'index-1',
      'index-2',
      'stream-1-1',
      'stream-2-1',
    ]);
    expect(results.data_streams.map((item) => item.name)).toEqual(['stream-1', 'stream-2']);
  });

  it('excludes indices represented as aliases by default', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [
        indexItem('index-1', { aliases: ['alias-1'] }),
        indexItem('index-2', { aliases: ['alias-1'] }),
        indexItem('index-3', { aliases: ['alias-2'] }),
        indexItem('index-4', { aliases: [] }),
      ],
      aliases: [aliasItem('alias-1', ['index-1', 'index-2']), aliasItem('alias-2', ['index-3'])],
      data_streams: [],
    });

    const results = await listSearchSources({
      pattern: '*',
      esClient,
    });

    expect(results.indices.length).toBe(1);
    expect(results.aliases.length).toBe(2);
    expect(results.data_streams.length).toBe(0);

    expect(results.indices.map((item) => item.name)).toEqual(['index-4']);
    expect(results.aliases.map((item) => item.name)).toEqual(['alias-1', 'alias-2']);
  });

  it('includes indices represented as aliases when excludeIndicesRepresentedAsAlias=false', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [
        indexItem('index-1', { aliases: ['alias-1'] }),
        indexItem('index-2', { aliases: ['alias-1'] }),
        indexItem('index-3', { aliases: ['alias-2'] }),
        indexItem('index-4', { aliases: [] }),
      ],
      aliases: [aliasItem('alias-1', ['index-1', 'index-2']), aliasItem('alias-2', ['index-3'])],
      data_streams: [],
    });

    const results = await listSearchSources({
      pattern: '*',
      excludeIndicesRepresentedAsAlias: false,
      esClient,
    });

    expect(results.indices.length).toBe(4);
    expect(results.aliases.length).toBe(2);
    expect(results.data_streams.length).toBe(0);

    expect(results.indices.map((item) => item.name)).toEqual([
      'index-1',
      'index-2',
      'index-3',
      'index-4',
    ]);
    expect(results.aliases.map((item) => item.name)).toEqual(['alias-1', 'alias-2']);
  });

  it('filters out dot-prefixed indices not on the allow-list by default', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [
        indexItem('regular-index-1'),
        indexItem('.kibana_8.0.0_001'),
        indexItem('.fleet-actions'),
        indexItem('.fleet-agents-000001'),
        indexItem('.metrics-endpoint.metadata_united_default'),
        indexItem('.siem-signals-default'),
        indexItem('regular-index-2'),
      ],
      aliases: [],
      data_streams: [],
    });

    const results = await listSearchSources({
      pattern: '*',
      esClient,
    });

    expect(results.indices.map((item) => item.name)).toEqual([
      'regular-index-1',
      '.fleet-agents-000001',
      '.metrics-endpoint.metadata_united_default',
      '.siem-signals-default',
      'regular-index-2',
    ]);
  });

  it('returns on-list dot-prefixed aliases (e.g. `.alerts-*`)', async () => {
    // `.alerts-security.alerts-default` is on the curated allow-list, so it must
    // surface even though it's dot-prefixed.
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [],
      aliases: [
        aliasItem('.alerts-security.alerts-default', [
          '.internal.alerts-security.alerts-default-000001',
        ]),
      ],
      data_streams: [],
    });

    const results = await listSearchSources({
      pattern: '.alerts-*',
      esClient,
    });

    expect(results.aliases.map((item) => item.name)).toEqual(['.alerts-security.alerts-default']);
  });

  it('filters off-list dot-prefixed aliases and data streams', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [],
      aliases: [
        aliasItem('.fleet-actions', ['.fleet-actions-7']),
        aliasItem('.alerts-observability.logs.alerts-default', ['logs-backing-1']),
      ],
      data_streams: [
        datastreamItem('.chat-conversations', ['.ds-chat-conversations-1']),
        datastreamItem('.ml-anomalies-shared', ['ml-backing-1']),
      ],
    });

    const results = await listSearchSources({
      pattern: '.*',
      esClient,
    });

    expect(results.aliases.map((item) => item.name)).toEqual([
      '.alerts-observability.logs.alerts-default',
    ]);
    expect(results.data_streams.map((item) => item.name)).toEqual(['.ml-anomalies-shared']);
  });

  it('applies the allow-list uniformly across indices, aliases, and data streams', async () => {
    // Mixed bag: confirm each bucket honors the same policy so off-list names
    // can't sneak in through any result type.
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [indexItem('.kibana_8.0.0_001'), indexItem('.monitoring-es-8-mb-2024.01.01')],
      aliases: [
        aliasItem('.fleet-actions', ['some-index']),
        aliasItem('.alerts-security.alerts-default', ['some-index']),
      ],
      data_streams: [
        datastreamItem('.chat-conversations', ['chat-backing-1']),
        datastreamItem('.ml-anomalies-shared', ['ml-backing-1']),
      ],
    });

    const results = await listSearchSources({
      pattern: '.*',
      esClient,
    });

    expect(results.indices.map((item) => item.name)).toEqual(['.monitoring-es-8-mb-2024.01.01']);
    expect(results.aliases.map((item) => item.name)).toEqual(['.alerts-security.alerts-default']);
    expect(results.data_streams.map((item) => item.name)).toEqual(['.ml-anomalies-shared']);
  });

  it('still dedupes backing indices when their parent alias is filtered out by the allow-list', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [
        indexItem('.monitoring-fleet-7', { aliases: ['.fleet-actions'] }),
        indexItem('regular-index'),
      ],
      aliases: [aliasItem('.fleet-actions', ['.monitoring-fleet-7'])],
      data_streams: [],
    });

    const results = await listSearchSources({
      pattern: '*',
      esClient,
    });

    expect(results.aliases).toEqual([]);
    expect(results.indices.map((item) => item.name)).toEqual(['regular-index']);
  });

  it('truncates per-type results to max `perTypeLimit`', async () => {
    esClient.indices.resolveIndex.mockResolvedValue({
      indices: [indexItem('index-1'), indexItem('index-2'), indexItem('index-3')],
      aliases: [
        aliasItem('alias-1', ['foo']),
        aliasItem('alias-2', ['foo']),
        aliasItem('alias-3', ['foo']),
      ],
      data_streams: [
        datastreamItem('stream-1', ['bar']),
        datastreamItem('stream-2', ['bar']),
        datastreamItem('stream-3', ['bar']),
      ],
    });

    const results = await listSearchSources({
      pattern: '*',
      perTypeLimit: 2,
      esClient,
    });

    expect(results.indices.length).toBe(2);
    expect(results.aliases.length).toBe(2);
    expect(results.data_streams.length).toBe(2);

    expect(results.indices.map((item) => item.name)).toEqual(['index-1', 'index-2']);
    expect(results.aliases.map((item) => item.name)).toEqual(['alias-1', 'alias-2']);
    expect(results.data_streams.map((item) => item.name)).toEqual(['stream-1', 'stream-2']);
  });

  it('returns empty results and a warning in case of not_found error', async () => {
    esClient.indices.resolveIndex.mockImplementation(async () => {
      throw new esErrors.ResponseError({ statusCode: 404 } as any);
    });

    const results = await listSearchSources({
      pattern: '*',
      esClient,
    });

    expect(results.indices.length).toBe(0);
    expect(results.aliases.length).toBe(0);
    expect(results.data_streams.length).toBe(0);

    expect(results.warnings).toEqual(['No sources found.']);
  });

  describe('datasets', () => {
    const datasetResponse = {
      datasets: [
        { name: 'employees', data_source: 'local_minio', resource: 's3://my-bucket/emp/*.csv' },
        { name: 'customers', data_source: 'local_minio', resource: 's3://my-bucket/cust/*.csv' },
      ],
    };

    it('does not fetch datasets when includeDatasets is not set', async () => {
      esClient.transport.request.mockResolvedValue(datasetResponse);

      const results = await listSearchSources({ pattern: '*', esClient });

      expect(esClient.transport.request).not.toHaveBeenCalled();
      expect(results.datasets).toEqual([]);
    });

    it('returns external ES|QL datasets from the `_query/dataset` API', async () => {
      esClient.transport.request.mockResolvedValue(datasetResponse);

      const results = await listSearchSources({ pattern: '*', includeDatasets: true, esClient });

      expect(results.datasets).toEqual([
        {
          type: EsResourceType.dataset,
          name: 'employees',
          data_source: 'local_minio',
          resource: 's3://my-bucket/emp/*.csv',
        },
        {
          type: EsResourceType.dataset,
          name: 'customers',
          data_source: 'local_minio',
          resource: 's3://my-bucket/cust/*.csv',
        },
      ]);
    });

    it('filters datasets by the provided pattern', async () => {
      esClient.transport.request.mockResolvedValue(datasetResponse);

      const results = await listSearchSources({ pattern: 'emp*', includeDatasets: true, esClient });

      expect(results.datasets.map((d) => d.name)).toEqual(['employees']);
    });

    it('honors `-`-prefixed exclusion patterns for datasets', async () => {
      esClient.transport.request.mockResolvedValue(datasetResponse);

      const results = await listSearchSources({
        pattern: '*,-employees',
        includeDatasets: true,
        esClient,
      });

      expect(results.datasets.map((d) => d.name)).toEqual(['customers']);
    });

    it('degrades gracefully to no datasets when the `_query/dataset` API is unavailable', async () => {
      esClient.transport.request.mockRejectedValue(new Error('no handler found for uri'));

      const results = await listSearchSources({ pattern: '*', includeDatasets: true, esClient });

      expect(results.datasets).toEqual([]);
    });

    it('still returns matching datasets when resolveIndex throws not_found (exact dataset name)', async () => {
      esClient.transport.request.mockResolvedValue(datasetResponse);
      esClient.indices.resolveIndex.mockImplementation(async () => {
        throw new esErrors.ResponseError({ statusCode: 404 } as any);
      });

      const results = await listSearchSources({
        pattern: 'employees',
        includeDatasets: true,
        esClient,
      });

      expect(results.indices.length).toBe(0);
      expect(results.datasets.map((d) => d.name)).toEqual(['employees']);
      expect(results.warnings).toEqual([]);
    });
  });
});
