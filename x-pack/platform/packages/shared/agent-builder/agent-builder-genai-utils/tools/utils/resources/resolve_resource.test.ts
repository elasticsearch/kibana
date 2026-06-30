/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { EsResourceType } from '@kbn/agent-builder-common';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { resolveResource, resolveResourceForEsql } from './resolve_resource';

describe('resolveResource', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    esClient = elasticsearchServiceMock.createElasticsearchClient();
  });

  describe('strict validation', () => {
    it('keeps strict single-resource validation in resolveResource', async () => {
      await expect(resolveResource({ resourceName: 'logs-*', esClient })).rejects.toThrow(
        'Tried to resolve resource for multiple resources using pattern logs-*'
      );
    });
  });

  describe('CCS targets (index branch)', () => {
    it('uses _field_caps instead of _mapping for a CCS index target', async () => {
      // _resolve/index succeeds and identifies a remote index
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [{ name: 'remote_cluster:my-index', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });

      // _field_caps returns field metadata
      esClient.fieldCaps.mockResolvedValue({
        indices: ['remote_cluster:my-index'],
        fields: {
          message: { text: { type: 'text', searchable: true, aggregatable: false } },
          status: { keyword: { type: 'keyword', searchable: true, aggregatable: true } },
        },
      });

      const result = await resolveResource({
        resourceName: 'remote_cluster:my-index',
        esClient,
      });

      // Should use _field_caps, not _mapping
      expect(esClient.fieldCaps).toHaveBeenCalledWith({
        index: 'remote_cluster:my-index',
        fields: ['*'],
      });
      expect(esClient.indices.getMapping).not.toHaveBeenCalled();

      expect(result).toEqual({
        name: 'remote_cluster:my-index',
        type: EsResourceType.index,
        fields: expect.arrayContaining([
          expect.objectContaining({ path: 'message', type: 'text' }),
          expect.objectContaining({ path: 'status', type: 'keyword' }),
        ]),
        isTsdb: false,
      });

      // CCS resources should not have description (not available via _field_caps)
      expect(result.description).toBeUndefined();
    });
  });

  describe('CCS targets (data stream branch)', () => {
    it('uses _field_caps instead of _data_stream/_mappings for a CCS data stream target', async () => {
      // _resolve/index succeeds and identifies a remote data stream
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [],
        aliases: [],
        data_streams: [
          { name: 'remote_cluster:logs-ds', backing_indices: [], timestamp_field: '@timestamp' },
        ],
      });

      // _field_caps returns field metadata
      esClient.fieldCaps.mockResolvedValue({
        indices: ['remote_cluster:logs-ds'],
        fields: {
          '@timestamp': { date: { type: 'date', searchable: true, aggregatable: true } },
          level: { keyword: { type: 'keyword', searchable: true, aggregatable: true } },
        },
      });

      const result = await resolveResource({
        resourceName: 'remote_cluster:logs-ds',
        esClient,
      });

      // Should use _field_caps, not _data_stream/_mappings
      expect(esClient.fieldCaps).toHaveBeenCalledWith({
        index: 'remote_cluster:logs-ds',
        fields: ['*'],
      });
      expect(esClient.transport.request).not.toHaveBeenCalled();

      expect(result).toEqual({
        name: 'remote_cluster:logs-ds',
        type: EsResourceType.dataStream,
        fields: expect.arrayContaining([
          expect.objectContaining({ path: '@timestamp', type: 'date' }),
          expect.objectContaining({ path: 'level', type: 'keyword' }),
        ]),
        isTsdb: false,
      });

      // CCS resources should not have description
      expect(result.description).toBeUndefined();
    });
  });

  describe('local targets (unchanged behavior)', () => {
    it('uses _mapping API for a local index', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [{ name: 'my-local-index', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });

      esClient.indices.getMapping.mockResolvedValue({
        'my-local-index': {
          mappings: {
            _meta: { description: 'A test index' },
            properties: {
              title: { type: 'text' },
            },
          },
        },
      });
      esClient.indices.getSettings.mockResolvedValue({
        'my-local-index': { settings: {} },
      } as any);

      const result = await resolveResource({
        resourceName: 'my-local-index',
        esClient,
      });

      // Should use _mapping, not _field_caps
      expect(esClient.indices.getMapping).toHaveBeenCalledWith({ index: ['my-local-index'] });
      expect(esClient.fieldCaps).not.toHaveBeenCalled();

      expect(result).toEqual({
        name: 'my-local-index',
        type: EsResourceType.index,
        fields: [{ path: 'title', type: 'text', meta: {}, searchable: true }],
        description: 'A test index',
        isTsdb: false,
      });
    });
  });

  describe('resolveResourceForEsql', () => {
    it('uses index mappings for a single resolved index', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [{ name: 'logs-1', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });

      esClient.indices.getMapping.mockResolvedValue({
        'logs-1': {
          mappings: {
            properties: {
              message: { type: 'text' },
            },
            _meta: { description: 'logs index' },
          },
        },
      });
      esClient.indices.getSettings.mockResolvedValue({
        'logs-1': { settings: {} },
      } as any);

      const result = await resolveResourceForEsql({ resourceName: 'logs-1', esClient });

      expect(esClient.indices.resolveIndex).toHaveBeenCalledWith({
        name: ['logs-1'],
        allow_no_indices: false,
        expand_wildcards: ['all'],
      });
      expect(esClient.indices.getMapping).toHaveBeenCalledWith({
        index: ['logs-1'],
      });
      expect(result).toEqual({
        name: 'logs-1',
        type: EsResourceType.index,
        fields: [{ path: 'message', type: 'text', searchable: true, meta: {} }],
        description: 'logs index',
        isTsdb: false,
      });
    });

    it('uses field caps for multi-target patterns', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [
          { name: 'logs-1', attributes: ['open'] },
          { name: 'logs-2', attributes: ['open'] },
        ],
        aliases: [],
        data_streams: [],
      });

      esClient.fieldCaps.mockResolvedValue({
        indices: ['logs-1', 'logs-2'],
        fields: {
          '@timestamp': {
            date: { type: 'date', searchable: true, aggregatable: true },
          },
        },
      });

      const result = await resolveResourceForEsql({ resourceName: 'logs-*', esClient });

      expect(esClient.fieldCaps).toHaveBeenCalledWith({
        index: 'logs-*',
        fields: ['*'],
      });
      expect(esClient.indices.getMapping).not.toHaveBeenCalled();
      expect(result).toEqual({
        name: 'logs-*',
        type: EsResourceType.indexPattern,
        fields: expect.arrayContaining([
          expect.objectContaining({ path: '@timestamp', type: 'date' }),
        ]),
        isTsdb: false,
      });
    });

    it('throws when resolveIndex finds no matching resources', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [],
        aliases: [],
        data_streams: [],
      });

      await expect(
        resolveResourceForEsql({ resourceName: 'no-match-*', esClient })
      ).rejects.toThrow("No resource found for 'no-match-*'");
    });

    it('maps not_found from resolveIndex to a clear error', async () => {
      esClient.indices.resolveIndex.mockRejectedValue(
        new esErrors.ResponseError({ statusCode: 404 } as any)
      );

      await expect(
        resolveResourceForEsql({ resourceName: 'missing-index', esClient })
      ).rejects.toThrow("No resource found for 'missing-index'");
    });

    it('falls back to an external ES|QL dataset when resolveIndex throws not_found', async () => {
      esClient.indices.resolveIndex.mockRejectedValue(
        new esErrors.ResponseError({ statusCode: 404 } as any)
      );
      esClient.transport.request.mockResolvedValue({
        datasets: [
          { name: 'employees', data_source: 'local_minio', resource: 's3://my-bucket/*.csv' },
        ],
      });
      esClient.esql.query.mockResolvedValue({
        columns: [
          { name: 'emp_no', type: 'integer' },
          { name: 'department', type: 'keyword' },
        ],
        values: [],
      });

      const result = await resolveResourceForEsql({
        resourceName: 'employees',
        esClient,
        includeDatasets: true,
      });

      expect(esClient.esql.query).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'FROM employees | LIMIT 0' }),
        expect.anything()
      );
      expect(result).toEqual({
        name: 'employees',
        type: EsResourceType.dataset,
        fields: [
          { path: 'emp_no', type: 'integer', meta: {} },
          { path: 'department', type: 'keyword', meta: {} },
        ],
        isTsdb: false,
      });
    });

    it('falls back to an external ES|QL dataset when resolveIndex finds no resources', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [],
        aliases: [],
        data_streams: [],
      });
      esClient.transport.request.mockResolvedValue({
        datasets: [
          { name: 'employees', data_source: 'local_minio', resource: 's3://my-bucket/*.csv' },
        ],
      });
      esClient.esql.query.mockResolvedValue({
        columns: [{ name: 'emp_no', type: 'integer' }],
        values: [],
      });

      const result = await resolveResourceForEsql({
        resourceName: 'employees',
        esClient,
        includeDatasets: true,
      });

      expect(result.type).toBe(EsResourceType.dataset);
      expect(result.fields).toEqual([{ path: 'emp_no', type: 'integer', meta: {} }]);
    });

    it('uses field caps with index pattern type when multiple aliases match and no indices', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [],
        aliases: [
          { name: 'alias-a', indices: ['idx-1'] },
          { name: 'alias-b', indices: ['idx-2'] },
        ],
        data_streams: [],
      });

      esClient.fieldCaps.mockResolvedValue({
        indices: ['idx-1', 'idx-2'],
        fields: {
          host: { keyword: { type: 'keyword', searchable: true, aggregatable: true } },
        },
      });

      const result = await resolveResourceForEsql({ resourceName: 'alias-a,alias-b', esClient });

      expect(esClient.fieldCaps).toHaveBeenCalledWith({
        index: 'alias-a,alias-b',
        fields: ['*'],
      });
      expect(result).toEqual({
        name: 'alias-a,alias-b',
        type: EsResourceType.indexPattern,
        fields: expect.arrayContaining([
          expect.objectContaining({ path: 'host', type: 'keyword' }),
        ]),
        isTsdb: false,
      });
    });

    it('uses field caps with index pattern type when multiple data streams match', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [],
        aliases: [],
        data_streams: [
          { name: 'logs-ds-1', backing_indices: [], timestamp_field: '@timestamp' },
          { name: 'logs-ds-2', backing_indices: [], timestamp_field: '@timestamp' },
        ],
      });

      esClient.fieldCaps.mockResolvedValue({
        indices: ['.ds-logs-ds-1', '.ds-logs-ds-2'],
        fields: {
          '@timestamp': { date: { type: 'date', searchable: true, aggregatable: true } },
        },
      });

      const result = await resolveResourceForEsql({ resourceName: 'logs-*', esClient });

      expect(result.type).toBe(EsResourceType.indexPattern);
      expect(result.name).toBe('logs-*');
      expect(result.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: '@timestamp', type: 'date' })])
      );
    });
  });

  describe('isTsdb flag', () => {
    it('ignores field markers for concrete index and follows index.mode setting', async () => {
      // Index advertises time_series in settings, even with no field-level markers -> true
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [{ name: 'metrics-host', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });
      esClient.indices.getMapping.mockResolvedValue({
        'metrics-host': { mappings: { properties: { '@timestamp': { type: 'date' } } } },
      } as any);
      esClient.indices.getSettings.mockResolvedValue({
        'metrics-host': { settings: { 'index.mode': 'time_series' } },
      } as any);

      const result = await resolveResource({ resourceName: 'metrics-host', esClient });
      expect(result.isTsdb).toBe(true);
    });

    it('is false when no field carries tsdb markers (index branch)', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [{ name: 'logs', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });
      esClient.indices.getMapping.mockResolvedValue({
        logs: {
          mappings: {
            properties: {
              message: { type: 'text' },
              level: { type: 'keyword' },
            },
          },
        },
      } as any);
      esClient.indices.getSettings.mockResolvedValue({
        logs: { settings: {} },
      } as any);

      const result = await resolveResource({ resourceName: 'logs', esClient });

      expect(result.isTsdb).toBe(false);
    });

    it('is true for an alias whose merged field_caps surfaces tsdb markers', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [],
        aliases: [{ name: 'metrics-alias', indices: ['metrics-host'] }],
        data_streams: [],
      });
      esClient.fieldCaps.mockResolvedValue({
        indices: ['metrics-host'],
        fields: {
          'host.name': {
            keyword: {
              type: 'keyword',
              searchable: true,
              aggregatable: true,
              time_series_dimension: true,
            },
          },
        },
      });

      const result = await resolveResource({ resourceName: 'metrics-alias', esClient });

      expect(result.isTsdb).toBe(true);
    });

    it('is set on multi-target resolveResourceForEsql results', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [
          { name: 'metrics-1', attributes: ['open'] },
          { name: 'metrics-2', attributes: ['open'] },
        ],
        aliases: [],
        data_streams: [],
      });
      esClient.fieldCaps.mockResolvedValue({
        indices: ['metrics-1', 'metrics-2'],
        fields: {
          'system.cpu.pct': {
            float: {
              type: 'float',
              searchable: true,
              aggregatable: true,
              time_series_metric: 'gauge',
            },
          },
        },
      });

      const result = await resolveResourceForEsql({ resourceName: 'metrics-*', esClient });

      expect(result.isTsdb).toBe(true);
    });
  });

  describe('isTsdb — authoritative detection for indices', () => {
    it('reads index.mode from _settings and returns true for time_series', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [{ name: 'metrics-host', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });
      esClient.indices.getMapping.mockResolvedValue({
        'metrics-host': {
          mappings: { properties: { 'host.name': { type: 'keyword' } } },
        },
      } as any);
      esClient.indices.getSettings.mockResolvedValue({
        'metrics-host': { settings: { 'index.mode': 'time_series' } },
      } as any);

      const result = await resolveResource({ resourceName: 'metrics-host', esClient });

      expect(esClient.indices.getSettings).toHaveBeenCalledWith({
        index: 'metrics-host',
        flat_settings: true,
      });
      expect(result.isTsdb).toBe(true);
    });

    it('returns isTsdb=false for a logsdb index even when fields carry time_series_dimension', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [{ name: 'logs-app', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });
      esClient.indices.getMapping.mockResolvedValue({
        'logs-app': {
          mappings: {
            properties: {
              'agent.name': { type: 'keyword', time_series_dimension: true } as any,
            },
          },
        },
      } as any);
      esClient.indices.getSettings.mockResolvedValue({
        'logs-app': { settings: { 'index.mode': 'logsdb' } },
      } as any);

      const result = await resolveResource({ resourceName: 'logs-app', esClient });

      expect(result.isTsdb).toBe(false);
    });

    it('returns isTsdb=false when index.mode setting is absent', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [{ name: 'standard-idx', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });
      esClient.indices.getMapping.mockResolvedValue({
        'standard-idx': { mappings: { properties: {} } },
      } as any);
      esClient.indices.getSettings.mockResolvedValue({
        'standard-idx': { settings: {} },
      } as any);

      const result = await resolveResource({ resourceName: 'standard-idx', esClient });

      expect(result.isTsdb).toBe(false);
    });
  });

  describe('isTsdb — authoritative detection for data streams', () => {
    it('reads index_mode from _data_stream and returns true for time_series', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [],
        aliases: [],
        data_streams: [
          {
            name: 'metrics-host',
            backing_indices: ['.ds-metrics-host-001'],
            timestamp_field: '@timestamp',
          },
        ],
      });
      // Fields come from _field_caps now (avoids template-level effective_mappings
      // which would miss dynamically added fields).
      esClient.fieldCaps.mockResolvedValue({
        indices: ['.ds-metrics-host-001'],
        fields: { '@timestamp': { date: { type: 'date', searchable: true, aggregatable: true } } },
      });
      esClient.indices.getDataStream.mockResolvedValue({
        data_streams: [
          {
            name: 'metrics-host',
            indices: [{ index_name: '.ds-metrics-host-001', index_mode: 'time_series' }],
          },
        ],
      } as any);

      const result = await resolveResource({ resourceName: 'metrics-host', esClient });

      expect(esClient.indices.getDataStream).toHaveBeenCalledWith({ name: 'metrics-host' });
      expect(esClient.fieldCaps).toHaveBeenCalledWith({ index: 'metrics-host', fields: ['*'] });
      expect(result.isTsdb).toBe(true);
    });

    it('returns isTsdb=false for a logsdb data stream even when fields carry tsdb markers', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [],
        aliases: [],
        data_streams: [
          {
            name: 'logs-app',
            backing_indices: ['.ds-logs-app-001'],
            timestamp_field: '@timestamp',
          },
        ],
      });
      esClient.fieldCaps.mockResolvedValue({
        indices: ['.ds-logs-app-001'],
        fields: {
          'agent.name': {
            keyword: {
              type: 'keyword',
              searchable: true,
              aggregatable: true,
              time_series_dimension: true,
            },
          },
        },
      });
      esClient.indices.getDataStream.mockResolvedValue({
        data_streams: [
          {
            name: 'logs-app',
            indices: [{ index_name: '.ds-logs-app-001', index_mode: 'logsdb' }],
          },
        ],
      } as any);

      const result = await resolveResource({ resourceName: 'logs-app', esClient });
      expect(result.isTsdb).toBe(false);
    });

    it('returns isTsdb=false when index_mode is missing from the data stream response', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [],
        aliases: [],
        data_streams: [
          { name: 'plain-ds', backing_indices: ['.ds-plain-001'], timestamp_field: '@timestamp' },
        ],
      });
      esClient.fieldCaps.mockResolvedValue({
        indices: ['.ds-plain-001'],
        fields: {},
      });
      esClient.indices.getDataStream.mockResolvedValue({
        data_streams: [{ name: 'plain-ds', indices: [{ index_name: '.ds-plain-001' }] }],
      } as any);

      const result = await resolveResource({ resourceName: 'plain-ds', esClient });
      expect(result.isTsdb).toBe(false);
    });

    it('does NOT call _data_stream for a CCS data stream target (uses field caps fallback)', async () => {
      esClient.indices.resolveIndex.mockResolvedValue({
        indices: [],
        aliases: [],
        data_streams: [
          {
            name: 'remote_cluster:logs-ds',
            backing_indices: [],
            timestamp_field: '@timestamp',
          },
        ],
      });
      esClient.fieldCaps.mockResolvedValue({
        indices: ['remote_cluster:logs-ds'],
        fields: { '@timestamp': { date: { type: 'date', searchable: true, aggregatable: true } } },
      });

      await resolveResource({ resourceName: 'remote_cluster:logs-ds', esClient });

      expect(esClient.indices.getDataStream).not.toHaveBeenCalled();
    });
  });
});
