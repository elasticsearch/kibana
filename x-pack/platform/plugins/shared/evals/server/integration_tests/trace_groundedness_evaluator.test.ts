/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kibanaResponseFactory } from '@kbn/core/server';
import { httpServiceMock } from '@kbn/core/server/mocks';
import type { MockedVersionedRouter } from '@kbn/core-http-router-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { BoundInferenceClient } from '@kbn/inference-common';
import { API_VERSIONS, EVALS_EVALUATE_URL } from '@kbn/evals-common';
import { EVALS_API_PRIVILEGES } from '../../common';
import { createEvaluatorRegistry } from '../evaluators/registry';
import type { GroundednessAnalysis } from '../evaluators/groundedness/types';
import type { CorrectnessAnalysis } from '../evaluators/correctness/types';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { registerEvaluateRoute } from '../routes/evaluators/evaluate';

const logger = loggingSystemMock.createLogger();

const createMockEsqlQuery = ({ hasToolEvidence }: { hasToolEvidence: boolean }) => {
  const userPrompt = hasToolEvidence
    ? 'What is the payment service status?'
    : 'What is the billing service status?';
  const agentResponse = hasToolEvidence
    ? 'The payment service is healthy, as confirmed by the health check tool.'
    : 'The billing service has 99.9% uptime based on the last 30 days.';

  return jest.fn().mockImplementation(async ({ query }: { query: string }) => {
    if (query.includes('event_name == "gen_ai.user.message"')) {
      return {
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: 'attributes.content', type: 'keyword' },
          { name: 'span_id', type: 'keyword' },
        ],
        values: [[new Date().toISOString(), userPrompt, 'span-001']],
      };
    }

    if (query.includes('event_name == "gen_ai.choice"')) {
      return {
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: 'attributes.message.content', type: 'keyword' },
          { name: 'span_id', type: 'keyword' },
        ],
        values: [[new Date().toISOString(), agentResponse, 'span-002']],
      };
    }

    if (query.includes('attributes.elastic.inference.span.kind == "TOOL"')) {
      return {
        columns: [
          { name: 'attributes.gen_ai.tool.call.id', type: 'keyword' },
          { name: 'attributes.gen_ai.tool.name', type: 'keyword' },
          { name: 'attributes.gen_ai.tool.call.arguments', type: 'keyword' },
          { name: 'attributes.gen_ai.tool.call.result', type: 'keyword' },
          { name: '@timestamp', type: 'date' },
        ],
        values: hasToolEvidence
          ? [
              [
                'call_123',
                'health_check',
                '{"service":"payment"}',
                '{"status":"healthy"}',
                new Date().toISOString(),
              ],
            ]
          : [],
      };
    }

    if (query.includes('latency_seconds')) {
      return {
        columns: [{ name: 'latency_seconds', type: 'double' }],
        values: [[2.5]],
      };
    }

    throw new Error(`Unexpected ES|QL query in integration test: ${query}`);
  });
};

describe('trace groundedness evaluator integration', () => {
  const setupRoute = ({ esqlQuery, prompt }: { esqlQuery: jest.Mock; prompt: jest.Mock }) => {
    const router = httpServiceMock.createRouter();
    const versionedRouter = router.versioned as MockedVersionedRouter;
    const getClient = jest.fn().mockReturnValue({ prompt } as unknown as BoundInferenceClient);

    registerEvaluateRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: createEvaluatorRegistry(),
      getInferenceStart: async () =>
        ({
          getClient,
        } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const route = versionedRouter.getRoute('post', EVALS_EVALUATE_URL);
    const { handler } = route.versions[API_VERSIONS.internal.v1];
    const context = {
      core: Promise.resolve({
        elasticsearch: {
          client: {
            asInternalUser: {
              esql: {
                query: esqlQuery,
              },
            },
          },
        },
      }),
    } as unknown as Parameters<typeof handler>[0];

    return { handler, context, getClient };
  };

  it('returns expected groundedness and batch latency results from the batch evaluate route', async () => {
    const prompt = jest
      .fn()
      .mockImplementation(async ({ input }: { input: { tool_call_history: string } }) => {
        const toolCalls = JSON.parse(input.tool_call_history) as Array<{
          tool_id?: string;
          tool_call_id?: string;
        }>;
        const grounded = toolCalls.some((toolCall) => toolCall.tool_id === 'health_check');

        const analysis = (
          grounded
            ? {
                summary_verdict: 'GROUNDED',
                evidence_source: 'trace',
                analysis: [
                  {
                    claim: 'Payment service is healthy',
                    centrality: 'central',
                    centrality_reason: 'Directly answers the question',
                    verdict: 'FULLY_SUPPORTED',
                    evidence: {
                      tool_call_id: 'call_123',
                      tool_id: 'health_check',
                      evidence_snippet: '{"status":"healthy"}',
                    },
                    explanation: 'Tool output supports the claim',
                  },
                ],
              }
            : {
                summary_verdict: 'MAJOR_HALLUCINATIONS',
                analysis: [
                  {
                    claim: 'Billing service has 99.9% uptime',
                    centrality: 'central',
                    centrality_reason: 'Main response claim',
                    verdict: 'NOT_FOUND',
                    evidence: undefined,
                    explanation: 'No supporting tool evidence',
                  },
                ],
              }
        ) as GroundednessAnalysis;

        return {
          toolCalls: [{ function: { arguments: analysis } }],
        };
      });
    const { handler, context } = setupRoute({
      esqlQuery: createMockEsqlQuery({ hasToolEvidence: true }),
      prompt,
    });

    const groundedResponse = await handler(
      context,
      {
        body: {
          subject: {
            mode: 'single-turn',
            traces: [{ trace_id: 'grounded-trace-001' }],
          },
          evaluators: [{ name: 'groundedness', connector_id: 'connector-1' }],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(groundedResponse.status).toBe(200);
    const groundedResult = groundedResponse.payload.results[0];
    expect(groundedResult.status).toBe('ok');
    expect(groundedResult.scores).toHaveLength(1);
    const groundedScore = groundedResult.scores[0];
    expect(groundedScore.label).toBe('GROUNDED');
    expect(groundedScore.metadata?.evidence_source).toBe('trace');
    const groundedAnalysis = groundedScore.metadata?.analysis as Array<{
      evidence?: { tool_id?: string };
    }>;
    expect(groundedAnalysis.some((entry) => entry.evidence?.tool_id === 'health_check')).toBe(true);

    const batchResponse = await handler(
      context,
      {
        body: {
          subject: {
            mode: 'single-turn',
            traces: [{ trace_id: 'grounded-trace-001' }],
          },
          evaluators: [{ name: 'groundedness', connector_id: 'connector-1' }, { name: 'latency' }],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(batchResponse.status).toBe(200);
    expect(batchResponse.payload.results).toHaveLength(2);
    expect(batchResponse.payload.results).toEqual([
      expect.objectContaining({
        name: 'groundedness',
        status: 'ok',
        scores: [expect.objectContaining({ name: 'groundedness' })],
      }),
      expect.objectContaining({
        name: 'latency',
        status: 'ok',
        scores: [expect.objectContaining({ name: 'latency', score: 2.5 })],
      }),
    ]);

    const hallucinatedPrompt = jest.fn().mockResolvedValue({
      toolCalls: [
        {
          function: {
            arguments: {
              summary_verdict: 'MAJOR_HALLUCINATIONS',
              analysis: [
                {
                  claim: 'Billing service has 99.9% uptime',
                  centrality: 'central',
                  centrality_reason: 'Main response claim',
                  verdict: 'NOT_FOUND',
                  evidence: undefined,
                  explanation: 'No supporting tool evidence',
                },
              ],
            } satisfies GroundednessAnalysis,
          },
        },
      ],
    });
    const hallucinatedRoute = setupRoute({
      esqlQuery: createMockEsqlQuery({ hasToolEvidence: false }),
      prompt: hallucinatedPrompt,
    });
    const hallucinatedResponse = await hallucinatedRoute.handler(
      hallucinatedRoute.context,
      {
        body: {
          subject: {
            mode: 'single-turn',
            traces: [{ trace_id: 'hallucinated-trace-001' }],
          },
          evaluators: [{ name: 'groundedness', connector_id: 'connector-1' }],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(hallucinatedResponse.status).toBe(200);
    const hallucinatedLabel = hallucinatedResponse.payload.results[0]?.scores?.[0]?.label;
    expect(['MINOR_HALLUCINATIONS', 'MAJOR_HALLUCINATIONS']).toContain(hallucinatedLabel);
  });

  it('returns correctness sub-scores from one evaluator execution', async () => {
    const correctnessPrompt = jest
      .fn()
      .mockImplementation(async ({ input }: { input: unknown }) => {
        const payload = input as { ground_truth_response?: string };
        if (!payload.ground_truth_response) {
          throw new Error('Expected correctness input to include ground_truth_response');
        }

        const analysis: CorrectnessAnalysis = {
          summary: {
            factual_accuracy_summary: 'MOSTLY_FACTUAL',
            relevance_summary: 'RELEVANT',
            sequence_accuracy_summary: 'MOSTLY_IN_ORDER',
          },
          analysis: [
            {
              claim: 'The payment service is healthy',
              centrality: 'central',
              centrality_reason: 'Core answer',
              verdict: 'FULLY_SUPPORTED',
              sequence_match: 'MATCH',
              justification_snippet: 'status=healthy',
              explanation: 'Ground truth confirms the claim',
            },
          ],
        };

        return {
          toolCalls: [{ function: { arguments: analysis } }],
        };
      });
    const { handler, context } = setupRoute({
      esqlQuery: createMockEsqlQuery({ hasToolEvidence: true }),
      prompt: correctnessPrompt,
    });

    const response = await handler(
      context,
      {
        body: {
          subject: {
            mode: 'single-turn',
            traces: [
              {
                trace_id: 'correctness-trace-001',
                reference_data: {
                  expected: 'The payment service is healthy.',
                },
              },
            ],
          },
          evaluators: [{ name: 'correctness', connector_id: 'connector-1' }],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    const scores: Array<{ name: string }> = response.payload.results[0]?.scores ?? [];
    expect(scores.map((score) => score.name)).toEqual([
      'factuality',
      'relevance',
      'sequence_accuracy',
    ]);
  });

  it('enforces manage privilege in evaluator evaluate route security config', async () => {
    const router = httpServiceMock.createRouter();
    const versionedRouter = router.versioned as MockedVersionedRouter;

    registerEvaluateRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: createEvaluatorRegistry(),
      getInferenceStart: async () =>
        ({
          getClient: jest.fn(),
        } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const routeConfig = versionedRouter.post.mock.calls[0][0];
    expect(routeConfig.security).toEqual({
      authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.manage] },
    });
  });
});
