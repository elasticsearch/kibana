/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvalsExecutorClient, Evaluator } from '@kbn/evals';
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';
import type { AttackDiscoveryClient } from './clients/attack_discovery_client';
import type { AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput } from './types';
import { createEvaluateAttackDiscoveryDataset } from './evaluate_dataset';
import { ATTACK_DISCOVERY_BASIC_EVALUATOR_NAME } from './evaluators/attack_discovery_basic_evaluator';
import { ALERT_ID_GROUNDING_EVALUATOR_NAME } from './evaluators/alert_id_grounding_evaluator';
import { NO_FABRICATION_EVALUATOR_NAME } from './evaluators/no_fabrication_evaluator';

type CapturedEvaluator = Evaluator<AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput>;

const buildDeps = () => {
  const runExperiment = jest.fn().mockResolvedValue(undefined);
  const executorClient = { runExperiment } as unknown as EvalsExecutorClient;
  const inferenceClient = {
    bindTo: jest.fn().mockReturnValue({}),
  } as unknown as BoundInferenceClient;
  return {
    runExperiment,
    attackDiscoveryClient: {} as unknown as AttackDiscoveryClient,
    executorClient,
    inferenceClient,
    evaluationConnectorId: 'test-connector',
    log: {} as unknown as ToolingLog,
  };
};

const runWithEmptyDataset = async () => {
  const deps = buildDeps();
  await createEvaluateAttackDiscoveryDataset(deps)({
    dataset: { name: 'test', description: 'test', examples: [] },
  });
  const [, evaluators] = deps.runExperiment.mock.calls[0] as [unknown, CapturedEvaluator[]];
  return evaluators;
};

describe('createEvaluateAttackDiscoveryDataset', () => {
  it('registers the quality + negative evaluator stack in the expected order', async () => {
    const evaluators = await runWithEmptyDataset();

    expect(evaluators).toHaveLength(4);

    expect(evaluators[0].name).toBe(ATTACK_DISCOVERY_BASIC_EVALUATOR_NAME);
    expect(evaluators[0].kind).toBe('CODE');

    expect(evaluators[1].name).toBe('AttackDiscoveryRubric');
    expect(evaluators[1].kind).toBe('LLM');

    expect(evaluators[2].name).toBe(ALERT_ID_GROUNDING_EVALUATOR_NAME);
    expect(evaluators[2].kind).toBe('CODE');

    expect(evaluators[3].name).toBe(NO_FABRICATION_EVALUATOR_NAME);
    expect(evaluators[3].kind).toBe('CODE');
  });

  it('gates quality evaluators to N/A on negative examples', async () => {
    const evaluators = await runWithEmptyDataset();
    const grounding = evaluators[2];

    const result = await grounding.evaluate({
      input: { mode: 'bundledAlerts', anonymizedAlerts: [] },
      output: { insights: [] } as AttackDiscoveryTaskOutput,
      expected: { attackDiscoveries: [] },
      metadata: { testType: 'negative' },
    });

    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  it('scores negative examples with the No-Fabrication evaluator only', async () => {
    const evaluators = await runWithEmptyDataset();
    const noFabrication = evaluators[3];

    const negative = await noFabrication.evaluate({
      input: { mode: 'bundledAlerts', anonymizedAlerts: [] },
      output: { insights: [] } as AttackDiscoveryTaskOutput,
      expected: { attackDiscoveries: [] },
      metadata: { testType: 'negative' },
    });
    expect(negative.score).toBe(1);

    const positive = await noFabrication.evaluate({
      input: { mode: 'bundledAlerts', anonymizedAlerts: [] },
      output: { insights: [] } as AttackDiscoveryTaskOutput,
      expected: { attackDiscoveries: [] },
      metadata: {},
    });
    expect(positive.score).toBeNull();
  });
});
