/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Merging re-judged scores back onto a golden board.
 *
 * A rejudge run grades an existing set of model outputs with a different judge.
 * It produces an artifact, not a golden write: the scores live in a local JSON
 * file and the published board still shows whatever judge originally graded
 * those cells. This module is the missing step — it decides, deterministically
 * and without touching the network, which golden cells a rejudge artifact
 * replaces.
 *
 * The merge is keyed on `experiment_id` because that is the only field that
 * identifies the *run* whose outputs were re-graded. Keying on model id alone
 * would let a rejudge of one execution silently overwrite a different (possibly
 * newer) execution of the same model.
 */

/** One re-graded cell, as produced by a rejudge run. */
export interface RejudgedCell {
  /** The golden execution whose outputs were re-graded. */
  experimentId: string;
  /** Dataset/column key within that execution. */
  datasetId: string;
  evaluatorName: string;
  /** The re-computed score. */
  score: number;
  /** The judge that produced `score`. */
  judgeModelId: string;
}

/** One existing golden cell, as read off the published board. */
export interface GoldenCell {
  experimentId: string;
  datasetId: string;
  evaluatorName: string;
  score: number;
  judgeModelId?: string;
}

export interface MergeOutcome {
  /** The merged board: same length and order as the input `golden`. */
  cells: GoldenCell[];
  /** Cells whose score/judge were replaced by a re-judged value. */
  replaced: number;
  /**
   * Re-judged cells that matched no golden cell. These are NOT appended: a
   * rejudge can only re-grade outputs that already exist on the board, so a
   * non-matching cell means the artifact and the board disagree about what was
   * run, and silently adding it would fabricate a cell the board never had.
   */
  unmatched: RejudgedCell[];
}

const keyOf = (c: { experimentId: string; datasetId: string; evaluatorName: string }): string =>
  `${c.experimentId}\u0000${c.datasetId}\u0000${c.evaluatorName}`;

/**
 * Apply a rejudge artifact to a golden board.
 *
 * Pure and order-preserving: the caller decides whether to persist the result.
 * Cells the rejudge did not cover are returned untouched, so a partial rejudge
 * (the common case — a rejudge usually covers one column) leaves the rest of
 * the board exactly as it was.
 */
export function mergeRejudgedScores(golden: GoldenCell[], rejudged: RejudgedCell[]): MergeOutcome {
  const byKey = new Map<string, RejudgedCell>();
  for (const cell of rejudged) {
    // Last write wins within a single artifact: a rejudge that graded the same
    // cell twice has no principled tie-break, and taking the last keeps the
    // merge deterministic for a given artifact ordering.
    byKey.set(keyOf(cell), cell);
  }

  const consumed = new Set<string>();
  let replaced = 0;

  const cells = golden.map((cell) => {
    const key = keyOf(cell);
    const update = byKey.get(key);
    if (!update) return cell;

    consumed.add(key);
    replaced += 1;
    return {
      ...cell,
      score: update.score,
      judgeModelId: update.judgeModelId,
    };
  });

  const unmatched = rejudged.filter((cell) => !consumed.has(keyOf(cell)));

  return { cells, replaced, unmatched };
}
