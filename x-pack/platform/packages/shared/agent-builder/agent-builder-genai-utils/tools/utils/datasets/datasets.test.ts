/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { listDatasets, getDatasetFields } from './datasets';

describe('datasets utils', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
  });

  describe('listDatasets', () => {
    it('returns the datasets reported by the `_query/dataset` API', async () => {
      esClient.transport.request.mockResolvedValue({
        datasets: [
          { name: 'employees', data_source: 'local_minio', resource: 's3://my-bucket/*.csv' },
        ],
      });

      const datasets = await listDatasets({ esClient });

      expect(esClient.transport.request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/_query/dataset',
      });
      expect(datasets).toEqual([
        { name: 'employees', data_source: 'local_minio', resource: 's3://my-bucket/*.csv' },
      ]);
    });

    it('returns an empty list when the API is not supported (request throws)', async () => {
      esClient.transport.request.mockRejectedValue(new Error('no handler found for uri'));

      const datasets = await listDatasets({ esClient });

      expect(datasets).toEqual([]);
    });

    it('returns an empty list when the response has no datasets', async () => {
      esClient.transport.request.mockResolvedValue({});

      const datasets = await listDatasets({ esClient });

      expect(datasets).toEqual([]);
    });
  });

  describe('getDatasetFields', () => {
    it('introspects columns via `FROM <name> | LIMIT 0` and maps them to fields', async () => {
      esClient.esql.query.mockResolvedValue({
        columns: [
          { name: 'emp_no', type: 'integer' },
          { name: 'first_name', type: 'keyword' },
        ],
        values: [],
      });

      const fields = await getDatasetFields({ name: 'employees', esClient });

      expect(esClient.esql.query).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'FROM employees | LIMIT 0' }),
        expect.anything()
      );
      expect(fields).toEqual([
        { path: 'emp_no', type: 'integer', meta: {} },
        { path: 'first_name', type: 'keyword', meta: {} },
      ]);
    });
  });
});
