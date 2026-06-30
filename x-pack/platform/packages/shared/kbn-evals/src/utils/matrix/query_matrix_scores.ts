/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SomeDevLog } from '@kbn/some-dev-log';
import type { EvaluationExperimentSummary } from '@kbn/evals-common';
import type { EvalsClient, ExperimentStats } from '../evals_client';

/** Aggregated evaluator score for a single dataset within a suite. */
export interface AggregatedEvaluatorScore {
  evaluatorName: string;
  mean: number;
  count: number;
}

export interface AggregatedDatasetScores {
  datasetId: string;
  datasetName: string;
  evaluators: AggregatedEvaluatorScore[];
}

export interface AggregatedSuiteScores {
  suiteId: string;
  experimentId: string;
  timestamp?: string;
  datasets: AggregatedDatasetScores[];
}

export interface AggregatedModelScores {
  modelId: string;
  family?: string;
  provider?: string;
  suites: AggregatedSuiteScores[];
}

export interface QueryMatrixScoresOptions {
  suiteIds: string[];
  branch?: string;
  lookbackDays?: number;
}

/**
 * Selects, per task model, the most recent experiment from a list (typically all
 * experiments for one suite). Experiments without a model id or timestamp older
 * than the lookback window are ignored. Pure for unit testing.
 */
export const pickLatestExperimentPerModel = (
  experiments: EvaluationExperimentSummary[],
  { lookbackDays, now = Date.now() }: { lookbackDays?: number; now?: number } = {}
): Map<string, EvaluationExperimentSummary> => {
  const cutoff = lookbackDays ? now - lookbackDays * 24 * 60 * 60 * 1000 : undefined;
  const latestByModel = new Map<string, EvaluationExperimentSummary>();

  for (const experiment of experiments) {
    const modelId = experiment.task_model?.id;
    if (!modelId) {
      continue;
    }

    const timestampMs = Date.parse(experiment.timestamp);
    if (cutoff !== undefined && Number.isFinite(timestampMs) && timestampMs < cutoff) {
      continue;
    }

    const existing = latestByModel.get(modelId);
    if (!existing || Date.parse(experiment.timestamp) > Date.parse(existing.timestamp)) {
      latestByModel.set(modelId, experiment);
    }
  }

  return latestByModel;
};

/**
 * Converts the per-experiment stats returned by the evals plugin into the
 * dataset-grouped structure consumed by the matrix builder. Pure for testing.
 */
export const experimentStatsToDatasets = (stats: ExperimentStats): AggregatedDatasetScores[] => {
  const byDataset = new Map<string, AggregatedDatasetScores>();

  for (const stat of stats.stats) {
    let dataset = byDataset.get(stat.datasetId);
    if (!dataset) {
      dataset = { datasetId: stat.datasetId, datasetName: stat.datasetName, evaluators: [] };
      byDataset.set(stat.datasetId, dataset);
    }
    dataset.evaluators.push({
      evaluatorName: stat.evaluatorName,
      mean: stat.stats.mean,
      count: stat.stats.count,
    });
  }

  return [...byDataset.values()];
};

/**
 * Queries the evals plugin for the latest experiment per (model, suite) and
 * returns mean evaluator scores grouped by dataset, ready for `buildMatrix`.
 */
export const queryMatrixScores = async (
  evalsClient: EvalsClient,
  log: SomeDevLog,
  { suiteIds, branch, lookbackDays }: QueryMatrixScoresOptions
): Promise<AggregatedModelScores[]> => {
  const byModel = new Map<string, AggregatedModelScores>();

  for (const suiteId of suiteIds) {
    const experiments = await evalsClient.listExperiments({ suiteId, branch });
    const latestByModel = pickLatestExperimentPerModel(experiments, { lookbackDays });

    log.debug(
      `Suite ${suiteId}: ${experiments.length} experiment(s), ${latestByModel.size} model(s) after latest+lookback selection`
    );

    for (const [modelId, experiment] of latestByModel) {
      // The experiments listing returns `execution_id` as its grouping key; the
      // detail/stats route must be filtered by execution_id (+ suite + model),
      // since a bare experiment_id path lookup targets a different field and 404s.
      const stats = await evalsClient.getExperimentStats(experiment.experiment_id, {
        suiteId,
        taskModelId: modelId,
        executionId: experiment.execution_id ?? experiment.experiment_id,
      });
      if (!stats) {
        log.warning(
          `No stats for experiment ${experiment.experiment_id} (suite ${suiteId}, model ${modelId})`
        );
        continue;
      }

      let model = byModel.get(modelId);
      if (!model) {
        model = {
          modelId,
          family: experiment.task_model?.family,
          provider: experiment.task_model?.provider,
          suites: [],
        };
        byModel.set(modelId, model);
      }

      model.suites.push({
        suiteId,
        experimentId: experiment.experiment_id,
        timestamp: experiment.timestamp,
        datasets: experimentStatsToDatasets(stats),
      });
    }
  }

  log.debug(`Matrix query resolved ${byModel.size} model(s) across ${suiteIds.length} suite(s)`);
  return [...byModel.values()];
};
