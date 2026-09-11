/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { wilsonInterval, type ConfidenceInterval } from './trajectory_agreement';

/**
 * One evaluator verdict, identified well enough to pair it with the verdict a
 * different judge produced for the same unit of work.
 */
export interface JudgeVerdict {
  modelId: string;
  judgeId: string;
  example: string;
  repetition: number;
  evaluator: string;
  score: number;
}

export type JudgeAgreementStatus = 'unmeasured' | 'single-judge' | 'measured';

export interface EvaluatorDisagreement {
  evaluator: string;
  flips: number;
  pairs: number;
  interval: ConfidenceInterval;
}

export interface JudgeAgreementRow {
  modelId: string;
  status: JudgeAgreementStatus;
  /** Judges that scored this model at all, whether or not they overlap. */
  judges: string[];
  /** Cells where two judges scored the identical example+rep+evaluator. */
  pairs: number;
  /**
   * Cells the leading judge scored that the other judge did not, so a row built
   * on partial overlap cannot be read as though both judges covered everything.
   * A high value means the agreement figure rests on less evidence than a
   * fully-paired row with the same `pairs` count would.
   */
  unpaired: number;
  /** Pass/fail concordance, the verdict-level view. */
  verdictAgreement?: number;
  interval?: ConfidenceInterval;
  /** Directional bias: mean(judgeA) - mean(judgeB) over paired cells. */
  bias?: number;
  biasJudges?: [string, string];
  worstEvaluators: EvaluatorDisagreement[];
}

/**
 * Cost and latency instruments are recorded as evaluators but are not verdicts.
 * Comparing them across judges measures provider billing, not judgement.
 */
const NON_VERDICT_EVALUATORS = new Set(['Input Tokens', 'Output Tokens', 'Latency', 'Tool Calls']);

/** Scores are 0..1; a verdict is the pass/fail side of the midpoint. */
const passed = (score: number): boolean => score > 0.5;

const cellKey = (v: JudgeVerdict): string =>
  `${v.example}\u0000${v.repetition}\u0000${v.evaluator}`;

/**
 * Pairs verdicts by (example, repetition, evaluator) so the two judges are
 * compared on identical work. Aggregate-vs-aggregate comparison is deliberately
 * not offered: two judges can produce the same mean while disagreeing on every
 * individual case, which is the exact failure this row exists to expose.
 *
 * Only the two judges with the most overlap are compared. A third judge with
 * partial coverage would otherwise silently change the denominator.
 */
export const judgeAgreementForModel = (
  verdicts: readonly JudgeVerdict[],
  modelId: string
): JudgeAgreementRow => {
  const mine = verdicts.filter(
    (v) => v.modelId === modelId && !NON_VERDICT_EVALUATORS.has(v.evaluator)
  );
  const judges = [...new Set(mine.map((v) => v.judgeId))].sort();

  if (judges.length === 0) {
    return {
      modelId,
      status: 'unmeasured',
      judges: [],
      pairs: 0,
      unpaired: 0,
      worstEvaluators: [],
    };
  }
  if (judges.length === 1) {
    // Scored, but by one judge only. This is NOT agreement of 100%; it is the
    // absence of a second opinion, and must never render as a high score.
    const soleCoverage = new Set(mine.map(cellKey)).size;
    return {
      modelId,
      status: 'single-judge',
      judges,
      pairs: 0,
      unpaired: soleCoverage,
      worstEvaluators: [],
    };
  }

  // Choose the judge pair with the largest true overlap.
  let best: { a: string; b: string; keys: string[] } | undefined;
  for (let i = 0; i < judges.length; i++) {
    for (let j = i + 1; j < judges.length; j++) {
      const a = judges[i];
      const b = judges[j];
      const aKeys = new Set(mine.filter((v) => v.judgeId === a).map(cellKey));
      const shared = [
        ...new Set(mine.filter((v) => v.judgeId === b && aKeys.has(cellKey(v))).map(cellKey)),
      ];
      if (!best || shared.length > best.keys.length) {
        best = { a, b, keys: shared };
      }
    }
  }

  if (!best || best.keys.length === 0) {
    // Two judges exist but scored disjoint work — no comparison is possible.
    const disjointCoverage = new Set(mine.map(cellKey)).size;
    return {
      modelId,
      status: 'single-judge',
      judges,
      pairs: 0,
      unpaired: disjointCoverage,
      worstEvaluators: [],
    };
  }

  const scoreOf = new Map<string, { a?: number; b?: number; evaluator: string }>();
  for (const v of mine) {
    if (v.judgeId !== best.a && v.judgeId !== best.b) {
      continue;
    }
    const key = cellKey(v);
    const entry = scoreOf.get(key) ?? { evaluator: v.evaluator };
    if (v.judgeId === best.a) {
      entry.a = v.score;
    } else {
      entry.b = v.score;
    }
    scoreOf.set(key, entry);
  }

  const paired = [...scoreOf.values()].filter(
    (e): e is { a: number; b: number; evaluator: string } => e.a !== undefined && e.b !== undefined
  );
  // Cells only one of the two judges scored. 4.8-opus surfaced this: Gemini
  // returned `unavailable` for ~130 cells Sonnet did score, so the row is
  // computed over materially less work than a fully-paired model's row.
  const unpaired = scoreOf.size - paired.length;

  let concordant = 0;
  let sumA = 0;
  let sumB = 0;
  const perEvaluator = new Map<string, { flips: number; pairs: number }>();
  for (const cell of paired) {
    const agree = passed(cell.a) === passed(cell.b);
    if (agree) {
      concordant += 1;
    }
    sumA += cell.a;
    sumB += cell.b;
    const stat = perEvaluator.get(cell.evaluator) ?? { flips: 0, pairs: 0 };
    stat.pairs += 1;
    if (!agree) {
      stat.flips += 1;
    }
    perEvaluator.set(cell.evaluator, stat);
  }

  const worstEvaluators = [...perEvaluator.entries()]
    .filter(([, s]) => s.flips > 0)
    .map(([evaluator, s]) => ({
      evaluator,
      flips: s.flips,
      pairs: s.pairs,
      interval: wilsonInterval(s.flips, s.pairs),
    }))
    .sort((x, y) => y.flips / y.pairs - x.flips / x.pairs)
    .slice(0, 5);

  return {
    modelId,
    status: 'measured',
    judges,
    pairs: paired.length,
    unpaired,
    verdictAgreement: concordant / paired.length,
    interval: wilsonInterval(concordant, paired.length),
    bias: sumA / paired.length - sumB / paired.length,
    biasJudges: [best.a, best.b],
    worstEvaluators,
  };
};
