/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationExperimentSummary } from '@kbn/evals-common';
import type { AggregatedDatasetScores } from './query_matrix_scores';

/**
 * A sharded sweep runs one model on several VMs, each covering a stride of the
 * dataset and writing its OWN execution_id (`<base>-s<i>of<n>::<suite>::<model>`).
 *
 * Picking only the newest experiment per model therefore renders a single
 * shard and blanks every example the other shards covered. These helpers keep
 * all shards of one sweep and fold their scores into a single row.
 */

/** `sweep-123-s2of4::suite::model` -> `sweep-123`. Undefined when unsharded. */
const shardBase = (executionId: string | undefined): string | undefined => {
  if (!executionId) {
    return undefined;
  }
  const runId = executionId.split('::')[0];
  const match = /^(.*)-s\d+of\d+$/.exec(runId);
  return match ? match[1] : undefined;
};

/**
 * Returns every experiment belonging to the newest sweep for these inputs.
 *
 * Shards of one sweep share a base run id, so recency is decided per SWEEP
 * rather than per experiment -- shards finish at different times and comparing
 * them individually would drop the slower ones. An unsharded run has no base
 * and is returned alone, preserving existing behaviour.
 */
export const pickShardExperiments = (
  experiments: EvaluationExperimentSummary[]
): EvaluationExperimentSummary[] => {
  if (experiments.length === 0) {
    return [];
  }

  const bySweep = new Map<string, { members: EvaluationExperimentSummary[]; at: number }>();

  for (const candidate of experiments) {
    const base = shardBase(candidate.execution_id);
    // Unsharded runs are their own group, keyed by execution id so two of them
    // never merge into one another.
    const key = base ?? `unsharded:${candidate.execution_id ?? candidate.experiment_id}`;
    const at = Date.parse(candidate.timestamp);
    if (!Number.isFinite(at)) {
      continue;
    }

    const group = bySweep.get(key);
    if (!group) {
      bySweep.set(key, { members: [candidate], at });
      continue;
    }
    group.members.push(candidate);
    // A sweep is as recent as its LAST finishing shard.
    group.at = Math.max(group.at, at);
  }

  const newest = [...bySweep.values()].reduce<{
    members: EvaluationExperimentSummary[];
    at: number;
  } | null>((best, group) => (!best || group.at > best.at ? group : best), null);

  if (!newest) {
    return [];
  }

  return [...newest.members].sort((a, b) =>
    (a.execution_id ?? '').localeCompare(b.execution_id ?? '')
  );
};

/**
 * Folds per-shard dataset scores into one set.
 *
 * Means are combined WEIGHTED BY COUNT. Averaging the shard means directly
 * would misreport any sweep whose shards cover different numbers of examples
 * -- and stride sharding produces exactly that (21 examples over 2 shards is
 * 11 and 10).
 */
export const mergeShardDatasets = (
  shards: AggregatedDatasetScores[][]
): AggregatedDatasetScores[] => {
  const byDataset = new Map<
    string,
    {
      datasetId: string;
      datasetName: string;
      evaluators: Map<
        string,
        { sum: number; count: number; min: number | undefined; max: number | undefined }
      >;
    }
  >();

  for (const shard of shards) {
    for (const dataset of shard) {
      let entry = byDataset.get(dataset.datasetId);
      if (!entry) {
        entry = {
          datasetId: dataset.datasetId,
          datasetName: dataset.datasetName,
          evaluators: new Map(),
        };
        byDataset.set(dataset.datasetId, entry);
      }

      for (const evaluator of dataset.evaluators) {
        const agg = entry.evaluators.get(evaluator.evaluatorName) ?? {
          sum: 0,
          count: 0,
          min: undefined,
          max: undefined,
        };
        // Reconstruct the score total from mean x count so the combined mean
        // stays weighted.
        agg.sum += evaluator.mean * evaluator.count;
        agg.count += evaluator.count;
        agg.min =
          evaluator.min === undefined ? agg.min : Math.min(agg.min ?? evaluator.min, evaluator.min);
        agg.max =
          evaluator.max === undefined ? agg.max : Math.max(agg.max ?? evaluator.max, evaluator.max);
        entry.evaluators.set(evaluator.evaluatorName, agg);
      }
    }
  }

  return [...byDataset.values()].map((entry) => ({
    datasetId: entry.datasetId,
    datasetName: entry.datasetName,
    evaluators: [...entry.evaluators.entries()].map(([evaluatorName, agg]) => ({
      evaluatorName,
      mean: agg.count === 0 ? 0 : agg.sum / agg.count,
      count: agg.count,
      ...(agg.min === undefined ? {} : { min: agg.min }),
      ...(agg.max === undefined ? {} : { max: agg.max }),
    })),
  }));
};
