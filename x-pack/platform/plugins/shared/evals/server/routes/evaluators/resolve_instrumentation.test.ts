/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kibanaResponseFactory } from '@kbn/core/server';
import type { MockedVersionedRouter } from '@kbn/core-http-router-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { httpServiceMock } from '@kbn/core/server/mocks';
import {
  API_VERSIONS,
  EVALS_RESOLVE_INSTRUMENTATION_URL,
  type ResolveInstrumentationResponse,
} from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { EVALS_API_PRIVILEGES } from '../../../common';
import { createEvaluatorRegistryMock } from '../../evaluators/registry.mock';
import type { EvaluatorRegistry } from '../../evaluators/types';
import { registerResolveInstrumentationRoute } from './resolve_instrumentation';
import {
  buildClaudeCodeApiResponseDoc,
  buildClaudeCodeToolSpanDoc,
  buildClaudeCodeUserPromptDoc,
  buildSearchMock,
  hasTermFilter,
  withHits,
} from './test_helpers';

const ELASTIC_TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
const ATTR_TRACE_ID = '0af7651916cd43dd8448eb211c80319d';
const REDACTED_TRACE_ID = '0af7651916cd43dd8448eb211c80319e';
const ABSENT_TRACE_ID = '0af7651916cd43dd8448eb211c80319f';
const NO_TOOL_CALLS_TRACE_ID = '0af7651916cd43dd8448eb211c8031aa';
const CLAUDE_TRACE_ID = '0af7651916cd43dd8448eb211c8031ab';

const buildRouteSearchMock = () =>
  buildSearchMock(async ({ index, filters, traceId, emptySearchResponse }) => {
    if (!traceId || traceId === ABSENT_TRACE_ID) {
      return emptySearchResponse;
    }

    if (traceId === ELASTIC_TRACE_ID) {
      if (index === 'logs-*') {
        if (
          hasTermFilter(filters, 'event_name', 'user_prompt') ||
          hasTermFilter(filters, 'event_name', 'api_response_body') ||
          hasTermFilter(filters, 'event_name', 'gen_ai.user.message') ||
          hasTermFilter(filters, 'event_name', 'gen_ai.choice')
        ) {
          return emptySearchResponse;
        }
        return withHits([{ '@timestamp': '2026-07-10T10:00:00.000Z' }]);
      }

      if (index === 'traces-*') {
        if (hasTermFilter(filters, 'span.name', 'claude_code.tool')) {
          return emptySearchResponse;
        }
        if (hasTermFilter(filters, 'attributes.elastic.inference.span.kind', 'LLM')) {
          return withHits([
            {
              '@timestamp': '2026-07-10T10:00:00.000Z',
              attributes: {
                'gen_ai.input.messages': JSON.stringify([
                  {
                    role: 'user',
                    parts: [{ type: 'text', content: 'What is the current payment status?' }],
                  },
                ]),
                'gen_ai.output.messages': JSON.stringify([
                  {
                    role: 'assistant',
                    parts: [{ type: 'text', content: 'Payments are healthy.' }],
                  },
                ]),
              },
            },
          ]);
        }
        if (hasTermFilter(filters, 'attributes.elastic.inference.span.kind', 'TOOL')) {
          return withHits([
            {
              '@timestamp': '2026-07-10T10:00:00.500Z',
              'attributes.gen_ai.tool.call.id': 'call-1',
              'attributes.gen_ai.tool.name': 'health_check',
              'attributes.gen_ai.tool.call.arguments': '{"service":"payments"}',
              'attributes.gen_ai.tool.call.result': '{"status":"healthy"}',
            },
          ]);
        }
        // otel-genai-attributes empty filter / execute_tool: elastic LLM spans also match
        // empty message filters, but recommendation still picks elastic-inference first.
        if (hasTermFilter(filters, 'attributes.gen_ai.operation.name', 'execute_tool')) {
          return emptySearchResponse;
        }
        return withHits([
          {
            '@timestamp': '2026-07-10T10:00:00.000Z',
            attributes: {
              'gen_ai.input.messages': JSON.stringify([
                {
                  role: 'user',
                  parts: [{ type: 'text', content: 'What is the current payment status?' }],
                },
              ]),
              'gen_ai.output.messages': JSON.stringify([
                {
                  role: 'assistant',
                  parts: [{ type: 'text', content: 'Payments are healthy.' }],
                },
              ]),
            },
          },
        ]);
      }
    }

    if (traceId === NO_TOOL_CALLS_TRACE_ID) {
      if (index === 'logs-*') {
        if (
          hasTermFilter(filters, 'event_name', 'gen_ai.user.message') ||
          hasTermFilter(filters, 'event_name', 'gen_ai.choice') ||
          hasTermFilter(filters, 'event_name', 'user_prompt') ||
          hasTermFilter(filters, 'event_name', 'api_response_body')
        ) {
          return emptySearchResponse;
        }
        return withHits([{ '@timestamp': '2026-07-10T12:00:00.000Z' }]);
      }

      if (index === 'traces-*') {
        if (hasTermFilter(filters, 'attributes.elastic.inference.span.kind', 'TOOL')) {
          return emptySearchResponse;
        }
        if (hasTermFilter(filters, 'attributes.gen_ai.operation.name', 'execute_tool')) {
          return emptySearchResponse;
        }
        if (hasTermFilter(filters, 'span.name', 'claude_code.tool')) {
          return emptySearchResponse;
        }
        if (hasTermFilter(filters, 'attributes.elastic.inference.span.kind', 'LLM')) {
          return withHits([
            {
              '@timestamp': '2026-07-10T12:00:00.000Z',
              attributes: {
                'gen_ai.input.messages': JSON.stringify([
                  {
                    role: 'user',
                    parts: [{ type: 'text', content: 'Show me errors from checkout.' }],
                  },
                ]),
                'gen_ai.output.messages': JSON.stringify([
                  {
                    role: 'assistant',
                    parts: [
                      { type: 'text', content: 'There are 3 checkout errors in the last hour.' },
                    ],
                  },
                ]),
              },
            },
          ]);
        }
        return withHits([
          {
            '@timestamp': '2026-07-10T12:00:00.000Z',
            attributes: {
              'gen_ai.input.messages': JSON.stringify([
                {
                  role: 'user',
                  parts: [{ type: 'text', content: 'Show me errors from checkout.' }],
                },
              ]),
              'gen_ai.output.messages': JSON.stringify([
                {
                  role: 'assistant',
                  parts: [
                    { type: 'text', content: 'There are 3 checkout errors in the last hour.' },
                  ],
                },
              ]),
            },
          },
        ]);
      }
    }

    if (traceId === CLAUDE_TRACE_ID) {
      if (index === 'logs-*') {
        if (hasTermFilter(filters, 'event_name', 'user_prompt')) {
          return withHits([
            buildClaudeCodeUserPromptDoc({
              timestamp: '2026-07-10T12:10:00.000Z',
              prompt: 'Find failed checkout requests.',
            }),
          ]);
        }

        if (hasTermFilter(filters, 'event_name', 'api_response_body')) {
          return withHits([
            buildClaudeCodeApiResponseDoc({
              timestamp: '2026-07-10T12:10:01.000Z',
              content: [{ type: 'text', text: 'I found 14 failed checkout requests.' }],
            }),
          ]);
        }
        const hasAnyEventNameFilter = filters.some((filter) => {
          const termFilter = filter.term as Record<string, unknown> | undefined;
          return typeof termFilter?.event_name === 'string';
        });
        return hasAnyEventNameFilter
          ? emptySearchResponse
          : withHits([{ '@timestamp': '2026-07-10T12:10:00.000Z' }]);
      }

      if (index === 'traces-*') {
        if (hasTermFilter(filters, 'span.name', 'claude_code.tool')) {
          return withHits([
            buildClaudeCodeToolSpanDoc({
              timestamp: '2026-07-10T12:10:00.500Z',
              toolName: 'search_logs',
              toolInput: '[TOOL INPUT: search_logs]\n{"query":"service:checkout status:500"}',
              newContext: '[TOOL RESULT: search_logs]\n{"count":14}',
            }),
          ]);
        }

        return emptySearchResponse;
      }
    }

    if (traceId === ATTR_TRACE_ID && index === 'traces-*') {
      if (hasTermFilter(filters, 'attributes.elastic.inference.span.kind', 'LLM')) {
        return emptySearchResponse;
      }
      if (hasTermFilter(filters, 'attributes.elastic.inference.span.kind', 'TOOL')) {
        return emptySearchResponse;
      }
      if (hasTermFilter(filters, 'attributes.gen_ai.operation.name', 'execute_tool')) {
        return withHits([
          {
            '@timestamp': '2026-07-10T10:10:00.500Z',
            'attributes.gen_ai.tool.call.id': 'call-2',
            'attributes.gen_ai.tool.name': 'failure_summary',
            'attributes.gen_ai.tool.call.arguments': '{"window":"24h"}',
            'attributes.gen_ai.tool.call.result': '{"count":12}',
          },
        ]);
      }

      return withHits([
        {
          '@timestamp': '2026-07-10T10:10:00.000Z',
          'attributes.gen_ai.input.messages': JSON.stringify([
            {
              role: 'user',
              parts: [{ type: 'text', content: 'Summarize failures in last 24h.' }],
            },
          ]),
        },
        {
          '@timestamp': '2026-07-10T10:10:01.000Z',
          'attributes.gen_ai.output.messages': [
            {
              role: 'assistant',
              parts: [{ type: 'text', content: 'There were 12 failures in the last 24h.' }],
            },
          ],
        },
      ]);
    }

    if (traceId === REDACTED_TRACE_ID) {
      if (index === 'logs-*') {
        if (
          hasTermFilter(filters, 'event_name', 'gen_ai.user.message') ||
          hasTermFilter(filters, 'event_name', 'gen_ai.choice')
        ) {
          return withHits([{ '@timestamp': '2026-07-10T11:00:00.000Z' }]);
        }
        return withHits([{ '@timestamp': '2026-07-10T11:00:00.000Z' }]);
      }

      if (index === 'traces-*') {
        if (hasTermFilter(filters, 'attributes.elastic.inference.span.kind', 'LLM')) {
          return withHits([
            {
              '@timestamp': '2026-07-10T11:00:00.000Z',
              attributes: {
                'elastic.inference.span.kind': 'LLM',
              },
            },
          ]);
        }
        if (hasTermFilter(filters, 'attributes.elastic.inference.span.kind', 'TOOL')) {
          return withHits([{ '@timestamp': '2026-07-10T11:00:00.500Z' }]);
        }
        return withHits([{ '@timestamp': '2026-07-10T11:00:00.500Z' }]);
      }
    }

    return emptySearchResponse;
  });

describe('POST /internal/evals/traces/_resolve_instrumentation', () => {
  const evaluatorRegistry: EvaluatorRegistry = createEvaluatorRegistryMock();

  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    const versionedRouter = router.versioned as MockedVersionedRouter;

    registerResolveInstrumentationRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry,
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const route = versionedRouter.getRoute('post', EVALS_RESOLVE_INSTRUMENTATION_URL);
    const routeConfig = versionedRouter.post.mock.calls[0][0];
    const { handler } = route.versions[API_VERSIONS.internal.v1];

    return { handler, routeConfig };
  };

  const buildContext = (searchMock = buildRouteSearchMock()) =>
    ({
      core: Promise.resolve({
        elasticsearch: {
          client: {
            asInternalUser: {
              search: searchMock,
            },
          },
        },
      }),
    } as const);

  it('registers manage privilege authz requirement', () => {
    const { routeConfig } = setup();

    expect(routeConfig.security).toEqual({
      authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.manage] },
    });
  });

  it('recommends elastic-inference for elastic-convention traces', async () => {
    const { handler } = setup();

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: { trace_id: ELASTIC_TRACE_ID },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    const payload = response.payload as ResolveInstrumentationResponse;
    expect(payload.recommended_instrumentation).toEqual({ profile: 'elastic-inference' });
    expect(payload.profiles).toContainEqual(
      expect.objectContaining({
        profile: 'elastic-inference',
        evidence: expect.objectContaining({
          user_query: expect.objectContaining({ status: 'found' }),
          agent_response: expect.objectContaining({ status: 'found' }),
          tool_calls: expect.objectContaining({ status: 'found' }),
        }),
      })
    );
  });

  it('recommends otel-genai-attributes for span-attribute traces', async () => {
    const { handler } = setup();

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: { trace_id: ATTR_TRACE_ID },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    const payload = response.payload as ResolveInstrumentationResponse;
    expect(payload.recommended_instrumentation).toEqual({ profile: 'otel-genai-attributes' });
    expect(payload.profiles).toContainEqual(
      expect.objectContaining({
        profile: 'otel-genai-attributes',
        evidence: expect.objectContaining({
          user_query: expect.objectContaining({ status: 'found' }),
          agent_response: expect.objectContaining({ status: 'found' }),
          tool_calls: expect.objectContaining({ status: 'found' }),
        }),
      })
    );
  });

  it('returns content_redacted statuses with no recommended mapping for redacted traces', async () => {
    const { handler } = setup();

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: { trace_id: REDACTED_TRACE_ID },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    const payload = response.payload as ResolveInstrumentationResponse;
    expect(payload.recommended_instrumentation).toBeNull();
    expect(payload.profiles).toContainEqual(
      expect.objectContaining({
        profile: 'elastic-inference',
        evidence: {
          user_query: expect.objectContaining({ status: 'content_redacted' }),
          agent_response: expect.objectContaining({ status: 'content_redacted' }),
          tool_calls: expect.objectContaining({ status: 'content_redacted' }),
        },
      })
    );
  });

  it('recommends mapping when user and response are found but tool_calls are not found', async () => {
    const { handler } = setup();

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: { trace_id: NO_TOOL_CALLS_TRACE_ID },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    const payload = response.payload as ResolveInstrumentationResponse;
    expect(payload.recommended_instrumentation).toEqual({ profile: 'elastic-inference' });
    expect(payload.profiles).toContainEqual(
      expect.objectContaining({
        profile: 'elastic-inference',
        evidence: expect.objectContaining({
          user_query: expect.objectContaining({ status: 'found' }),
          agent_response: expect.objectContaining({ status: 'found' }),
          tool_calls: expect.objectContaining({ status: 'not_found' }),
        }),
      })
    );
  });

  it('recommends claude-code when claude telemetry fields are present', async () => {
    const { handler } = setup();

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: { trace_id: CLAUDE_TRACE_ID },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    const payload = response.payload as ResolveInstrumentationResponse;
    expect(payload.recommended_instrumentation).toEqual({ profile: 'claude-code' });
    expect(payload.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profile: 'claude-code',
          evidence: expect.objectContaining({
            user_query: expect.objectContaining({ status: 'found' }),
            agent_response: expect.objectContaining({ status: 'found' }),
            tool_calls: expect.objectContaining({ status: 'found' }),
          }),
        }),
        expect.objectContaining({
          profile: 'elastic-inference',
          evidence: expect.objectContaining({
            user_query: expect.objectContaining({ status: 'not_found' }),
            agent_response: expect.objectContaining({ status: 'not_found' }),
            tool_calls: expect.objectContaining({ status: 'not_found' }),
          }),
        }),
        expect.objectContaining({
          profile: 'otel-genai-events',
          evidence: expect.objectContaining({
            user_query: expect.objectContaining({ status: 'not_found' }),
            agent_response: expect.objectContaining({ status: 'not_found' }),
            tool_calls: expect.objectContaining({ status: 'not_found' }),
          }),
        }),
        expect.objectContaining({
          profile: 'otel-genai-attributes',
          evidence: expect.objectContaining({
            user_query: expect.objectContaining({ status: 'not_found' }),
            agent_response: expect.objectContaining({ status: 'not_found' }),
            tool_calls: expect.objectContaining({ status: 'not_found' }),
          }),
        }),
      ])
    );
  });

  it('does not recommend claude-code for elastic-inference traces', async () => {
    const { handler } = setup();

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: { trace_id: ELASTIC_TRACE_ID },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    const payload = response.payload as ResolveInstrumentationResponse;
    expect(payload.recommended_instrumentation).toEqual({ profile: 'elastic-inference' });
    expect(
      payload.profiles.find(({ profile }) => profile === 'claude-code')?.evidence
    ).toMatchObject({
      user_query: { status: 'not_found' },
      agent_response: { status: 'not_found' },
      tool_calls: { status: 'not_found' },
    });
  });

  it('returns 404 when the trace has no indexed logs or spans', async () => {
    const { handler } = setup();

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: { trace_id: ABSENT_TRACE_ID },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(404);
    expect(response.payload).toEqual({
      message: `Trace ${ABSENT_TRACE_ID} is not ready: no documents indexed in traces-* or logs-* yet`,
    });
  });
});
