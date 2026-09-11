/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationScoreDocument } from '@kbn/evals-common';

/** One evaluator's outcome for one example, in one sweep. */
export interface StabilityCell {
  model: string;
  example: string;
  evaluator: string;
  /** Mean score across whatever repetitions that sweep ran. */
  score: number;
  /** How many repetitions produced `score`. 1 means the value is a single sample. */
  repetitions: number;
}

/** A cell whose score moved between two sweeps of the same suite. */
export interface StabilityFlip {
  model: string;
  example: string;
  evaluator: string;
  before: number;
  after: number;
  delta: number;
  /** True when neither side had more than one repetition backing it. */
  singleSampled: boolean;
}

export interface StabilityDiff {
  flips: StabilityFlip[];
  /** Cells present in both sweeps with identical scores. */
  unchanged: number;
  /** Cells that exist in only one of the two sweeps. */
  onlyBefore: number;
  onlyAfter: number;
}

const cellKey = (c: { model: string; example: string; evaluator: string }) =>
  `${c.model}\u0000${c.example}\u0000${c.evaluator}`;

/**
 * Collapse raw score documents into one cell per (model, example, evaluator),
 * averaging over repetitions. Exported for unit testing.
 */
export const toCells = (docs: EvaluationScoreDocument[]): Map<string, StabilityCell> => {
  const acc = new Map<string, { sum: number; n: number; cell: StabilityCell }>();
  for (const doc of docs) {
    const evaluator = doc.evaluator?.name;
    const score = doc.evaluator?.score;
    const example = doc.example?.id;
    const model = (doc as { task?: { model?: { id?: string } } }).task?.model?.id;
    if (!evaluator || !example || !model || typeof score !== 'number') {
      continue;
    }
    const cell: StabilityCell = { model, example, evaluator, score: 0, repetitions: 0 };
    const key = cellKey(cell);
    const prev = acc.get(key) ?? { sum: 0, n: 0, cell };
    prev.sum += score;
    prev.n += 1;
    acc.set(key, prev);
  }
  return new Map(
    [...acc.entries()].map(([key, { sum, n, cell }]) => [
      key,
      { ...cell, score: sum / n, repetitions: n },
    ])
  );
};

/**
 * Compare two sweeps of the same suite and report every cell whose score moved.
 *
 * This is the guard against silent drift: a model that scored 21/21 last sweep
 * and 19/21 this sweep looks fine in isolation on both, and the regression is
 * only visible by diffing them. `singleSampled` marks flips where neither side
 * had repetitions behind it — those are as likely to be run-to-run noise as a
 * real regression, and should be re-run at a higher repetition tier before
 * anyone treats them as a finding.
 *
 * `tolerance` ignores moves at or below its size, for graded judge evaluators
 * that wobble by fractions without changing any conclusion.
 */
export const diffStability = (
  before: EvaluationScoreDocument[],
  after: EvaluationScoreDocument[],
  { tolerance = 0 }: { tolerance?: number } = {}
): StabilityDiff => {
  const a = toCells(before);
  const b = toCells(after);

  const flips: StabilityFlip[] = [];
  let unchanged = 0;
  let onlyBefore = 0;

  for (const [key, cellA] of a) {
    const cellB = b.get(key);
    if (!cellB) {
      onlyBefore += 1;
      continue;
    }
    const delta = cellB.score - cellA.score;
    if (Math.abs(delta) <= tolerance) {
      unchanged += 1;
      continue;
    }
    flips.push({
      model: cellA.model,
      example: cellA.example,
      evaluator: cellA.evaluator,
      before: cellA.score,
      after: cellB.score,
      delta,
      singleSampled: cellA.repetitions <= 1 && cellB.repetitions <= 1,
    });
  }

  let onlyAfter = 0;
  for (const key of b.keys()) {
    if (!a.has(key)) {
      onlyAfter += 1;
    }
  }

  // Largest regressions first — that is what a reader needs to triage.
  flips.sort((x, y) => x.delta - y.delta);

  return { flips, unchanged, onlyBefore, onlyAfter };
};
