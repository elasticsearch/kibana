/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DefaultEvaluators, Evaluator } from '@kbn/evals';
import { buildPolicyManagementEvaluators } from './evaluate_policy_management_dataset';
import { POLICY_MANAGEMENT_TOOL_USAGE_EVALUATOR_NAME } from './policy_management_tool_usage_evaluator';

const createTraceEvaluator = (name: string): Evaluator => ({
  name,
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async () => ({ score: 1 }),
});

const createMockEvaluators = (): DefaultEvaluators =>
  ({
    criteria: () => ({
      name: 'inner-criteria',
      kind: 'LLM' as const,
      evaluate: async () => ({ score: 1 }),
    }),
    traceBasedEvaluators: {
      inputTokens: createTraceEvaluator('Input Tokens'),
      outputTokens: createTraceEvaluator('Output Tokens'),
      cachedTokens: createTraceEvaluator('Cached Tokens'),
      toolCalls: createTraceEvaluator('Tool Calls'),
      latency: createTraceEvaluator('Latency'),
    },
  } as unknown as DefaultEvaluators);

describe('evaluatePolicyManagementDataset', () => {
  it('attaches the finalized-step tool evaluator and generic trace evaluators', () => {
    const evaluators = buildPolicyManagementEvaluators({
      evaluators: createMockEvaluators(),
    });

    const names = evaluators.map((evaluator) => evaluator.name);

    expect(names).toContain(POLICY_MANAGEMENT_TOOL_USAGE_EVALUATOR_NAME);
    expect(names).toContain('Tool Calls');
    expect(names).toContain('Latency');
    expect(names).not.toContain('Skill Invoked (elastic-defend-policy-management)');
  });
});
