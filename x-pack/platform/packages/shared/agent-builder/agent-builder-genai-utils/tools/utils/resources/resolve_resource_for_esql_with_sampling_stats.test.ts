/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { EsResourceType } from '@kbn/agent-builder-common';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { resolveResourceForEsqlWithSamplingStats } from './resolve_resource_for_esql_with_sampling_stats';

describe('resolveResourceForEsqlWithSamplingStats', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    esClient = elasticsearchServiceMock.createElasticsearchClient();
  });

  it('resolves an external ES|QL dataset even though sampling (_search) is unsupported', async () => {
    // datasets are invisible to _resolve/index ...
    esClient.indices.resolveIndex.mockRejectedValue(
      new esErrors.ResponseError({ statusCode: 404 } as any)
    );
    // ... but discoverable via _query/dataset ...
    esClient.transport.request.mockResolvedValue({
      datasets: [
        { name: 'employees', data_source: 'local_minio', resource: 's3://my-bucket/*.csv' },
      ],
    });
    // ... with fields introspected via ES|QL ...
    esClient.esql.query.mockResolvedValue({
      columns: [{ name: 'first_name', type: 'keyword' }],
      values: [],
    });
    // ... and sampling via _search fails, which must NOT fail the whole resolution.
    esClient.search.mockRejectedValue(new esErrors.ResponseError({ statusCode: 404 } as any));

    const result = await resolveResourceForEsqlWithSamplingStats({
      resourceName: 'employees',
      esClient,
      includeDatasets: true,
    });

    expect(result.type).toBe(EsResourceType.dataset);
    expect(result.fields.map((f) => f.path)).toEqual(['first_name']);
  });

  it('does not resolve datasets when includeDatasets is not set', async () => {
    esClient.indices.resolveIndex.mockRejectedValue(
      new esErrors.ResponseError({ statusCode: 404 } as any)
    );
    esClient.transport.request.mockResolvedValue({
      datasets: [
        { name: 'employees', data_source: 'local_minio', resource: 's3://my-bucket/*.csv' },
      ],
    });

    await expect(
      resolveResourceForEsqlWithSamplingStats({ resourceName: 'employees', esClient })
    ).rejects.toThrow("No resource found for 'employees'");
    expect(esClient.transport.request).not.toHaveBeenCalled();
  });
});
