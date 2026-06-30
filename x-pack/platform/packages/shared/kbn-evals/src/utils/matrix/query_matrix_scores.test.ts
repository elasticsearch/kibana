/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationExperimentSummary } from '@kbn/evals-common';
import type { ExperimentStats } from '../evals_client';
import { pickLatestExperimentPerModel, experimentStatsToDatasets } from './query_matrix_scores';

const experiment = (
  overrides: Partial<EvaluationExperimentSummary> & { modelId?: string }
): EvaluationExperimentSummary => {
  const { modelId, ...rest } = overrides;
  return {
    experiment_id: 'exp',
    timestamp: '2026-06-10T00:00:00.000Z',
    task_model: modelId ? { id: modelId, family: 'fam', provider: 'prov' } : undefined,
    ...rest,
  } as EvaluationExperimentSummary;
};

describe('pickLatestExperimentPerModel', () => {
  it('keeps the most recent experiment per model', () => {
    const result = pickLatestExperimentPerModel([
      experiment({ experiment_id: 'old', modelId: 'm1', timestamp: '2026-06-01T00:00:00.000Z' }),
      experiment({ experiment_id: 'new', modelId: 'm1', timestamp: '2026-06-09T00:00:00.000Z' }),
      experiment({ experiment_id: 'other', modelId: 'm2', timestamp: '2026-06-05T00:00:00.000Z' }),
    ]);

    expect(result.get('m1')?.experiment_id).toBe('new');
    expect(result.get('m2')?.experiment_id).toBe('other');
  });

  it('ignores experiments without a task model id', () => {
    const result = pickLatestExperimentPerModel([
      experiment({ experiment_id: 'no-model', modelId: undefined }),
    ]);
    expect(result.size).toBe(0);
  });

  it('drops experiments older than the lookback window', () => {
    const now = Date.parse('2026-06-15T00:00:00.000Z');
    const result = pickLatestExperimentPerModel(
      [
        experiment({
          experiment_id: 'stale',
          modelId: 'm1',
          timestamp: '2026-05-01T00:00:00.000Z',
        }),
        experiment({
          experiment_id: 'fresh',
          modelId: 'm2',
          timestamp: '2026-06-14T00:00:00.000Z',
        }),
      ],
      { lookbackDays: 14, now }
    );

    expect(result.has('m1')).toBe(false);
    expect(result.get('m2')?.experiment_id).toBe('fresh');
  });
});

describe('experimentStatsToDatasets', () => {
  it('groups evaluator stats by dataset with mean + count', () => {
    const stats: ExperimentStats = {
      taskModel: { id: 'm1' },
      evaluatorModel: { id: 'judge' },
      totalRepetitions: 1,
      stats: [
        {
          datasetId: 'd1',
          datasetName: 'D1',
          evaluatorName: 'correctness',
          stats: { mean: 0.9, median: 0.9, stdDev: 0, min: 0.9, max: 0.9, count: 10 },
        },
        {
          datasetId: 'd1',
          datasetName: 'D1',
          evaluatorName: 'groundedness',
          stats: { mean: 0.8, median: 0.8, stdDev: 0, min: 0.8, max: 0.8, count: 10 },
        },
        {
          datasetId: 'd2',
          datasetName: 'D2',
          evaluatorName: 'correctness',
          stats: { mean: 0.7, median: 0.7, stdDev: 0, min: 0.7, max: 0.7, count: 5 },
        },
      ],
    };

    expect(experimentStatsToDatasets(stats)).toEqual([
      {
        datasetId: 'd1',
        datasetName: 'D1',
        evaluators: [
          { evaluatorName: 'correctness', mean: 0.9, count: 10 },
          { evaluatorName: 'groundedness', mean: 0.8, count: 10 },
        ],
      },
      {
        datasetId: 'd2',
        datasetName: 'D2',
        evaluators: [{ evaluatorName: 'correctness', mean: 0.7, count: 5 }],
      },
    ]);
  });
});
