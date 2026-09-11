/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * An evaluator that gives every model the same score cannot rank anything, but
 * it still costs eval time, occupies a board column, and -- worst -- gets folded
 * into composite scores where it dilutes the evaluators that do discriminate.
 *
 * That is not hypothetical. An audit of the golden data found three evaluators
 * returning a constant 1.000 across all 159 observations, and dropping the
 * near-constant ones moved models by up to 14 rank places. The collapsed
 * attack-discovery rubric was the same defect caught by hand, one suite at a
 * time, after 240 observations had already been spent on it.
 *
 * This makes that check mechanical so it happens at run time rather than in a
 * retrospective script.
 *
 * The one distinction that matters: a **gate** ("did it avoid the forbidden
 * tool?") is *supposed* to sit at the ceiling -- that means models are behaving.
 * Failing gates for being saturated would train people to ignore the warning.
 * A gate is only broken when nobody passes it.
 */

export type EvaluatorRole = 'gate' | 'grader';

export type EvaluatorClassification =
  | 'constant'
  | 'saturated'
  | 'discriminating'
  | 'gate-satisfied'
  | 'gate-failing'
  | 'insufficient-data';

export interface EvaluatorObservation {
  evaluatorName: string;
  modelId: string;
  score: number;
  /** Defaults to `grader`; gates are held to different expectations. */
  role?: EvaluatorRole;
}

export interface EvaluatorHealthInput {
  observations: EvaluatorObservation[];
  /** Highest score the evaluator can award. */
  ceiling?: number;
  /** Below this many observations an evaluator is not judged at all. */
  minObservations?: number;
  /** Share of observations at the ceiling above which a grader is saturated. */
  saturationThreshold?: number;
}

export interface EvaluatorFinding {
  evaluatorName: string;
  role: EvaluatorRole;
  classification: EvaluatorClassification;
  observationCount: number;
  distinctValues: number;
  ceilingShare: number;
  /** What to do about it, or why it is fine. */
  verdict: string;
}

export interface EvaluatorHealthReport {
  ok: boolean;
  findings: EvaluatorFinding[];
  /** Evaluators safe to average into a ranking composite. */
  compositeSafe: string[];
  /** Evaluators not judged for lack of data. */
  skipped: number;
}

const UNHEALTHY: ReadonlySet<EvaluatorClassification> = new Set([
  'constant',
  'saturated',
  'gate-failing',
]);

export function checkEvaluatorHealth({
  observations,
  ceiling = 1,
  minObservations = 20,
  saturationThreshold = 0.9,
}: EvaluatorHealthInput): EvaluatorHealthReport {
  if (observations.length === 0) {
    throw new Error(
      'checkEvaluatorHealth requires at least one observation; refusing to certify nothing as healthy.'
    );
  }

  const byEvaluator = new Map<string, EvaluatorObservation[]>();
  for (const observation of observations) {
    const existing = byEvaluator.get(observation.evaluatorName);
    if (existing) {
      existing.push(observation);
    } else {
      byEvaluator.set(observation.evaluatorName, [observation]);
    }
  }

  const findings = [...byEvaluator.entries()].map(([evaluatorName, group]) =>
    classify({ evaluatorName, group, ceiling, minObservations, saturationThreshold })
  );

  return {
    ok: findings.every((f) => !UNHEALTHY.has(f.classification)),
    findings,
    compositeSafe: findings
      .filter((f) => f.classification === 'discriminating')
      .map((f) => f.evaluatorName),
    skipped: findings.filter((f) => f.classification === 'insufficient-data').length,
  };
}

function classify({
  evaluatorName,
  group,
  ceiling,
  minObservations,
  saturationThreshold,
}: {
  evaluatorName: string;
  group: EvaluatorObservation[];
  ceiling: number;
  minObservations: number;
  saturationThreshold: number;
}): EvaluatorFinding {
  const role: EvaluatorRole = group[0].role ?? 'grader';
  const scores = group.map((o) => o.score);
  const distinctValues = new Set(scores.map((s) => round(s))).size;
  const atCeiling = scores.filter((s) => Math.abs(s - ceiling) <= 1e-9).length;
  const ceilingShare = atCeiling / scores.length;

  const base = {
    evaluatorName,
    role,
    observationCount: scores.length,
    distinctValues,
    ceilingShare,
  };

  if (scores.length < minObservations) {
    return {
      ...base,
      classification: 'insufficient-data',
      verdict:
        `Only ${scores.length} observations (needs ${minObservations}). Not judged -- this is ` +
        `absence of evidence, not a clean bill of health.`,
    };
  }

  if (role === 'gate') {
    // A gate at the ceiling is the outcome it was written to confirm.
    if (ceilingShare >= saturationThreshold) {
      return {
        ...base,
        classification: 'gate-satisfied',
        verdict:
          `Gate passes for ${pct(
            ceilingShare
          )} of runs, which is what a healthy gate looks like. ` +
          `Keep it as a pass/fail badge and keep it out of ranking composites.`,
      };
    }
    if (atCeiling === 0) {
      return {
        ...base,
        classification: 'gate-failing',
        verdict:
          `Gate never passes for any model. Either every model genuinely fails it, or the gate is ` +
          `mis-specified -- unlike a satisfied gate, this is never the good news it resembles.`,
      };
    }
    return {
      ...base,
      classification: 'discriminating',
      verdict: `Gate passes for ${pct(ceilingShare)} of runs and separates models.`,
    };
  }

  if (distinctValues <= 1) {
    return {
      ...base,
      classification: 'constant',
      verdict:
        `Returns the same score for all ${scores.length} observations. It cannot separate any pair ` +
        `of models, so it contributes nothing to a ranking while still costing eval time. Fix the ` +
        `evaluator or drop it.`,
    };
  }

  if (ceilingShare >= saturationThreshold) {
    return {
      ...base,
      classification: 'saturated',
      verdict:
        `${pct(
          ceilingShare
        )} of scores sit at the ${ceiling} ceiling across only ${distinctValues} ` +
        `distinct values. Rejudging cannot separate these models; only a finer-grained rubric can.`,
    };
  }

  return {
    ...base,
    classification: 'discriminating',
    verdict: `${distinctValues} distinct values with ${pct(
      ceilingShare
    )} at the ceiling -- separates models.`,
  };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function pct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}
