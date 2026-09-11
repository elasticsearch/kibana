/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kibanaResponseFactory, type ElasticsearchClient } from '@kbn/core/server';
import type { MockedVersionedRouter } from '@kbn/core-http-router-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { httpServiceMock } from '@kbn/core/server/mocks';
import {
  createRootWithCorePlugins,
  createTestServers,
  type TestElasticsearchUtils,
} from '@kbn/core-test-helpers-kbn-server';
import {
  API_VERSIONS,
  EVALS_EVALUATE_URL,
  EVALS_RESOLVE_INSTRUMENTATION_URL,
  EVALS_TRACE_EVIDENCE_URL,
  EVALS_VALIDATE_URL,
  type GetTraceEvidenceResponse,
  type ResolveInstrumentationResponse,
  type ValidateResponse,
  type EvaluateResponse,
} from '@kbn/evals-common';
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { createEvaluatorRegistry } from '../evaluators/registry';
import { normalizeEvidence } from '../evaluators/evidence/evidence_service';
import { getInstrumentationProfile } from '../evaluators/evidence/resolve_instrumentation';
import type { GroundednessAnalysis } from '../evaluators/groundedness/types';
import { createTraceAccessor } from '../evaluators/trace_accessor';
import { awaitTraceReady } from '../evaluators/trace_readiness';
import { registerEvaluateRoute } from '../routes/evaluators/evaluate';
import { registerResolveInstrumentationRoute } from '../routes/evaluators/resolve_instrumentation';
import { registerValidateRoute } from '../routes/evaluators/validate';
import { registerGetTraceEvidenceRoute } from '../routes/traces/get_trace_evidence';

const logger = loggingSystemMock.createLogger();
const LOGS_INDEX = 'logs-evals-evidence-reconstruction-it';
const LOGS_BACKING_INDEX = 'evals-logs-evidence-reconstruction-it';
const TRACES_INDEX = 'traces-evals-evidence-reconstruction-it';

const ELASTIC_CONVENTION_TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTEL_EVENTS_TRACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTEL_ATTRIBUTES_TRACE_ID = 'cccccccccccccccccccccccccccccccc';
const CLAUDE_CODE_TRACE_ID = 'dddddddddddddddddddddddddddddddd';

const groundednessJudgeResponse: GroundednessAnalysis = {
  summary_verdict: 'GROUNDED',
  analysis: [
    {
      claim: 'The service is healthy.',
      centrality: 'central',
      centrality_reason: 'Directly answers the user question.',
      verdict: 'FULLY_SUPPORTED',
      evidence: {
        tool_call_id: 'call-1',
        tool_id: 'health_check',
        evidence_snippet: '{"status":"healthy"}',
      },
      explanation: 'Tool output supports the claim.',
    },
  ],
};

const cleanupEvidenceIndices = async (esClient: ElasticsearchClient) => {
  await esClient.indices
    .deleteAlias({
      index: LOGS_BACKING_INDEX,
      name: LOGS_INDEX,
    })
    .catch(() => {});
  await esClient.indices
    .delete({
      index: [LOGS_INDEX, TRACES_INDEX, LOGS_BACKING_INDEX],
      ignore_unavailable: true,
    })
    .catch(() => {});
};

const createEvidenceIndices = async (esClient: ElasticsearchClient) => {
  await esClient.indices.create({
    index: LOGS_BACKING_INDEX,
    mappings: {
      dynamic: true,
      dynamic_templates: [
        {
          strings_as_keywords: {
            match_mapping_type: 'string',
            mapping: { type: 'keyword' },
          },
        },
      ],
      properties: {
        '@timestamp': { type: 'date' },
      },
    },
  });
  await esClient.indices.putAlias({
    index: LOGS_BACKING_INDEX,
    name: LOGS_INDEX,
  });

  await esClient.indices.create({
    index: TRACES_INDEX,
    mappings: {
      dynamic: true,
      dynamic_templates: [
        {
          strings_as_keywords: {
            match_mapping_type: 'string',
            mapping: { type: 'keyword' },
          },
        },
      ],
      properties: {
        '@timestamp': { type: 'date' },
      },
    },
  });
};

const indexFixtures = async (esClient: ElasticsearchClient) => {
  const logsDocuments = [
    {
      trace_id: OTEL_EVENTS_TRACE_ID,
      event_name: 'gen_ai.user.message',
      '@timestamp': '2026-07-10T09:01:00.000Z',
      body: { structured: { content: 'Summarize checkout errors.' } },
    },
    {
      trace_id: OTEL_EVENTS_TRACE_ID,
      event_name: 'gen_ai.choice',
      '@timestamp': '2026-07-10T09:01:02.000Z',
      body: {
        structured: { message: { content: 'There were 5 checkout errors in the last hour.' } },
      },
    },
    {
      trace_id: CLAUDE_CODE_TRACE_ID,
      event_name: 'user_prompt',
      '@timestamp': '2026-07-10T09:03:00.000Z',
      attributes: { prompt: 'Summarize workflow run status.' },
    },
    {
      trace_id: CLAUDE_CODE_TRACE_ID,
      event_name: 'api_response_body',
      '@timestamp': '2026-07-10T09:03:01.000Z',
      attributes: {
        body: JSON.stringify({
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_01', name: 'GetWorkflowRuns', input: {} }],
        }),
      },
    },
    {
      trace_id: CLAUDE_CODE_TRACE_ID,
      event_name: 'tool',
      '@timestamp': '2026-07-10T09:03:02.000Z',
      attributes: {
        tool_name: 'GetWorkflowRuns',
        tool_input_schema: '{"type":"object","properties":{"status":{"type":"string"}}}',
      },
    },
    {
      trace_id: CLAUDE_CODE_TRACE_ID,
      event_name: 'api_response_body',
      '@timestamp': '2026-07-10T09:03:03.000Z',
      attributes: {
        body: JSON.stringify({
          role: 'assistant',
          content: [
            { type: 'text', text: 'Workflow run summary:' },
            { type: 'text', text: '2 succeeded, 1 failed.' },
          ],
        }),
      },
    },
  ];

  const traceDocuments = [
    {
      'trace.id': ELASTIC_CONVENTION_TRACE_ID,
      '@timestamp': '2026-07-10T09:00:00.000Z',
      attributes: {
        'elastic.inference.span.kind': 'LLM',
        'gen_ai.input.messages': JSON.stringify([
          {
            role: 'user',
            parts: [{ type: 'text', content: 'What is the payment status?' }],
          },
        ]),
        'gen_ai.output.messages': JSON.stringify([
          {
            role: 'assistant',
            parts: [{ type: 'text', content: 'The payment service is healthy.' }],
          },
        ]),
      },
    },
    {
      // Real ES `_source` shape: nested `attributes` object with dotted keys.
      'trace.id': ELASTIC_CONVENTION_TRACE_ID,
      '@timestamp': '2026-07-10T09:00:00.500Z',
      attributes: {
        'elastic.inference.span.kind': 'TOOL',
        'gen_ai.tool.name': 'health_check',
        'gen_ai.tool.call.id': 'call-1',
        'gen_ai.tool.call.arguments': '{"service":"payments"}',
        'gen_ai.tool.call.result': '{"status":"healthy"}',
      },
    },
    {
      // Fully-nested attributes object, to prove nested paths still resolve.
      trace: { id: ELASTIC_CONVENTION_TRACE_ID },
      '@timestamp': '2026-07-10T09:00:00.600Z',
      attributes: {
        elastic: { inference: { span: { kind: 'TOOL' } } },
        gen_ai: {
          tool: {
            name: 'health_check',
            call: {
              id: 'call-1b',
              arguments: '{"service":"payments"}',
              result: '{"status":"healthy"}',
            },
          },
        },
      },
    },
    {
      'trace.id': OTEL_EVENTS_TRACE_ID,
      '@timestamp': '2026-07-10T09:01:00.500Z',
      attributes: {
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': 'checkout_errors',
        'gen_ai.tool.call.id': 'call-2',
        'gen_ai.tool.call.arguments': '{"window":"1h"}',
        'gen_ai.tool.call.result': '{"count":5}',
      },
    },
    {
      'trace.id': OTEL_ATTRIBUTES_TRACE_ID,
      '@timestamp': '2026-07-10T09:02:00.000Z',
      attributes: {
        'gen_ai.input.messages': JSON.stringify([
          {
            role: 'user',
            parts: [{ type: 'text', content: 'How many deploy failures happened today?' }],
          },
        ]),
      },
    },
    {
      'trace.id': OTEL_ATTRIBUTES_TRACE_ID,
      '@timestamp': '2026-07-10T09:02:01.000Z',
      attributes: {
        'gen_ai.output.messages': JSON.stringify([
          {
            role: 'assistant',
            parts: [{ type: 'text', content: 'There were 3 deploy failures today.' }],
          },
        ]),
      },
    },
    {
      'trace.id': OTEL_ATTRIBUTES_TRACE_ID,
      '@timestamp': '2026-07-10T09:02:00.500Z',
      attributes: {
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': 'deploy_failures',
        'gen_ai.tool.call.id': 'call-3',
        'gen_ai.tool.call.arguments': '{"window":"24h"}',
        'gen_ai.tool.call.result': '{"count":3}',
      },
    },
    {
      'trace.id': CLAUDE_CODE_TRACE_ID,
      'span.name': 'claude_code.tool',
      name: 'claude_code.tool',
      span_id: 'span-claude-tool-root',
      parent_span_id: 'span-claude-agent',
      '@timestamp': '2026-07-10T09:03:01.500Z',
      attributes: {
        tool_name: 'GetWorkflowRuns',
        tool_input: '[TOOL INPUT: GetWorkflowRuns]\n{"status":"all"}',
        new_context: '[TOOL RESULT: GetWorkflowRuns]\n{"runs":{"success":2,"failed":1}}',
      },
    },
    {
      'trace.id': CLAUDE_CODE_TRACE_ID,
      'span.name': 'claude_code.tool.execution',
      name: 'claude_code.tool.execution',
      span_id: 'span-claude-tool-root-child',
      parent_span_id: 'span-claude-tool-root',
      '@timestamp': '2026-07-10T09:03:01.700Z',
      attributes: {
        tool_name: 'GetWorkflowRuns',
      },
    },
    {
      'trace.id': CLAUDE_CODE_TRACE_ID,
      'span.name': 'claude_code.tool',
      name: 'claude_code.tool',
      span_id: 'span-claude-tool-subagent',
      parent_span_id: 'span-claude-subagent',
      '@timestamp': '2026-07-10T09:03:02.500Z',
      attributes: {
        tool_name: 'SummarizeRuns',
        tool_input: '[TOOL INPUT: SummarizeRuns]\n{"format":"brief"}',
        new_context: '[TOOL RESULT: SummarizeRuns]\nSummary unavailable due to timeout',
      },
    },
    {
      'trace.id': CLAUDE_CODE_TRACE_ID,
      'span.name': 'claude_code.tool.execution',
      name: 'claude_code.tool.execution',
      span_id: 'span-claude-tool-subagent-child',
      parent_span_id: 'span-claude-tool-subagent',
      '@timestamp': '2026-07-10T09:03:02.700Z',
      attributes: {
        tool_name: 'SummarizeRuns',
      },
    },
  ];

  await Promise.all(
    logsDocuments.map((document, index) =>
      esClient.index({
        index: LOGS_BACKING_INDEX,
        id: `log-${index}`,
        document,
      })
    )
  );
  await Promise.all(
    traceDocuments.map((document, index) =>
      esClient.index({
        index: TRACES_INDEX,
        id: `trace-${index}`,
        document,
      })
    )
  );

  await esClient.indices.refresh({ index: [LOGS_INDEX, TRACES_INDEX] });
};

describe('trace evidence reconstruction integration', () => {
  jest.setTimeout(180000);

  let manageES: TestElasticsearchUtils;
  let root: ReturnType<typeof createRootWithCorePlugins>;
  let esClient: ElasticsearchClient;

  const setupRoutes = () => {
    const router = httpServiceMock.createRouter();
    const versionedRouter = router.versioned as MockedVersionedRouter;
    const prompt = jest.fn().mockResolvedValue({
      toolCalls: [{ function: { arguments: groundednessJudgeResponse } }],
    });
    const inferenceStart: InferenceServerStart = {
      getClient: jest.fn().mockReturnValue({ prompt } as unknown as BoundInferenceClient),
    } as unknown as InferenceServerStart;

    const routeDependencies = {
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: createEvaluatorRegistry(),
      getInferenceStart: async () => inferenceStart,
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    };

    registerResolveInstrumentationRoute(routeDependencies);
    registerValidateRoute(routeDependencies);
    registerEvaluateRoute(routeDependencies);
    registerGetTraceEvidenceRoute(routeDependencies);

    return {
      resolveMappingsHandler: versionedRouter.getRoute('post', EVALS_RESOLVE_INSTRUMENTATION_URL)
        .versions[API_VERSIONS.internal.v1].handler,
      validateHandler: versionedRouter.getRoute('post', EVALS_VALIDATE_URL).versions[
        API_VERSIONS.internal.v1
      ].handler,
      evaluateHandler: versionedRouter.getRoute('post', EVALS_EVALUATE_URL).versions[
        API_VERSIONS.internal.v1
      ].handler,
      evidenceHandler: versionedRouter.getRoute('get', EVALS_TRACE_EVIDENCE_URL).versions[
        API_VERSIONS.internal.v1
      ].handler,
    };
  };

  const buildContext = () =>
    ({
      core: Promise.resolve({
        elasticsearch: {
          client: {
            asInternalUser: esClient,
            asCurrentUser: esClient,
          },
        },
      }),
    } as const);

  beforeAll(async () => {
    const { startES } = createTestServers({ adjustTimeout: jest.setTimeout });
    manageES = await startES();
    root = createRootWithCorePlugins({}, { oss: true });
    await root.preboot();
    await root.setup();
    const coreStart = await root.start();
    esClient = coreStart.elasticsearch.client.asInternalUser;
  });

  afterAll(async () => {
    await root?.shutdown().catch(() => {});
    await manageES?.stop().catch(() => {});
  });

  beforeEach(async () => {
    await cleanupEvidenceIndices(esClient);
    await createEvidenceIndices(esClient);
    await indexFixtures(esClient);
  });

  afterEach(async () => {
    await cleanupEvidenceIndices(esClient);
  });

  it('recommends the correct mapping profile for each convention fixture set', async () => {
    const { resolveMappingsHandler } = setupRoutes();
    const context = buildContext() as unknown as Parameters<typeof resolveMappingsHandler>[0];

    const elasticResponse = await resolveMappingsHandler(
      context,
      { body: { trace_id: ELASTIC_CONVENTION_TRACE_ID } } as unknown as Parameters<
        typeof resolveMappingsHandler
      >[1],
      kibanaResponseFactory
    );
    const eventsResponse = await resolveMappingsHandler(
      context,
      { body: { trace_id: OTEL_EVENTS_TRACE_ID } } as unknown as Parameters<
        typeof resolveMappingsHandler
      >[1],
      kibanaResponseFactory
    );
    const attributesResponse = await resolveMappingsHandler(
      context,
      { body: { trace_id: OTEL_ATTRIBUTES_TRACE_ID } } as unknown as Parameters<
        typeof resolveMappingsHandler
      >[1],
      kibanaResponseFactory
    );
    const claudeResponse = await resolveMappingsHandler(
      context,
      { body: { trace_id: CLAUDE_CODE_TRACE_ID } } as unknown as Parameters<
        typeof resolveMappingsHandler
      >[1],
      kibanaResponseFactory
    );

    expect(elasticResponse.status).toBe(200);
    expect(eventsResponse.status).toBe(200);
    expect(attributesResponse.status).toBe(200);
    expect(claudeResponse.status).toBe(200);
    expect(
      (elasticResponse.payload as ResolveInstrumentationResponse).recommended_instrumentation
    ).toEqual({
      profile: 'elastic-inference',
    });
    expect(
      (eventsResponse.payload as ResolveInstrumentationResponse).recommended_instrumentation
    ).toEqual({
      profile: 'otel-genai-events',
    });
    expect((eventsResponse.payload as ResolveInstrumentationResponse).profiles).toContainEqual(
      expect.objectContaining({
        profile: 'elastic-inference',
        evidence: expect.objectContaining({
          user_query: expect.objectContaining({ status: 'not_found' }),
          agent_response: expect.objectContaining({ status: 'not_found' }),
        }),
      })
    );
    expect(
      (attributesResponse.payload as ResolveInstrumentationResponse).recommended_instrumentation
    ).toEqual({
      profile: 'otel-genai-attributes',
    });
    expect(
      (claudeResponse.payload as ResolveInstrumentationResponse).recommended_instrumentation
    ).toEqual({
      profile: 'claude-code',
    });
    expect((attributesResponse.payload as ResolveInstrumentationResponse).profiles).toContainEqual(
      expect.objectContaining({
        profile: 'elastic-inference',
        evidence: expect.objectContaining({
          user_query: expect.objectContaining({ status: 'not_found' }),
          agent_response: expect.objectContaining({ status: 'not_found' }),
        }),
      })
    );
  });

  it('validates evaluator readiness for all conventions using profile-specific mappings', async () => {
    const { validateHandler } = setupRoutes();
    const context = buildContext() as unknown as Parameters<typeof validateHandler>[0];

    const elasticResponse = await validateHandler(
      context,
      {
        body: {
          subject: { traces: [{ trace_id: ELASTIC_CONVENTION_TRACE_ID }] },
          evaluators: [{ name: 'groundedness' }, { name: 'latency' }],
        },
      } as unknown as Parameters<typeof validateHandler>[1],
      kibanaResponseFactory
    );
    const eventsResponse = await validateHandler(
      context,
      {
        body: {
          subject: {
            traces: [{ trace_id: OTEL_EVENTS_TRACE_ID }],
            instrumentation: { profile: 'otel-genai-events' },
          },
          evaluators: [{ name: 'groundedness' }],
        },
      } as unknown as Parameters<typeof validateHandler>[1],
      kibanaResponseFactory
    );
    const attributesResponse = await validateHandler(
      context,
      {
        body: {
          subject: {
            traces: [{ trace_id: OTEL_ATTRIBUTES_TRACE_ID }],
            instrumentation: { profile: 'otel-genai-attributes' },
          },
          evaluators: [{ name: 'groundedness' }],
        },
      } as unknown as Parameters<typeof validateHandler>[1],
      kibanaResponseFactory
    );
    const claudeResponse = await validateHandler(
      context,
      {
        body: {
          subject: {
            traces: [{ trace_id: CLAUDE_CODE_TRACE_ID }],
            instrumentation: { profile: 'claude-code' },
          },
          evaluators: [{ name: 'groundedness' }],
        },
      } as unknown as Parameters<typeof validateHandler>[1],
      kibanaResponseFactory
    );

    expect(elasticResponse.status).toBe(200);
    expect(eventsResponse.status).toBe(200);
    expect(attributesResponse.status).toBe(200);
    expect(claudeResponse.status).toBe(200);
    expect((elasticResponse.payload as ValidateResponse).evaluators).toEqual([
      { name: 'groundedness', version: '1.0.0', ready: true, unmet: [] },
      { name: 'latency', version: '1.0.0', ready: true, unmet: [] },
    ]);
    expect((eventsResponse.payload as ValidateResponse).evaluators).toEqual([
      { name: 'groundedness', version: '1.0.0', ready: true, unmet: [] },
    ]);
    expect((attributesResponse.payload as ValidateResponse).evaluators).toEqual([
      { name: 'groundedness', version: '1.0.0', ready: true, unmet: [] },
    ]);
    expect((claudeResponse.payload as ValidateResponse).evaluators).toEqual([
      { name: 'groundedness', version: '1.0.0', ready: true, unmet: [] },
    ]);
  });

  it('normalizes claude-code evidence round and preserves flat step ordering', async () => {
    const evidence = await normalizeEvidence(
      createTraceAccessor({ esClient, traceId: CLAUDE_CODE_TRACE_ID }),
      getInstrumentationProfile('claude-code')
    );

    expect(evidence).toEqual({
      input: { message: 'Summarize workflow run status.' },
      response: { message: 'Workflow run summary:\n\n2 succeeded, 1 failed.' },
      steps: [
        {
          tool_id: 'GetWorkflowRuns',
          arguments: { status: 'all' },
          result: { runs: { success: 2, failed: 1 } },
        },
        {
          tool_id: 'SummarizeRuns',
          arguments: { format: 'brief' },
          result: 'Summary unavailable due to timeout',
        },
      ],
    });
  });

  it('returns immediate Claude Code and explicit OTel evidence through the route', async () => {
    const { evidenceHandler } = setupRoutes();
    const context = buildContext() as unknown as Parameters<typeof evidenceHandler>[0];

    const claudeResponse = await evidenceHandler(
      context,
      {
        params: { traceId: CLAUDE_CODE_TRACE_ID },
        query: { wait: 'none' },
      } as unknown as Parameters<typeof evidenceHandler>[1],
      kibanaResponseFactory
    );
    const otelResponse = await evidenceHandler(
      context,
      {
        params: { traceId: OTEL_EVENTS_TRACE_ID },
        query: { wait: 'none', profile: 'otel-genai-events' },
      } as unknown as Parameters<typeof evidenceHandler>[1],
      kibanaResponseFactory
    );

    expect(claudeResponse.status).toBe(200);
    expect(claudeResponse.payload as GetTraceEvidenceResponse).toEqual(
      expect.objectContaining({
        status: 'resolved',
        readiness: 'immediate',
        profile_selection: 'auto',
        profile: 'claude-code',
        evidence: expect.objectContaining({
          input: { message: 'Summarize workflow run status.' },
          response: { message: 'Workflow run summary:\n\n2 succeeded, 1 failed.' },
        }),
      })
    );
    expect(otelResponse.status).toBe(200);
    expect(otelResponse.payload as GetTraceEvidenceResponse).toEqual(
      expect.objectContaining({
        status: 'resolved',
        profile_selection: 'explicit',
        profile: 'otel-genai-events',
      })
    );
  });

  it('stabilizes rootless Claude Code evidence with a shortened test window', async () => {
    const result = await awaitTraceReady(
      createTraceAccessor({ esClient, traceId: CLAUDE_CODE_TRACE_ID }),
      { mode: 'stable', profile: 'claude-code' },
      logger,
      { stabilityWindowMs: 1 }
    );

    expect(result).toEqual(
      expect.objectContaining({
        readiness: 'stable',
        profile: 'claude-code',
        round: expect.objectContaining({
          response: { message: 'Workflow run summary:\n\n2 succeeded, 1 failed.' },
        }),
      })
    );
  });

  it('evaluates groundedness and code evaluators without unmapped-field search failures', async () => {
    const { evaluateHandler } = setupRoutes();
    const context = buildContext() as unknown as Parameters<typeof evaluateHandler>[0];

    const elasticResponse = await evaluateHandler(
      context,
      {
        body: {
          subject: {
            traces: [{ trace_id: ELASTIC_CONVENTION_TRACE_ID }],
            instrumentation: { profile: 'elastic-inference' },
          },
          evaluators: [{ name: 'groundedness', connector_id: 'connector-1' }, { name: 'latency' }],
        },
      } as unknown as Parameters<typeof evaluateHandler>[1],
      kibanaResponseFactory
    );
    const eventsResponse = await evaluateHandler(
      context,
      {
        body: {
          subject: {
            traces: [{ trace_id: OTEL_EVENTS_TRACE_ID }],
            instrumentation: { profile: 'otel-genai-events' },
          },
          evaluators: [{ name: 'groundedness', connector_id: 'connector-1' }, { name: 'latency' }],
        },
      } as unknown as Parameters<typeof evaluateHandler>[1],
      kibanaResponseFactory
    );
    const attributesResponse = await evaluateHandler(
      context,
      {
        body: {
          subject: {
            traces: [{ trace_id: OTEL_ATTRIBUTES_TRACE_ID }],
            instrumentation: { profile: 'otel-genai-attributes' },
          },
          evaluators: [{ name: 'groundedness', connector_id: 'connector-1' }, { name: 'latency' }],
        },
      } as unknown as Parameters<typeof evaluateHandler>[1],
      kibanaResponseFactory
    );
    const claudeResponse = await evaluateHandler(
      context,
      {
        body: {
          subject: {
            traces: [{ trace_id: CLAUDE_CODE_TRACE_ID }],
            instrumentation: { profile: 'claude-code' },
          },
          evaluators: [{ name: 'groundedness', connector_id: 'connector-1' }, { name: 'latency' }],
        },
      } as unknown as Parameters<typeof evaluateHandler>[1],
      kibanaResponseFactory
    );

    expect(elasticResponse.status).toBe(200);
    expect(eventsResponse.status).toBe(200);
    expect(attributesResponse.status).toBe(200);
    expect(claudeResponse.status).toBe(200);

    const elasticResults = (elasticResponse.payload as EvaluateResponse).results;
    const eventsResults = (eventsResponse.payload as EvaluateResponse).results;
    const attributesResults = (attributesResponse.payload as EvaluateResponse).results;
    const claudeResults = (claudeResponse.payload as EvaluateResponse).results;

    expect(elasticResults.map((result) => result.status)).toEqual(['ok', 'ok']);
    expect(eventsResults.map((result) => result.status)).toEqual(['ok', 'ok']);
    expect(attributesResults.map((result) => result.status)).toEqual(['ok', 'ok']);
    expect(claudeResults.map((result) => result.status)).toEqual(['ok', 'ok']);
    expect(
      [elasticResults, eventsResults, attributesResults, claudeResults].every(
        (results) => results[0]?.scores?.[0]?.label === 'GROUNDED'
      )
    ).toBe(true);
  });
});
