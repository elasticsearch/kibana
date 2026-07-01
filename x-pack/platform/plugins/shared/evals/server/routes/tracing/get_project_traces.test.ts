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
import {
  EVALS_TRACING_PROJECT_TRACES_URL,
  API_VERSIONS,
  TRACES_INDEX_PATTERN,
} from '@kbn/evals-common';
import type { EncryptedSavedObjectsPluginStart } from '@kbn/encrypted-saved-objects-plugin/server';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { registerGetProjectTracesRoute } from './get_project_traces';

const emptySpanCountResponse = {
  aggregations: { per_trace: { buckets: [] } },
} as any;

const emptyChildEnrichResponse = { aggregations: { per_trace: { buckets: [] } } } as any;

describe('GET /internal/evals/tracing/projects/{projectName}/traces', () => {
  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    registerGetProjectTracesRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: { list: () => [], get: () => undefined },
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => ({} as EncryptedSavedObjectsPluginStart),
      getInternalRemoteConfigsSoClient: async () => ({} as SavedObjectsClientContract),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const { handler } = versionedRouter.getRoute('get', EVALS_TRACING_PROJECT_TRACES_URL).versions[
      API_VERSIONS.internal.v1
    ];

    const mockCoreContext = coreMock.createRequestHandlerContext();
    const context = coreMock.createCustomRequestHandlerContext({ core: mockCoreContext });
    const esClient = mockCoreContext.elasticsearch.client.asCurrentUser;

    return { handler, context, esClient, logger };
  };

  const makeRequest = ({
    projectName = 'my-project',
    query = {},
  }: { projectName?: string; query?: Record<string, unknown> } = {}) =>
    httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_TRACING_PROJECT_TRACES_URL.replace('{projectName}', projectName),
      params: { projectName },
      query: { page: 1, per_page: 25, sort_field: 'start_time', sort_order: 'desc', ...query },
    });

  it('queries traces-* index with root span filter and project name', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      hits: { hits: [], total: { value: 0 } },
    } as any);

    await handler(context, makeRequest(), kibanaResponseFactory);

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: TRACES_INDEX_PATTERN,
        track_total_hits: true,
      })
    );

    const searchCall = esClient.search.mock.calls[0][0] as any;
    expect(searchCall.query.bool.must_not).toEqual([
      { exists: { field: 'parent_span_id' } },
      { exists: { field: 'attributes.evaluator.name' } },
    ]);
    expect(searchCall.query.bool.filter).toEqual(
      expect.arrayContaining([
        { term: { name: 'my-project' } },
        { terms: { 'scope.name': ['@kbn/evals', 'inference'] } },
      ])
    );
  });

  it('applies time range filter when from/to provided', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      hits: { hits: [], total: { value: 0 } },
    } as any);

    await handler(
      context,
      makeRequest({ query: { from: '2025-01-01T00:00:00Z', to: '2025-06-01T00:00:00Z' } }),
      kibanaResponseFactory
    );

    const searchCall = esClient.search.mock.calls[0][0] as any;
    expect(searchCall.query.bool.filter).toEqual(
      expect.arrayContaining([
        { range: { '@timestamp': { gte: '2025-01-01T00:00:00Z', lte: '2025-06-01T00:00:00Z' } } },
      ])
    );
  });

  it('applies name filter as wildcard on input/output/prompt attributes', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      hits: { hits: [], total: { value: 0 } },
    } as any);

    await handler(context, makeRequest({ query: { name: 'test-search' } }), kibanaResponseFactory);

    const searchCall = esClient.search.mock.calls[0][0] as any;
    const boolFilter = searchCall.query.bool.filter.find(
      (f: Record<string, unknown>) => f.bool !== undefined
    );
    expect(boolFilter).toBeDefined();
    expect(boolFilter.bool.should).toEqual([
      {
        wildcard: {
          'attributes.input.value': { value: '*test-search*', case_insensitive: true },
        },
      },
      {
        wildcard: {
          'attributes.output.value': { value: '*test-search*', case_insensitive: true },
        },
      },
      {
        wildcard: {
          'attributes.gen_ai.prompt.id': { value: '*test-search*', case_insensitive: true },
        },
      },
    ]);
    expect(boolFilter.bool.minimum_should_match).toBe(1);
  });

  it('escapes wildcard metacharacters in the name filter', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      hits: { hits: [], total: { value: 0 } },
    } as any);

    await handler(
      context,
      makeRequest({ query: { name: 'foo*bar?baz\\qux' } }),
      kibanaResponseFactory
    );

    const searchCall = esClient.search.mock.calls[0][0] as any;
    const boolFilter = searchCall.query.bool.filter.find(
      (f: Record<string, unknown>) => f.bool !== undefined
    );
    const expectedValue = '*foo\\*bar\\?baz\\\\qux*';
    for (const clause of boolFilter.bool.should) {
      const [wildcardBody] = Object.values(clause.wildcard) as Array<{ value: string }>;
      expect(wildcardBody.value).toBe(expectedValue);
    }
  });

  it('does not add name filter when name is not provided', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      hits: { hits: [], total: { value: 0 } },
    } as any);

    await handler(context, makeRequest(), kibanaResponseFactory);

    const searchCall = esClient.search.mock.calls[0][0] as any;
    const boolFilter = searchCall.query.bool.filter.find(
      (f: Record<string, unknown>) => f.bool !== undefined
    );
    expect(boolFilter).toBeUndefined();
  });

  it('maps sort_field to correct ES field', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      hits: { hits: [], total: { value: 0 } },
    } as any);

    await handler(
      context,
      makeRequest({ query: { sort_field: 'duration', sort_order: 'asc' } }),
      kibanaResponseFactory
    );

    const searchCall = esClient.search.mock.calls[0][0] as any;
    expect(searchCall.sort).toEqual([{ duration: { order: 'asc' } }]);
  });

  it('returns parsed traces with correct field mappings', async () => {
    const { handler, context, esClient } = setup();

    esClient.search
      .mockResolvedValueOnce({
        hits: {
          total: { value: 1, relation: 'eq' },
          hits: [
            {
              _id: 'hit-1',
              _source: {
                trace_id: 'trace-abc',
                name: 'my-project',
                '@timestamp': '2025-06-01T12:00:00Z',
                duration: 5_000_000_000,
                status: { code: 'OK' },
                attributes: {
                  'input.value': 'Hello world',
                  'output.value': 'Response text',
                },
              },
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        aggregations: {
          per_trace: {
            buckets: [
              {
                key: 'trace-abc',
                doc_count: 5,
                input_tokens: { value: 100 },
                output_tokens: { value: 200 },
              },
            ],
          },
        },
      } as any)
      .mockResolvedValueOnce(emptyChildEnrichResponse);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.total).toBe(1);
    expect(response.payload.traces).toHaveLength(1);

    const trace = response.payload.traces[0];
    expect(trace.trace_id).toBe('trace-abc');
    expect(trace.name).toBe('my-project');
    expect(trace.start_time).toBe('2025-06-01T12:00:00Z');
    expect(trace.duration_ms).toBe(5000);
    expect(trace.status).toBe('OK');
    expect(trace.total_spans).toBe(5);
    expect(trace.input_preview).toBe('Hello world');
    expect(trace.output_preview).toBe('Response text');
    expect(trace.tokens).toEqual({ input: 100, output: 200, total: 300 });
  });

  it('converts duration from nanoseconds to milliseconds', async () => {
    const { handler, context, esClient } = setup();
    esClient.search
      .mockResolvedValueOnce({
        hits: {
          total: { value: 1, relation: 'eq' },
          hits: [
            {
              _id: 'hit-1',
              _source: {
                trace_id: 'trace-1',
                name: 'my-project',
                '@timestamp': '2025-06-01T00:00:00Z',
                duration: 1_500_000,
              },
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce(emptySpanCountResponse)
      .mockResolvedValueOnce(emptyChildEnrichResponse);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.payload.traces[0].duration_ms).toBe(1.5);
  });

  it('enriches traces with child span data (prompt_id, model)', async () => {
    const { handler, context, esClient } = setup();
    esClient.search
      .mockResolvedValueOnce({
        hits: {
          total: { value: 1, relation: 'eq' },
          hits: [
            {
              _id: 'hit-1',
              _source: {
                trace_id: 'trace-xyz',
                name: 'my-project',
                '@timestamp': '2025-06-01T00:00:00Z',
                duration: 1_000_000_000,
              },
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce(emptySpanCountResponse)
      .mockResolvedValueOnce({
        aggregations: {
          per_trace: {
            buckets: [
              {
                key: 'trace-xyz',
                earliest_hit: {
                  hits: {
                    hits: [
                      {
                        _source: {
                          trace_id: 'trace-xyz',
                          attributes: {
                            'gen_ai.prompt.id': 'alert-summarization',
                            'gen_ai.request.model': 'gpt-4',
                            'input.value': 'Some input',
                            'output.value': 'Some output',
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    const trace = response.payload.traces[0];
    expect(trace.prompt_id).toBe('alert-summarization');
    expect(trace.model).toBe('gpt-4');
    expect(trace.input_preview).toBe('Some input');
    expect(trace.output_preview).toBe('Some output');
  });

  it('returns empty traces when no root spans match', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      hits: { hits: [], total: { value: 0 } },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.traces).toEqual([]);
    expect(response.payload.total).toBe(0);
  });

  it('skips enrichment queries when no trace IDs found', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      hits: { hits: [], total: { value: 0 } },
    } as any);

    await handler(context, makeRequest(), kibanaResponseFactory);

    expect(esClient.search).toHaveBeenCalledTimes(1);
  });

  it('handles total as number (legacy ES format)', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      hits: { hits: [], total: 42 },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.payload.total).toBe(42);
  });

  it('handles pagination offset correctly', async () => {
    const { handler, context, esClient } = setup();
    esClient.search.mockResolvedValueOnce({
      hits: { hits: [], total: { value: 100 } },
    } as any);

    await handler(
      context,
      makeRequest({ query: { page: 3, per_page: 10 } }),
      kibanaResponseFactory
    );

    const searchCall = esClient.search.mock.calls[0][0] as any;
    expect(searchCall.from).toBe(20);
    expect(searchCall.size).toBe(10);
  });

  it('returns 500 when ES throws', async () => {
    const { handler, context, esClient, logger } = setup();
    esClient.search.mockRejectedValueOnce(new Error('ES connection failed'));

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(response.payload).toEqual({ message: 'Failed to get project traces' });
    expect(logger.error).toHaveBeenCalled();
  });
});
