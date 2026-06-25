/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LOOKUP_INDEX_RECREATE_ROUTE } from '@kbn/esql-types';
import { EsqlServiceTestbed } from './testbed';

describe('ESQL routes', () => {
  const testbed = new EsqlServiceTestbed();

  beforeAll(async () => {
    await testbed.start();
    await testbed.setupLookupIndices();
    await testbed.setupTimeseriesIndices();
    await testbed.setupClosedLookupIndex();
  });

  afterAll(async () => {
    await testbed.stop();
  });

  it('can load ES|QL Autocomplete/Validation indices for JOIN command', async () => {
    const url = '/internal/esql/autocomplete/join/indices';
    const result = await testbed.GET(url).send().expect(200);

    const item1 = result.body.indices.find((item: any) => item.name === 'lookup_index1');
    const item2 = result.body.indices.find((item: any) => item.name === 'lookup_index2');

    expect(item1).toMatchObject({
      name: 'lookup_index1',
      mode: 'Lookup',
      aliases: [],
    });

    item2.aliases.sort();

    expect(item2).toMatchObject({
      name: 'lookup_index2',
      mode: 'Lookup',
      aliases: ['lookup_index2_alias1', 'lookup_index2_alias2'],
    });
  });

  it('returns closed lookup indices with status: closed in JOIN indices response', async () => {
    const url = '/internal/esql/autocomplete/join/indices';
    const result = await testbed.GET(url).send().expect(200);

    const closedItem = result.body.indices.find((item: any) => item.name === 'closed_lookup_index');

    expect(closedItem).toMatchObject({
      name: 'closed_lookup_index',
      mode: 'Lookup',
      isClosed: true,
    });
  });

  it('does not include closed lookup indices in sources endpoint', async () => {
    const url = '/internal/esql/autocomplete/sources/local';
    const result = await testbed.GET(url).send().expect(200);

    const closedItem = result.body.find((item: any) => item.name === 'closed_lookup_index');
    expect(closedItem).toBeUndefined();
  });

  it('can load ES|QL Autocomplete/Validation indices for TS command', async () => {
    const url = '/internal/esql/autocomplete/timeseries/indices';
    const result = await testbed.GET(url).send().expect(200);

    const item1 = result.body.indices.find((item: any) => item.name === 'ts_index1');
    const item2 = result.body.indices.find((item: any) => item.name === 'ts_index2');

    expect(item1).toMatchObject({
      name: 'ts_index1',
      mode: 'Timeseries',
      aliases: [],
    });

    item2.aliases.sort();

    expect(item2).toMatchObject({
      name: 'ts_index2',
      mode: 'Timeseries',
      aliases: ['ts_index2_alias1', 'ts_index2_alias2'],
    });
  });

  it('can load the sources endpoints', async () => {
    const url = '/internal/esql/autocomplete/sources/local';
    const result = await testbed.GET(url).send().expect(200);

    expect(result.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'lookup_index1', type: 'Lookup' }),
        expect.objectContaining({ name: 'lookup_index2', type: 'Lookup' }),
        expect.objectContaining({ name: 'ts_index1', type: 'Timeseries' }),
        expect.objectContaining({ name: 'ts_index2', type: 'Timeseries' }),
      ])
    );
  });

  it('can load ES|QL views (GET /internal/esql/views)', async () => {
    const url = '/internal/esql/views';
    const result = await testbed.GET(url).send().expect(200);

    expect(result.body).toHaveProperty('views');
    expect(Array.isArray(result.body.views)).toBe(true);
    result.body.views.forEach((view: { name: string; query: string }) => {
      expect(view).toHaveProperty('name');
      expect(view).toHaveProperty('query');
      expect(typeof view.name).toBe('string');
      expect(typeof view.query).toBe('string');
    });
  });

  it('can load ES|QL datasets (GET /internal/esql/datasets)', async () => {
    const url = '/internal/esql/datasets';
    const result = await testbed.GET(url).send().expect(200);

    expect(result.body).toHaveProperty('datasets');
    expect(Array.isArray(result.body.datasets)).toBe(true);
    result.body.datasets.forEach(
      (dataset: {
        name: string;
        data_source: string;
        resource: string;
        description?: string;
        settings?: Record<string, unknown>;
      }) => {
        expect(dataset).toHaveProperty('name');
        expect(dataset).toHaveProperty('data_source');
        expect(dataset).toHaveProperty('resource');
        expect(typeof dataset.name).toBe('string');
        expect(typeof dataset.data_source).toBe('string');
        expect(typeof dataset.resource).toBe('string');
        if (dataset.description !== undefined) {
          expect(typeof dataset.description).toBe('string');
        }
        if (dataset.settings !== undefined) {
          expect(typeof dataset.settings).toBe('object');
          expect(Array.isArray(dataset.settings)).toBe(false);
        }
      }
    );
  });

  it('can load the inference endpoints by type', async () => {
    const url = '/internal/esql/autocomplete/inference_endpoints/rerank';
    const result = await testbed.GET(url).send().expect(200);

    const rerankInferenceEndpoint = result.body.inferenceEndpoints[0];

    expect(rerankInferenceEndpoint).toMatchObject({
      inference_id: '.rerank-v1-elasticsearch',
      task_type: 'rerank',
    });
  });

  describe('get timefield route', () => {
    const url = '/internal/esql/get_timefield';

    it('should return the time field when specified in the query', async () => {
      const query = 'FROM lookup_index1 | WHERE my_time_field >= ?_tstart';
      const result = await testbed.POST(url).send({ query }).expect(200);

      expect(result.body.timeField).toBe('my_time_field');
    });

    it('should return @timestamp when no time field in query but index has @timestamp', async () => {
      const indexName = 'test_timefield_index';
      const client = testbed.esClient();

      await client.indices.create({
        index: indexName,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            message: { type: 'text' },
          },
        },
      });

      const query = `FROM ${indexName}`;
      const result = await testbed.POST(url).send({ query }).expect(200);

      expect(result.body.timeField).toBe('@timestamp');

      // Cleanup
      await client.indices.delete({ index: indexName });
    });

    it('should return undefined when no time field in query and index has no @timestamp', async () => {
      const query = 'FROM lookup_index1';
      const result = await testbed.POST(url).send({ query }).expect(200);

      expect(result.body.timeField).toBe(undefined);
    });

    it('should return @timestamp for subqueries when all indices have @timestamp', async () => {
      // Create indices with @timestamp for subquery test
      const index1 = 'subquery_index1';
      const index2 = 'subquery_index2';
      const client = testbed.esClient();

      await client.indices.create({
        index: index1,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            field1: { type: 'keyword' },
          },
        },
      });

      await client.indices.create({
        index: index2,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            field2: { type: 'keyword' },
          },
        },
      });

      const query = `FROM ${index1}, (FROM ${index2})`;
      const result = await testbed.POST(url).send({ query }).expect(200);

      expect(result.body.timeField).toBe('@timestamp');

      // Cleanup
      await client.indices.delete({ index: index1 });
      await client.indices.delete({ index: index2 });
    });

    it('should return undefined for subqueries when not all indices have @timestamp', async () => {
      const index1 = 'subquery_with_ts_index1';
      const index2 = 'subquery_no_ts_index2';
      const client = testbed.esClient();

      await client.indices.create({
        index: index1,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            field1: { type: 'keyword' },
          },
        },
      });

      await client.indices.create({
        index: index2,
        mappings: {
          properties: {
            created_at: { type: 'date' }, // Different time field
            field2: { type: 'keyword' },
          },
        },
      });

      const query = `FROM ${index1}, (FROM ${index2})`;
      const result = await testbed.POST(url).send({ query }).expect(200);

      expect(result.body.timeField).toBe(undefined);

      // Cleanup
      await client.indices.delete({ index: index1 });
      await client.indices.delete({ index: index2 });
    });

    it('should return @timestamp for multiple indices without subqueries when all have @timestamp', async () => {
      const index1 = 'multi_ts_index1';
      const index2 = 'multi_ts_index2';
      const client = testbed.esClient();

      await client.indices.create({
        index: index1,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            field1: { type: 'keyword' },
          },
        },
      });

      await client.indices.create({
        index: index2,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            field2: { type: 'keyword' },
          },
        },
      });

      const query = `FROM ${index1}, ${index2}`;
      const result = await testbed.POST(url).send({ query }).expect(200);

      expect(result.body.timeField).toBe('@timestamp');

      // Cleanup
      await client.indices.delete({ index: index1 });
      await client.indices.delete({ index: index2 });
    });

    it('should return @timestamp for multiple indices without subqueries when only some have @timestamp', async () => {
      const index1 = 'mixed_ts_index1';
      const index2 = 'mixed_no_ts_index2';
      const client = testbed.esClient();

      await client.indices.create({
        index: index1,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            field1: { type: 'keyword' },
          },
        },
      });

      await client.indices.create({
        index: index2,
        mappings: {
          properties: {
            created_at: { type: 'date' },
            field2: { type: 'keyword' },
          },
        },
      });

      const query = `FROM ${index1}, ${index2}`;
      const result = await testbed.POST(url).send({ query }).expect(200);

      expect(result.body.timeField).toBe('@timestamp');

      // Cleanup
      await client.indices.delete({ index: index1 });
      await client.indices.delete({ index: index2 });
    });

    it('should return @timestamp when ES|QL source is a view that returns @timestamp', async () => {
      const indexName = 'test_timefield_view_index';
      const viewName = 'test-timefield-view';
      const client = testbed.esClient();

      await client.indices.create({
        index: indexName,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            message: { type: 'text' },
          },
        },
      });

      await client.transport.request({
        method: 'PUT',
        path: `/_query/view/${encodeURIComponent(viewName)}`,
        body: {
          query: `FROM ${indexName}`,
        },
      });

      const query = `FROM ${viewName}`;
      const result = await testbed.POST(url).send({ query }).expect(200);

      expect(result.body.timeField).toBe('@timestamp');

      // Cleanup
      await client.transport.request({
        method: 'DELETE',
        path: `/_query/view/${encodeURIComponent(viewName)}`,
      });
      await client.indices.delete({ index: indexName });
    });

    it('should return undefined when ES|QL source is a view that does not return @timestamp', async () => {
      const indexName = 'test_no_timefield_view_index';
      const viewName = 'test-no-timefield-view';
      const client = testbed.esClient();

      await client.indices.create({
        index: indexName,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            message: { type: 'text' },
          },
        },
      });

      await client.transport.request({
        method: 'PUT',
        path: `/_query/view/${encodeURIComponent(viewName)}`,
        body: {
          query: `FROM ${indexName} | KEEP message`,
        },
      });

      const query = `FROM ${viewName}`;
      const result = await testbed.POST(url).send({ query }).expect(200);

      expect(result.body.timeField).toBe(undefined);

      // Cleanup
      await client.transport.request({
        method: 'DELETE',
        path: `/_query/view/${encodeURIComponent(viewName)}`,
      });
      await client.indices.delete({ index: indexName });
    });
  });

  describe('POST /internal/esql/lookup_index/{indexName}/recreate', () => {
    it('can recreate a lookup index', async () => {
      const indexName = 'test_lookup_index_recreate';
      const client = testbed.esClient();

      // Create an index with some data
      await client.indices.create({
        index: indexName,
        settings: {
          mode: 'lookup',
        },
      });

      await client.index({
        index: indexName,
        id: '1',
        document: { name: 'test' },
        refresh: 'wait_for',
      });

      // Verify the document exists
      let searchResult = await client.search({ index: indexName });
      expect(searchResult.hits.total).toMatchObject({ value: 1 });

      // Recreate the index
      const url = `${LOOKUP_INDEX_RECREATE_ROUTE}/${indexName}`;
      const result = await testbed.POST(url).send().expect(200);

      expect(result.body).toMatchObject({
        acknowledged: true,
        index: indexName,
      });

      // Verify the index was recreated and is empty
      await client.indices.refresh({ index: indexName });
      searchResult = await client.search({ index: indexName });
      expect(searchResult.hits.total).toMatchObject({ value: 0 });

      // Verify it still has lookup mode
      const indexSettings = await client.indices.getSettings({ index: indexName });
      expect(indexSettings[indexName].settings?.index?.mode).toBe('lookup');

      // Cleanup
      await client.indices.delete({ index: indexName });
    });
  });
});
