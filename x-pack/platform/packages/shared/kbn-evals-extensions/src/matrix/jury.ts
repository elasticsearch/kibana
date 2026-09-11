/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { classifyFamily, type ModelFamily } from './judge_provenance';

/**
 * Jury scoring: combine several judges' verdicts on the SAME candidate output
 * into one score plus an explicit measure of how much they disagreed.
 *
 * Why a median and not a mean: a single judge that fails to parse an output and
 * returns 0 drags a mean of three from ~0.9 to ~0.6, which is indistinguishable
 * from a genuine quality problem. The median of three ignores one outlier
 * entirely, so a lone broken judge cannot move the published number.
 *
 * Why cap per family: with five Anthropic judges and one Google judge, a
 * "panel" is really one family voting six times. Capping the contribution of
 * each family keeps the panel from inheriting a single family's idiosyncrasies.
 */

export interface JuryVote {
  judgeId: string;
  score: number;
  /** Categorical verdict, when the evaluator emits one. */
  verdict?: string;
}

export interface JuryOptions {
  /**
   * Maximum votes counted from any one model family. Extra votes from an
   * over-represented family are dropped (lowest-variance-first is not worth the
   * complexity; we drop from the end of the family's vote list).
   * Defaults to 1 — one vote per family.
   */
  maxVotesPerFamily?: number;
  /**
   * Minimum number of counted votes for the result to be considered decided.
   * Defaults to 2.
   */
  minVotes?: number;
}

export interface JuryResult {
  /** Median of the counted votes; null when there were not enough votes. */
  score: number | null;
  /** Votes actually counted after per-family capping. */
  counted: JuryVote[];
  /** Votes discarded because their family was already at its cap. */
  dropped: JuryVote[];
  /** max - min across counted votes. 0 means unanimous. */
  disagreement: number;
  /** True when every counted vote carries the same categorical verdict. */
  verdictUnanimous: boolean;
  /** Distinct families represented among counted votes. */
  families: ModelFamily[];
  /** False when fewer than `minVotes` votes were available. */
  decided: boolean;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Aggregate a panel's votes on one cell.
 *
 * Votes with a non-finite score are discarded before anything else: a judge
 * that errored should not be able to vote, and letting NaN through would
 * silently poison the median.
 */
export function aggregateJury(votes: JuryVote[], options: JuryOptions = {}): JuryResult {
  const maxPerFamily = Math.max(1, options.maxVotesPerFamily ?? 1);
  const minVotes = Math.max(1, options.minVotes ?? 2);

  const usable = votes.filter((v) => Number.isFinite(v.score));
  const perFamily = new Map<ModelFamily, number>();
  const counted: JuryVote[] = [];
  const dropped: JuryVote[] = [];

  for (const vote of usable) {
    const family = classifyFamily(vote.judgeId);
    const used = perFamily.get(family) ?? 0;
    if (used < maxPerFamily) {
      perFamily.set(family, used + 1);
      counted.push(vote);
    } else {
      dropped.push(vote);
    }
  }

  if (counted.length === 0) {
    return {
      score: null,
      counted,
      dropped,
      disagreement: 0,
      verdictUnanimous: false,
      families: [],
      decided: false,
    };
  }

  const scores = counted.map((v) => v.score);
  const verdicts = counted.map((v) => v.verdict).filter((v): v is string => v !== undefined);

  return {
    score: median(scores),
    counted,
    dropped,
    disagreement: Math.max(...scores) - Math.min(...scores),
    verdictUnanimous: verdicts.length > 0 && new Set(verdicts).size === 1,
    families: [...new Set(counted.map((v) => classifyFamily(v.judgeId)))].sort(),
    decided: counted.length >= minVotes,
  };
}

/**
 * An ordinal ladder over a judge's categorical verdict.
 *
 * Measured on the persona matrix: scoring Groundedness by its summary verdict
 * flips across identical repetitions 51.9% of the time, versus 90.4% for the
 * geometric mean over a claim list the judge re-extracts each run. The verdict
 * is the more reproducible instrument, so it is the one worth ranking on.
 */
export type VerdictLadder = Record<string, number>;

export const GROUNDEDNESS_LADDER: VerdictLadder = {
  GROUNDED: 1,
  GROUNDED_WITH_DISCLOSURE: 0.85,
  MINOR_HALLUCINATIONS: 0.5,
  MAJOR_HALLUCINATIONS: 0,
};

export const FACTUALITY_LADDER: VerdictLadder = {
  ACCURATE: 1,
  MINOR_INACCURACIES: 0.5,
  MAJOR_INACCURACIES: 0,
};

export const RELEVANCE_LADDER: VerdictLadder = {
  RELEVANT: 1,
  PARTIALLY_RELEVANT: 0.5,
  IRRELEVANT: 0,
};

/**
 * Verdict ladders keyed by evaluator name, for callers mapping stored score
 * documents. Evaluators absent from this map have no verdict vocabulary and
 * keep their continuous score.
 */
export const VERDICT_LADDERS: Record<string, VerdictLadder> = {
  Groundedness: GROUNDEDNESS_LADDER,
  Factuality: FACTUALITY_LADDER,
  Relevance: RELEVANCE_LADDER,
};

/**
 * Map a categorical verdict onto its ordinal score.
 *
 * Returns null for an unrecognised verdict rather than guessing: an unknown
 * verdict string means the judge returned something the ladder was not built
 * for, and scoring it as 0 would look like a failing answer.
 */
export function scoreVerdict(
  verdict: string | undefined | null,
  ladder: VerdictLadder
): number | null {
  const key = String(verdict ?? '')
    .trim()
    .toUpperCase();
  if (!key) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(ladder, key) ? ladder[key] : null;
}
