/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { BoundInferenceClient } from '@kbn/inference-common';
import { createTraceAccessor } from '../groundedness/trace_accessor';
import { createEvaluatorRegistry } from '../registry';
import { correctnessEvaluator } from '.';

describe('correctness evaluator', () => {
  const traceId = 'trace-id-123';

  const createEsClient = () => {
    const queryMock = jest.fn();
    const esClient = {
      esql: {
        query: queryMock,
      },
    } as unknown as ElasticsearchClient;

    return { esClient, queryMock };
  };

  it('uses one prompt call to produce factuality, relevance, and sequence_accuracy scores', async () => {
    const logger = loggingSystemMock.createLogger();
    const { esClient, queryMock } = createEsClient();
    const traceAccessor = createTraceAccessor({ traceId, esClient });

    queryMock
      .mockResolvedValueOnce({
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: 'attributes.content', type: 'keyword' },
          { name: 'span_id', type: 'keyword' },
        ],
        values: [['2026-06-26T10:00:00.000Z', 'What is the payment status?', 'span-001']],
      })
      .mockResolvedValueOnce({
        columns: [
          { name: '@timestamp', type: 'date' },
          { name: 'attributes.message.content', type: 'keyword' },
          { name: 'span_id', type: 'keyword' },
        ],
        values: [['2026-06-26T10:00:01.000Z', 'Payment service is healthy.', 'span-002']],
      });

    const promptMock = jest.fn().mockResolvedValue({
      toolCalls: [
        {
          function: {
            arguments: {
              summary: {
                factual_accuracy_summary: 'ACCURATE',
                relevance_summary: 'RELEVANT',
                sequence_accuracy_summary: 'MATCH',
              },
              analysis: [
                {
                  claim: 'Payment service is healthy.',
                  centrality: 'central',
                  centrality_reason: 'Answers the user question.',
                  verdict: 'FULLY_SUPPORTED',
                  sequence_match: 'MATCH',
                  justification_snippet: 'Payment service is healthy.',
                  explanation: 'Claim matches expected output.',
                },
              ],
            },
          },
        },
      ],
    });

    const result = await correctnessEvaluator.evaluate({
      trace: traceAccessor,
      referenceData: { expected: 'Payment service is healthy.' },
      inferenceClient: { prompt: promptMock } as unknown as BoundInferenceClient,
      log: logger,
    });

    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(promptMock.mock.calls[0][0]?.input).toEqual({
      user_query: 'What is the payment status?',
      agent_response: 'Payment service is healthy.',
      ground_truth_response: 'Payment service is healthy.',
    });
    expect(result.scores.map((score) => score.name)).toEqual([
      'factuality',
      'relevance',
      'sequence_accuracy',
    ]);
  });

  it('registers correctness in the evaluator registry', () => {
    const registry = createEvaluatorRegistry();

    expect(registry.get('correctness')).toBeDefined();
    expect(registry.list()).toHaveLength(6);
  });
});
