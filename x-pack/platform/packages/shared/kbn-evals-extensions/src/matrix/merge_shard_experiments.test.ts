/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mergeShardDatasets, pickShardExperiments } from './merge_shard_experiments';
import type { EvaluationExperimentSummary } from '@kbn/evals-common';
import type { AggregatedDatasetScores } from './query_matrix_scores';

const experiment = (
  executionId: string,
  timestamp: string,
  modelId = 'glm-5.3-flash'
): EvaluationExperimentSummary =>
  ({
    experiment_id: executionId,
    execution_id: executionId,
    timestamp,
    task_model: { id: modelId },
  } as EvaluationExperimentSummary);

describe('pickShardExperiments', () => {
  it('keeps every shard of the same sweep, not just the newest', () => {
    const picked = pickShardExperiments([
      experiment('sweep-100-s1of2::suite::glm-5.3-flash', '2026-09-03T10:00:00Z'),
      experiment('sweep-100-s2of2::suite::glm-5.3-flash', '2026-09-03T10:30:00Z'),
    ]);

    expect(picked.map((e) => e.execution_id)).toEqual([
      'sweep-100-s1of2::suite::glm-5.3-flash',
      'sweep-100-s2of2::suite::glm-5.3-flash',
    ]);
  });

  it('prefers the newest sweep and does not blend shards across sweeps', () => {
    // Mixing an old shard with a new one would silently report stale scores
    // as part of the current run.
    //
    // The old sweep's LAST shard must finish AFTER the new sweep's FIRST one,
    // otherwise comparing experiments individually still happens to pick the
    // right sweep and this test proves nothing.
    const picked = pickShardExperiments([
      experiment('sweep-100-s1of2::suite::glm-5.3-flash', '2026-09-03T10:00:00Z'),
      experiment('sweep-100-s2of2::suite::glm-5.3-flash', '2026-09-03T21:00:00Z'),
      experiment('sweep-200-s1of2::suite::glm-5.3-flash', '2026-09-03T20:00:00Z'),
      experiment('sweep-200-s2of2::suite::glm-5.3-flash', '2026-09-03T22:00:00Z'),
    ]);

    expect(picked.map((e) => e.execution_id)).toEqual([
      'sweep-200-s1of2::suite::glm-5.3-flash',
      'sweep-200-s2of2::suite::glm-5.3-flash',
    ]);
  });

  it('ranks a sweep by its last-finishing shard, not its last-listed one', () => {
    // Shards finish out of order. If a sweep is ranked by whichever shard
    // happens to be seen last, a sweep whose final shard finished EARLY is
    // undervalued and the stale sweep wins.
    const picked = pickShardExperiments([
      experiment('sweep-100-s1of2::suite::glm-5.3-flash', '2026-09-03T10:00:00Z'),
      experiment('sweep-100-s2of2::suite::glm-5.3-flash', '2026-09-03T19:00:00Z'),
      // Newest sweep: its max (21:00) beats sweep-100's max (19:00), but its
      // LAST-listed shard (12:00) does not.
      experiment('sweep-200-s1of2::suite::glm-5.3-flash', '2026-09-03T21:00:00Z'),
      experiment('sweep-200-s2of2::suite::glm-5.3-flash', '2026-09-03T12:00:00Z'),
    ]);

    expect(picked.map((e) => e.execution_id)).toEqual([
      'sweep-200-s1of2::suite::glm-5.3-flash',
      'sweep-200-s2of2::suite::glm-5.3-flash',
    ]);
  });

  it('leaves an unsharded run exactly as-is', () => {
    const picked = pickShardExperiments([
      experiment('plain-run::suite::glm-5.3-flash', '2026-09-03T10:00:00Z'),
    ]);

    expect(picked.map((e) => e.execution_id)).toEqual(['plain-run::suite::glm-5.3-flash']);
  });

  it('returns nothing for no experiments', () => {
    expect(pickShardExperiments([])).toEqual([]);
  });
});

describe('mergeShardDatasets', () => {
  const ds = (
    datasetId: string,
    evaluatorName: string,
    mean: number,
    count: number
  ): AggregatedDatasetScores => ({
    datasetId,
    datasetName: datasetId,
    evaluators: [{ evaluatorName, mean, count }],
  });

  it('combines disjoint datasets from different shards', () => {
    const merged = mergeShardDatasets([
      [ds('prefix:alerts', 'Factuality', 8, 6)],
      [ds('prefix:hunting', 'Factuality', 6, 5)],
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.map((d) => d.datasetId).sort()).toEqual(['prefix:alerts', 'prefix:hunting']);
  });

  it('weights the mean by count when shards share a dataset', () => {
    // 6 examples at 8 and 4 examples at 3 is 6.0, NOT the 5.5 a naive
    // mean-of-means would report.
    const merged = mergeShardDatasets([
      [ds('prefix:alerts', 'Factuality', 8, 6)],
      [ds('prefix:alerts', 'Factuality', 3, 4)],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].evaluators).toHaveLength(1);
    expect(merged[0].evaluators[0].count).toBe(10);
    expect(merged[0].evaluators[0].mean).toBeCloseTo(6.0, 10);
  });

  it('keeps distinct evaluators of a shared dataset separate', () => {
    const merged = mergeShardDatasets([
      [ds('prefix:alerts', 'Factuality', 8, 6)],
      [ds('prefix:alerts', 'Groundedness', 4, 6)],
    ]);

    expect(merged).toHaveLength(1);
    const names = merged[0].evaluators.map((e) => e.evaluatorName).sort();
    expect(names).toEqual(['Factuality', 'Groundedness']);
  });

  it('carries min/max across shards', () => {
    const merged = mergeShardDatasets([
      [
        {
          datasetId: 'd',
          datasetName: 'd',
          evaluators: [{ evaluatorName: 'F', mean: 8, count: 2, min: 7, max: 9 }],
        },
      ],
      [
        {
          datasetId: 'd',
          datasetName: 'd',
          evaluators: [{ evaluatorName: 'F', mean: 4, count: 2, min: 1, max: 5 }],
        },
      ],
    ]);

    expect(merged[0].evaluators[0].min).toBe(1);
    expect(merged[0].evaluators[0].max).toBe(9);
  });

  it('ignores a shard that produced no datasets', () => {
    const merged = mergeShardDatasets([[ds('prefix:alerts', 'Factuality', 8, 6)], []]);

    expect(merged).toHaveLength(1);
    expect(merged[0].evaluators[0].count).toBe(6);
  });

  it('returns nothing when every shard is empty', () => {
    expect(mergeShardDatasets([[], []])).toEqual([]);
  });

  it('does not mutate its input', () => {
    const shard = [ds('prefix:alerts', 'Factuality', 8, 6)];
    mergeShardDatasets([shard, [ds('prefix:alerts', 'Factuality', 2, 2)]]);

    expect(shard[0].evaluators[0].mean).toBe(8);
    expect(shard[0].evaluators[0].count).toBe(6);
  });
});
