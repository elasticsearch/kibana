/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MatrixColumnConfig, MatrixConfig, MatrixModelConfig } from './load_matrix_config';
import type { AggregatedModelScores } from './query_matrix_scores';

/** A single matrix cell: either a numeric 0-10 score or "Not recommended". */
export type MatrixCell =
  | { kind: 'score'; value: number }
  | { kind: 'not-recommended' }
  | { kind: 'missing' };

export interface MatrixRow {
  modelId: string;
  modelLabel: string;
  openSource: boolean;
  /** Column id -> cell. */
  cells: Record<string, MatrixCell>;
  overall: MatrixCell;
}

export interface Matrix {
  columns: Array<{ id: string; label: string }>;
  overallLabel: string;
  proprietary: MatrixRow[];
  openSource: MatrixRow[];
}

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const matchesModel = (modelConfig: MatrixModelConfig, modelId: string): boolean =>
  modelConfig.id === modelId || (modelConfig.matchIds?.includes(modelId) ?? false);

/** True when an evaluator name matches any exclusion entry by prefix. */
const isExcludedEvaluator = (evaluatorName: string, excluded: readonly string[]): boolean =>
  excluded.some((entry) => evaluatorName === entry || evaluatorName.startsWith(entry));

/**
 * Computes the weighted mean (by sample count) of the evaluator scores that map
 * to a column for a given model. Returns `undefined` when no scores contribute.
 */
const computeColumnMean = (
  modelScores: AggregatedModelScores,
  column: MatrixColumnConfig,
  excludeEvaluators: readonly string[]
): number | undefined => {
  const suiteSet = new Set(column.suites);
  const datasetSet = column.datasetIds ? new Set(column.datasetIds) : undefined;
  const evaluatorSet = column.evaluators ? new Set(column.evaluators) : undefined;

  let weightedSum = 0;
  let totalCount = 0;
  let contributing = 0;

  for (const suite of modelScores.suites) {
    if (!suiteSet.has(suite.suiteId)) {
      continue;
    }
    for (const dataset of suite.datasets) {
      if (datasetSet && !datasetSet.has(dataset.datasetId)) {
        continue;
      }
      for (const evaluator of dataset.evaluators) {
        if (evaluatorSet && !evaluatorSet.has(evaluator.evaluatorName)) {
          continue;
        }
        // A column may opt into an explicit evaluator allowlist; otherwise the
        // global exclusion list (observability-tier evaluators by default) drops
        // raw-magnitude evaluators that would blow out the 0-10 scale.
        if (!evaluatorSet && isExcludedEvaluator(evaluator.evaluatorName, excludeEvaluators)) {
          continue;
        }
        // Weight by sample count so larger datasets dominate, but fall back to an
        // unweighted contribution when a dataset reports a zero count.
        const weight = evaluator.count > 0 ? evaluator.count : 1;
        weightedSum += evaluator.mean * weight;
        totalCount += weight;
        contributing += 1;
      }
    }
  }

  if (contributing === 0 || totalCount === 0) {
    return undefined;
  }

  return weightedSum / totalCount;
};

const buildCell = (
  mean: number | undefined,
  column: MatrixColumnConfig,
  config: MatrixConfig
): MatrixCell => {
  if (mean === undefined) {
    return { kind: 'missing' };
  }

  const scale = column.scale ?? config.defaultScale;
  const scaled = roundTo(mean * scale, config.decimals);

  if (scaled <= config.notRecommendedBelow) {
    return { kind: 'not-recommended' };
  }

  return { kind: 'score', value: scaled };
};

const computeOverall = (cells: Record<string, MatrixCell>, config: MatrixConfig): MatrixCell => {
  let weightedSum = 0;
  let totalWeight = 0;
  let hasAnyData = false;

  for (const column of config.columns) {
    const cell = cells[column.id];
    if (!cell || cell.kind === 'missing') {
      continue;
    }

    hasAnyData = true;
    const weight = config.overall.mode === 'weighted' ? column.weight : 1;

    if (cell.kind === 'not-recommended') {
      if (config.notRecommendedCountsAsZeroInOverall) {
        totalWeight += weight;
      }
      continue;
    }

    weightedSum += cell.value * weight;
    totalWeight += weight;
  }

  if (!hasAnyData || totalWeight === 0) {
    return { kind: 'missing' };
  }

  const value = roundTo(weightedSum / totalWeight, config.decimals);
  if (value <= config.notRecommendedBelow) {
    return { kind: 'not-recommended' };
  }
  return { kind: 'score', value };
};

/**
 * Pure transform from aggregated eval scores + config into a renderable matrix.
 * Models are emitted in config order; models absent from the data are skipped.
 */
export const buildMatrix = (aggregated: AggregatedModelScores[], config: MatrixConfig): Matrix => {
  const byModelId = new Map(aggregated.map((entry) => [entry.modelId, entry]));

  const proprietary: MatrixRow[] = [];
  const openSource: MatrixRow[] = [];

  for (const modelConfig of config.models) {
    const modelScores =
      byModelId.get(modelConfig.id) ??
      aggregated.find((entry) => matchesModel(modelConfig, entry.modelId));

    if (!modelScores) {
      continue;
    }

    const cells: Record<string, MatrixCell> = {};
    for (const column of config.columns) {
      cells[column.id] = buildCell(
        computeColumnMean(modelScores, column, config.excludeEvaluators),
        column,
        config
      );
    }

    const row: MatrixRow = {
      modelId: modelConfig.id,
      modelLabel: modelConfig.label,
      openSource: modelConfig.openSource,
      cells,
      overall: computeOverall(cells, config),
    };

    (modelConfig.openSource ? openSource : proprietary).push(row);
  }

  const sortByOverallDesc = (a: MatrixRow, b: MatrixRow): number => {
    const aValue = a.overall.kind === 'score' ? a.overall.value : -1;
    const bValue = b.overall.kind === 'score' ? b.overall.value : -1;
    return bValue - aValue;
  };

  return {
    columns: config.columns.map((column) => ({ id: column.id, label: column.label })),
    overallLabel: config.overall.label,
    proprietary: proprietary.sort(sortByOverallDesc),
    openSource: openSource.sort(sortByOverallDesc),
  };
};
