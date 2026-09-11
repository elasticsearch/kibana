/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Quantify how much of a matrix column is the model and how much is the judge.
 *
 * A matrix whose columns were each graded by a different judge cannot be
 * ranked: a model's score moves with judge severity, and severity is not
 * constant. Re-judging one common subset of cells with several judges makes
 * the two separable, because every judge sees an identical set of cells.
 *
 * The decomposition that matters:
 *
 *   - OFFSET is a judge's uniform leniency. It shifts every model equally, so
 *     it cancels out of any within-judge ranking and is harmless to ordering.
 *   - RESIDUAL is what is left once the offset is removed: per-cell
 *     disagreement that moves models relative to each other. This is what
 *     reorders a board.
 *
 * A ranking is only trustworthy when residual disagreement is small relative
 * to the spread between the models being ranked. Comparing residual against
 * model spread is therefore the headline output, not the raw judge means --
 * two judges can differ wildly in mean while agreeing perfectly on order.
 */

export interface OverlapCellScore {
  /** Real model id. Blind runs alias this, so callers must de-anonymize first. */
  modelId: string;
  exampleId: string;
  /** Mean of the evaluator scores for this cell, already normalized to 0..1. */
  score: number;
}

export interface JudgeOverlapInput {
  judgeId: string;
  cells: OverlapCellScore[];
}

export interface JudgeSeverity {
  judgeId: string;
  mean: number;
  /** Uniform leniency relative to the mean judge. Cancels in ranking. */
  offset: number;
}

export interface JudgeOverlapReport {
  /** Cells graded by every judge. Anything less is not a fair comparison. */
  commonCellCount: number;
  models: string[];
  judges: string[];
  severities: JudgeSeverity[];
  /** Per-model mean under each judge, keyed by model then judge. */
  perModel: Record<string, Record<string, number>>;
  /** Best->worst model order under each judge. */
  rankings: Record<string, string[]>;
  /** Mean/median/p90 of per-cell judge disagreement after offsets are removed. */
  residual: { mean: number; median: number; p90: number };
  /** Widest gap between model means under the same judge. */
  modelSpread: number;
  /**
   * True when residual disagreement is smaller than the spread it must
   * resolve. When false, the board orders judges rather than models and no
   * ranking below the top slot should be published.
   */
  rankable: boolean;
  /** Models holding the same rank under every judge -- the robust claims. */
  stableRanks: Array<{ modelId: string; rank: number }>;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

const quantile = (xs: number[], q: number): number => {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
};

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** NUL cannot occur in a model or example id, so it cannot collide. */
const SEP = '\u0000';
const cellKey = (c: { modelId: string; exampleId: string }): string =>
  `${c.modelId}${SEP}${c.exampleId}`;

/**
 * Compare judges over the cells they all graded.
 *
 * Cells missing from any judge are dropped rather than imputed: a judge that
 * failed on the hard cells would otherwise look lenient purely from absence,
 * which is the exact confound this analysis exists to remove.
 */
export function analyzeJudgeOverlap(inputs: JudgeOverlapInput[]): JudgeOverlapReport {
  if (inputs.length < 2) {
    throw new Error(
      `Judge overlap needs at least 2 judges to separate judge effect from model effect; got ${inputs.length}.`
    );
  }

  const byJudge = new Map<string, Map<string, OverlapCellScore>>();
  for (const input of inputs) {
    const m = new Map<string, OverlapCellScore>();
    for (const cell of input.cells) m.set(cellKey(cell), cell);
    byJudge.set(input.judgeId, m);
  }

  const judges = inputs.map((i) => i.judgeId);
  const [firstJudge, ...restJudges] = judges;
  const commonKeys = [...byJudge.get(firstJudge)!.keys()].filter((k) =>
    restJudges.every((j) => byJudge.get(j)!.has(k))
  );

  if (commonKeys.length === 0) {
    throw new Error(
      `No cell was graded by all ${judges.length} judges, so judge severity and model quality cannot be separated.`
    );
  }

  const scoreOf = (judgeId: string, key: string) => byJudge.get(judgeId)!.get(key)!.score;
  const meansByJudge = new Map(
    judges.map((judgeId) => [judgeId, mean(commonKeys.map((k) => scoreOf(judgeId, k)))])
  );
  const grandMean = mean([...meansByJudge.values()]);
  const severities: JudgeSeverity[] = judges.map((judgeId) => ({
    judgeId,
    mean: meansByJudge.get(judgeId)!,
    offset: meansByJudge.get(judgeId)! - grandMean,
  }));

  const keysByModel = new Map<string, string[]>();
  for (const key of commonKeys) {
    const modelId = key.split(SEP)[0];
    keysByModel.set(modelId, [...(keysByModel.get(modelId) ?? []), key]);
  }
  const models = [...keysByModel.keys()].sort();

  const perModel: Record<string, Record<string, number>> = {};
  for (const modelId of models) {
    const keys = keysByModel.get(modelId)!;
    perModel[modelId] = Object.fromEntries(
      judges.map((judgeId) => [judgeId, mean(keys.map((k) => scoreOf(judgeId, k)))])
    );
  }

  const rankings: Record<string, string[]> = {};
  for (const judgeId of judges) {
    rankings[judgeId] = [...models].sort((a, b) => perModel[b][judgeId] - perModel[a][judgeId]);
  }

  // Residual: strip each judge's uniform offset, then measure what disagreement
  // survives on each cell. Offsets are removed first precisely because they do
  // not reorder anything.
  const offsetOf = new Map(severities.map((s) => [s.judgeId, s.offset]));
  const perCellSpread = commonKeys.map((k) => {
    const adjusted = judges.map((j) => scoreOf(j, k) - offsetOf.get(j)!);
    return Math.max(...adjusted) - Math.min(...adjusted);
  });

  const modelMeansPerJudge = judges.map((j) => models.map((m) => perModel[m][j]));
  const modelSpread = Math.max(
    ...modelMeansPerJudge.map((ms) => Math.max(...ms) - Math.min(...ms))
  );

  const residual = {
    mean: mean(perCellSpread),
    median: median(perCellSpread),
    p90: quantile(perCellSpread, 0.9),
  };

  const stableRanks: Array<{ modelId: string; rank: number }> = [];
  for (const modelId of models) {
    const ranks = judges.map((j) => rankings[j].indexOf(modelId));
    if (new Set(ranks).size === 1) stableRanks.push({ modelId, rank: ranks[0] + 1 });
  }

  return {
    commonCellCount: commonKeys.length,
    models,
    judges,
    severities,
    perModel,
    rankings,
    residual,
    modelSpread,
    rankable: residual.mean < modelSpread,
    stableRanks: stableRanks.sort((a, b) => a.rank - b.rank),
  };
}

/**
 * Recover the real model id from a blind rejudge result.
 *
 * Blind runs replace `modelId` with an alias so the judge cannot recognize the
 * contestant, but `sourceExecutionId` keeps the original coordinates. Reading
 * the alias instead would group every model under "Model A".
 */
export function realModelIdFromSourceExecution(sourceExecutionId: string): string {
  const parts = sourceExecutionId.split('::');
  if (parts.length < 3) {
    throw new Error(
      `Cannot recover a model id from executionId "${sourceExecutionId}"; expected <sweep>::<suite>::<model>.`
    );
  }
  return parts[2];
}
