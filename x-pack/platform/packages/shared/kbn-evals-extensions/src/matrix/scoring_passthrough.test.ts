/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvalsClient } from '@kbn/evals';
import type { SomeDevLog } from '@kbn/some-dev-log';
import { queryMatrixScores } from './query_matrix_scores';

/**
 * The policy flags are only worth anything if a config value survives the trip
 * to the aggregator. A unit test on `scoresByPrefixToDatasets` cannot see a
 * dropped `scoring:` line in the call site — this one can.
 */
describe('queryMatrixScores — scoring policy passthrough', () => {
  const log = {
    debug: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  } as unknown as SomeDevLog;

  const experiment = {
    experiment_id: 'exp-1',
    execution_id: 'exec-1',
    timestamp: new Date().toISOString(),
    task_model: { id: 'model-a', family: 'anthropic', provider: 'eis' },
  };

  /** One judged score per judge: EIS-pinned, self-hosted, and self-judged. */
  const scores = [
    {
      example: { id: 'alert-analysis-a' },
      evaluator: {
        name: 'Groundedness',
        score: 0.9,
        model: { id: 'eis-anthropic-claude-4.6-sonnet' },
        metadata: { groundednessAnalysis: { summary_verdict: 'GROUNDED' } },
      },
      task: { model: { id: 'model-a' } },
    },
    {
      example: { id: 'alert-analysis-b' },
      evaluator: {
        name: 'Groundedness',
        score: 0.1,
        model: { id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct' },
        metadata: { groundednessAnalysis: { summary_verdict: 'MAJOR_HALLUCINATIONS' } },
      },
      task: { model: { id: 'model-a' } },
    },
  ];

  const clientFor = (docs = scores) =>
    ({
      listExperiments: jest.fn().mockResolvedValue([experiment]),
      getExperimentStats: jest.fn().mockResolvedValue({ stats: [] }),
      getExperimentScores: jest.fn().mockResolvedValue(docs),
    } as unknown as EvalsClient);

  const prefixMean = async (scoring?: Parameters<typeof queryMatrixScores>[2]['scoring']) => {
    const [model] = await queryMatrixScores(clientFor(), log, {
      suiteIds: ['suite-a'],
      modelIds: ['model-a'],
      prefixesBySuite: { 'suite-a': ['alert-analysis'] },
      scoring,
    });

    const dataset = model?.suites[0]?.datasets.find((d) => d.datasetId === 'prefix:alert-analysis');
    return dataset?.evaluators.find((e) => e.evaluatorName === 'Groundedness');
  };

  it('counts every judge and uses continuous scores when no policy is given', async () => {
    const evaluator = await prefixMean();

    expect(evaluator?.count).toBe(2);
    expect(evaluator?.mean).toBeCloseTo(0.5, 5);
  });

  it('drops the non-EIS judge when the config requires EIS-pinned judges', async () => {
    const evaluator = await prefixMean({ requireEisJudge: true });

    expect(evaluator?.count).toBe(1);
    expect(evaluator?.mean).toBeCloseTo(0.9, 5);
  });

  it('reads the categorical verdict when the config enables the ladder', async () => {
    // Continuous score and verdict disagree, so only the ladder path yields 1.
    const supported = [{ ...scores[0], evaluator: { ...scores[0].evaluator, score: 0.42 } }];

    const read = async (scoring?: { useVerdictLadder: boolean }) => {
      const [model] = await queryMatrixScores(clientFor(supported), log, {
        suiteIds: ['suite-a'],
        modelIds: ['model-a'],
        prefixesBySuite: { 'suite-a': ['alert-analysis'] },
        scoring,
      });
      return model?.suites[0]?.datasets
        .find((d) => d.datasetId === 'prefix:alert-analysis')
        ?.evaluators.find((e) => e.evaluatorName === 'Groundedness')?.mean;
    };

    expect(await read()).toBeCloseTo(0.42, 5);
    expect(await read({ useVerdictLadder: true })).toBeCloseTo(1, 5);
  });
});
