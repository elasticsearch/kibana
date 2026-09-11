/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AggregatedModelScores } from './query_matrix_scores';

/**
 * An evaluator that returns the same value for every model cannot rank models.
 *
 * Measured on the 2026-09-01 golden artifact (20 models x 24 columns): five
 * evaluators sat at or above 0.93 mean with >=90% of cells at the ceiling
 * (MinExpectedSteps 0.970, SkillInvoked 0.980, Sequence Accuracy 0.930,
 * FinalAnswerPresent 0.883, criteria 0.868). Averaged into a cell alongside the
 * evaluators that DO move (Factuality 0.352, ExpectedToolCalled 0.387,
 * Trajectory 0.610), each saturated evaluator takes an equal share of the mean
 * and divides the real differences by the evaluator count -- compressing the
 * published leaderboard range to 1.43 points and making every adjacent pair a
 * statistical tie.
 *
 * A saturated evaluator is a precondition check wearing a score's clothing:
 * "the agent produced a final answer" is a gate, not a measure of quality. It
 * belongs in a setup assertion, or its cases need to get harder until it can
 * fail. Until then, keeping it out of the aggregate is what lets the metrics
 * that carry signal actually show up.
 */
export interface EvaluatorSaturation {
  evaluatorName: string;
  /** Mean across models, normalized by the observed maximum (0-1). */
  mean: number;
  /** Population stdev of the normalized model means -- the ranking signal. */
  stdev: number;
  /** max - min of the normalized model means. */
  range: number;
  /** Distinct model-level means observed -- 1 means literally no discrimination. */
  distinctValues: number;
  /** Number of model-level observations backing the verdict. */
  observations: number;
  saturated: boolean;
}

export interface SaturationPolicy {
  /** Minimum normalized mean to qualify: only high scorers can be "at ceiling". */
  minMean: number;
  /** Maximum normalized spread (max-min) to qualify as non-discriminating. */
  maxRange: number;
  /** Below this many observations the verdict is not trustworthy. */
  minObservations: number;
}

/**
 * Thresholds derived from the 2026-09-01 golden artifact, where the gap is
 * unambiguous: the five non-ranking evaluators span 0.095-0.198 normalized
 * range, and the next evaluator up (criteria) jumps to 0.298. 0.25 sits in
 * that gap. minMean 0.85 keeps genuinely-hard evaluators (Factuality 0.626,
 * ExpectedToolCalled 0.430) in the aggregate no matter how tightly they cluster.
 */
export const DEFAULT_SATURATION_POLICY: SaturationPolicy = {
  minMean: 0.85,
  maxRange: 0.25,
  minObservations: 8,
};

const EPSILON = 1e-9;

/**
 * Collects every model-level mean per evaluator. Deliberately uses the
 * per-model aggregate rather than raw score docs: the question is "can this
 * evaluator separate MODELS", and a metric can vary across examples while
 * still landing every model on the same number.
 */
const collectByEvaluator = (models: readonly AggregatedModelScores[]): Map<string, number[]> => {
  const byEvaluator = new Map<string, number[]>();
  for (const model of models) {
    // Per-model weighted mean first: a model evaluated on 20 datasets must not
    // outvote a model evaluated on 2 when deciding whether the EVALUATOR can
    // separate models. Collapsing to one observation per model keeps the
    // verdict about ranking power rather than about dataset coverage.
    const perModel = new Map<string, { weightedSum: number; weight: number }>();
    for (const suite of model.suites ?? []) {
      for (const dataset of suite.datasets ?? []) {
        for (const evaluator of dataset.evaluators ?? []) {
          if (!Number.isFinite(evaluator.mean)) {
            continue;
          }
          const weight = evaluator.count > 0 ? evaluator.count : 1;
          const acc = perModel.get(evaluator.evaluatorName) ?? { weightedSum: 0, weight: 0 };
          acc.weightedSum += evaluator.mean * weight;
          acc.weight += weight;
          perModel.set(evaluator.evaluatorName, acc);
        }
      }
    }
    for (const [evaluatorName, acc] of perModel) {
      if (acc.weight === 0) {
        continue;
      }
      const bucket = byEvaluator.get(evaluatorName);
      if (bucket) {
        bucket.push(acc.weightedSum / acc.weight);
      } else {
        byEvaluator.set(evaluatorName, [acc.weightedSum / acc.weight]);
      }
    }
  }
  return byEvaluator;
};

/**
 * Classifies each evaluator as saturated or discriminating.
 *
 * Normalizes by the observed maximum rather than assuming a 0-1 range: raw
 * magnitude evaluators (Latency, token counts) live on their own scales and
 * would otherwise be judged against a ceiling they never approach.
 */
export const detectSaturatedEvaluators = (
  models: readonly AggregatedModelScores[],
  policy: SaturationPolicy = DEFAULT_SATURATION_POLICY
): EvaluatorSaturation[] => {
  const results: EvaluatorSaturation[] = [];

  for (const [evaluatorName, entries] of collectByEvaluator(models)) {
    const values = entries.filter((v) => Number.isFinite(v));
    if (values.length === 0) {
      continue;
    }

    const max = Math.max(...values);
    const observations = values.length;
    // Quality evaluators are already 0-1, so their ceiling is a fixed 1.0 --
    // normalizing by the observed max would rescale a uniformly-LOW evaluator
    // (every model 0.35) up to 1.0 and misread "consistently hard" as
    // "saturated". Only raw-magnitude evaluators (Latency in seconds, token
    // counts) exceed 1 and need their own scale to be comparable at all.
    const scaleBase = Math.max(1, max);
    const normalized = values.map((v) => v / scaleBase);
    const mean = normalized.reduce((sum, v) => sum + v, 0) / observations;
    const variance = normalized.reduce((sum, v) => sum + (v - mean) ** 2, 0) / observations;
    const stdev = Math.sqrt(variance);
    const range = Math.max(...normalized) - Math.min(...normalized);
    const distinctValues = new Set(values.map((v) => v.toFixed(6))).size;

    // Saturation is about SPREAD at a high level, not about sitting at exactly
    // 1.0. An evaluator scoring every model 0.88-0.90 ranks nothing, even
    // though no single observation is at the ceiling. A tight cluster at a LOW
    // mean is a hard evaluator -- real signal -- and stays in.
    const saturated =
      max > EPSILON &&
      observations >= policy.minObservations &&
      mean >= policy.minMean &&
      range <= policy.maxRange;

    results.push({
      evaluatorName,
      mean,
      stdev,
      range,
      distinctValues,
      observations,
      saturated,
    });
  }

  return results.sort((a, b) => b.mean - a.mean || a.evaluatorName.localeCompare(b.evaluatorName));
};

/** Names of evaluators the policy judges saturated. */
export const saturatedEvaluatorNames = (saturation: readonly EvaluatorSaturation[]): Set<string> =>
  new Set(saturation.filter((entry) => entry.saturated).map((entry) => entry.evaluatorName));
