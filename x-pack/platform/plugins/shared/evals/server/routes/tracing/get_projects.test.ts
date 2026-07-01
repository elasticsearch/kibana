/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kibanaResponseFactory } from '@kbn/core/server';
import { coreMock, httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { MockedVersionedRouter } from '@kbn/core-http-router-server-mocks';
import { EVALS_TRACING_PROJECTS_URL, API_VERSIONS, TRACES_INDEX_PATTERN } from '@kbn/evals-common';
import type { EncryptedSavedObjectsPluginStart } from '@kbn/encrypted-saved-objects-plugin/server';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { registerGetTracingProjectsRoute } from './get_projects';

const buildProjectBucket = ({
  name,
  docCount = 10,
  distinctTraces = 5,
  lastTrace = '2025-06-01T12:00:00Z',
  p50 = 500_000_000,
  p99 = 2_000_000_000,
  traceIds = [] as string[],
  errorDocCount = 1,
  distinctErrorTraces = 1,
}: {
  name: string;
  docCount?: number;
  distinctTraces?: number;
  lastTrace?: string;
  p50?: number;
  p99?: number;
  traceIds?: string[];
  errorDocCount?: number;
  distinctErrorTraces?: number;
}) => ({
  key: name,
  doc_count: docCount,
  distinct_traces: { value: distinctTraces },
  last_trace: { value_as_string: lastTrace },
  latency_percentiles: { values: { '50.0': p50, '99.0': p99 } },
  trace_ids: { buckets: traceIds.map((id) => ({ key: id, doc_count: 1 })) },
  error_count: { doc_count: errorDocCount, distinct_traces: { value: distinctErrorTraces } },
});

const buildTokenResponse = (
  traceTokens: Array<{ traceId: string; input: number; output: number }>
) => ({
  aggregations: {
    per_trace: {
      buckets: traceTokens.map(({ traceId, input, output }) => ({
        key: traceId,
        input_tokens: { value: input },
        output_tokens: { value: output },
      })),
    },
  },
});

describe('GET /internal/evals/tracing/projects', () => {
  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    registerGetTracingProjectsRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: { list: () => [], get: () => undefined },
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => ({} as EncryptedSavedObjectsPluginStart),
      getInternalRemoteConfigsSoClient: async () => ({} as SavedObjectsClientContract),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const { handler } = versionedRouter.getRoute('get', EVALS_TRACING_PROJECTS_URL).versions[
      API_VERSIONS.internal.v1
    ];

    const mockCoreContext = coreMock.createRequestHandlerContext();
    const context = coreMock.createCustomRequestHandlerContext({ core: mockCoreContext });
    const esClient = mockCoreContext.elasticsearch.client.asCurrentUser;

    return { handler, context, esClient, logger };
  };

  const makeRequest = (query: Record<string, unknown> = {}) =>
    httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_TRACING_PROJECTS_URL,
      query: { page: 1, per_page: 25, ...query },
    });

  it('queries traces-* index with size 0 and aggregations', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 0 },
        projects: { buckets: [] },
      },
    } as any);

    await handler(context, makeRequest(), kibanaResponseFactory);

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: TRACES_INDEX_PATTERN,
        size: 0,
      })
    );
  });

  it('filters root spans only (must_not parent_span_id and evaluator.name)', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 0 },
        projects: { buckets: [] },
      },
    } as any);

    await handler(context, makeRequest(), kibanaResponseFactory);

    const searchCall = esClient.search.mock.calls[0][0] as any;
    expect(searchCall.query.bool.must_not).toEqual([
      { exists: { field: 'parent_span_id' } },
      { exists: { field: 'attributes.evaluator.name' } },
    ]);
  });

  it('applies time range filter when from/to provided', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 0 },
        projects: { buckets: [] },
      },
    } as any);

    await handler(
      context,
      makeRequest({ from: '2025-01-01T00:00:00Z', to: '2025-06-01T00:00:00Z' }),
      kibanaResponseFactory
    );

    const searchCall = esClient.search.mock.calls[0][0] as any;
    const filters = searchCall.query.bool.filter;
    expect(filters).toEqual(
      expect.arrayContaining([
        { range: { '@timestamp': { gte: '2025-01-01T00:00:00Z', lte: '2025-06-01T00:00:00Z' } } },
      ])
    );
  });

  it('applies name filter as wildcard on name field when provided', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 0 },
        projects: { buckets: [] },
      },
    } as any);

    await handler(context, makeRequest({ name: 'alert' }), kibanaResponseFactory);

    const searchCall = esClient.search.mock.calls[0][0] as any;
    const filters = searchCall.query.bool.filter;
    expect(filters).toEqual(
      expect.arrayContaining([{ wildcard: { name: { value: '*alert*', case_insensitive: true } } }])
    );
  });

  it('escapes wildcard metacharacters in the name filter', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 0 },
        projects: { buckets: [] },
      },
    } as any);

    await handler(context, makeRequest({ name: 'my*project?' }), kibanaResponseFactory);

    const searchCall = esClient.search.mock.calls[0][0] as any;
    const wildcardFilter = searchCall.query.bool.filter.find(
      (f: Record<string, unknown>) => f.wildcard !== undefined
    );
    expect(wildcardFilter).toEqual({
      wildcard: { name: { value: '*my\\*project\\?*', case_insensitive: true } },
    });
  });

  it('does not add name filter when name is not provided', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 0 },
        projects: { buckets: [] },
      },
    } as any);

    await handler(context, makeRequest(), kibanaResponseFactory);

    const searchCall = esClient.search.mock.calls[0][0] as any;
    const wildcardFilter = searchCall.query.bool.filter.find(
      (f: Record<string, unknown>) => f.wildcard !== undefined
    );
    expect(wildcardFilter).toBeUndefined();
  });

  it('returns parsed projects with correct field mappings', async () => {
    const { handler, context, esClient } = setup();
    const traceIds = ['trace-1', 'trace-2'];

    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 1 },
        projects: {
          buckets: [
            buildProjectBucket({
              name: 'alert-summarization',
              distinctTraces: 42,
              lastTrace: '2025-06-15T10:30:00Z',
              p50: 500_000_000,
              p99: 3_000_000_000,
              traceIds,
              errorDocCount: 2,
              distinctErrorTraces: 2,
            }),
          ],
        },
      },
    } as any);

    esClient.search.mockResolvedValueOnce(
      buildTokenResponse([
        { traceId: 'trace-1', input: 3000, output: 1500 },
        { traceId: 'trace-2', input: 2000, output: 1500 },
      ]) as any
    );

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.total).toBe(1);
    expect(response.payload.projects).toHaveLength(1);

    const project = response.payload.projects[0];
    expect(project.name).toBe('alert-summarization');
    expect(project.trace_count).toBe(42);
    expect(project.last_trace_time).toBe('2025-06-15T10:30:00Z');
    expect(project.p50_latency_ms).toBe(500);
    expect(project.p99_latency_ms).toBe(3000);
    expect(project.total_tokens).toBe(8000);
    expect(project.error_rate).toBeCloseTo(2 / 42, 2);
  });

  it('fetches tokens from all spans via second query, not just root spans', async () => {
    const { handler, context, esClient } = setup();
    const traceIds = ['trace-abc'];

    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 1 },
        projects: {
          buckets: [buildProjectBucket({ name: 'my-project', traceIds })],
        },
      },
    } as any);

    esClient.search.mockResolvedValueOnce(
      buildTokenResponse([{ traceId: 'trace-abc', input: 500, output: 300 }]) as any
    );

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(esClient.search).toHaveBeenCalledTimes(2);
    const tokenQuery = esClient.search.mock.calls[1][0] as any;
    expect(tokenQuery.query).toEqual({ terms: { trace_id: ['trace-abc'] } });
    expect(response.payload.projects[0].total_tokens).toBe(800);
  });

  it('paginates aggregation buckets correctly', async () => {
    const { handler, context, esClient } = setup();
    const buckets = Array.from({ length: 30 }, (_, i) =>
      buildProjectBucket({ name: `project-${i}` })
    );
    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 30 },
        projects: { buckets },
      },
    } as any);

    const response = await handler(
      context,
      makeRequest({ page: 2, per_page: 10 }),
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    expect(response.payload.total).toBe(30);
    expect(response.payload.projects).toHaveLength(10);
    expect(response.payload.projects[0].name).toBe('project-10');
    expect(response.payload.projects[9].name).toBe('project-19');
  });

  it('returns empty projects when no aggregation buckets', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 0 },
        projects: { buckets: [] },
      },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.total).toBe(0);
    expect(response.payload.projects).toEqual([]);
  });

  it('handles zero doc_count without dividing by zero for error_rate', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 1 },
        projects: {
          buckets: [
            buildProjectBucket({
              name: 'empty-project',
              distinctTraces: 0,
              distinctErrorTraces: 0,
            }),
          ],
        },
      },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.projects[0].error_rate).toBe(0);
  });

  it('converts latency from nanoseconds to milliseconds', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      aggregations: {
        project_count: { value: 1 },
        projects: {
          buckets: [
            buildProjectBucket({
              name: 'latency-test',
              p50: 1_500_000_000,
              p99: 10_000_000_000,
            }),
          ],
        },
      },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.payload.projects[0].p50_latency_ms).toBe(1500);
    expect(response.payload.projects[0].p99_latency_ms).toBe(10000);
  });

  it('returns 500 when ES throws', async () => {
    const { handler, context, esClient, logger } = setup();
    esClient.search.mockRejectedValueOnce(new Error('ES connection failed'));

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(response.payload).toEqual({ message: 'Failed to get tracing projects' });
    expect(logger.error).toHaveBeenCalled();
  });
});
