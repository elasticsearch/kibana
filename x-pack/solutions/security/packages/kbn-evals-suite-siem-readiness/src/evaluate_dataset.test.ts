/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DefaultEvaluators, EvalsExecutorClient, Evaluator } from '@kbn/evals';
import type { SiemReadinessEvalChatClient } from './chat_client';
import { createEvaluateSiemReadinessDataset } from './evaluate_dataset';

const buildEvaluator = (name: string): Evaluator => ({
  name,
  kind: 'CODE',
  evaluate: jest.fn().mockResolvedValue({ score: 0 }),
});

const buildDeps = () => {
  const runExperiment = jest.fn().mockResolvedValue(undefined);
  const executorClient = { runExperiment } as unknown as EvalsExecutorClient;
  const chatClient = {
    converse: jest.fn().mockResolvedValue({
      messages: [],
      steps: [],
      errors: [],
      traceId: 'trace-id-fixture',
    }),
  } as unknown as SiemReadinessEvalChatClient;
  const evaluators = {
    criteria: jest.fn().mockReturnValue(buildEvaluator('Criteria')),
    traceBasedEvaluators: {
      inputTokens: buildEvaluator('Input tokens'),
      outputTokens: buildEvaluator('Output tokens'),
      cachedTokens: buildEvaluator('Cached tokens'),
      toolCalls: buildEvaluator('Tool calls'),
      latency: buildEvaluator('Latency'),
    },
  } as unknown as DefaultEvaluators;

  return { runExperiment, executorClient, chatClient, evaluators };
};

const getRegisteredEvaluators = async () => {
  const { runExperiment, executorClient, chatClient, evaluators } = buildDeps();

  await createEvaluateSiemReadinessDataset({ evaluators, executorClient, chatClient })({
    dataset: { name: 'test', description: 'test', examples: [] },
  });

  const [, registeredEvaluators] = runExperiment.mock.calls[0] as [unknown, Evaluator[]];
  return registeredEvaluators;
};

describe('createEvaluateSiemReadinessDataset', () => {
  it('registers the SIEM Readiness criteria evaluator', async () => {
    const names = (await getRegisteredEvaluators()).map((evaluator) => evaluator.name);
    expect(names).toContain('SIEM Readiness Criteria');
  });

  // Guard against silently dropping the free, no-extra-LLM-cost trace metrics
  // (regression that this test was written to prevent).
  it('registers all five trace-based evaluators alongside the criteria evaluator', async () => {
    const names = (await getRegisteredEvaluators()).map((evaluator) => evaluator.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Input tokens',
        'Output tokens',
        'Cached tokens',
        'Tool calls',
        'Latency',
      ])
    );
  });

  it('registers exactly the criteria evaluator plus the five trace-based evaluators', async () => {
    const registeredEvaluators = await getRegisteredEvaluators();
    expect(registeredEvaluators).toHaveLength(6);
  });
});
