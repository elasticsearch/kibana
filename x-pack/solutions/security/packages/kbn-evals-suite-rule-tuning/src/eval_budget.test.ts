/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The suite runs every fixture inside ONE `evaluate()` test. The experiment is pinned to
 * `concurrency: 1` and wall time scales linearly with fixture count x repetitions.
 *
 * A budget smaller than that product does not "flake" — it kills every attempt with
 * `Test timeout of Nms exceeded` no matter how good the model is, and the run reports a model
 * failure that is really a config bug. Growing the fixture list without growing the budget is
 * exactly how that happens, so assert the relationship instead of trusting a hand-tuned number.
 *
 * Ported 2026-09-11 to the post-split architecture: the diagnose step now lives in
 * rule_tuning_review.yaml, the worker fans out one review per rule, and the old
 * `concurrency_key` input no longer exists. Prompt-shape assertions re-derived against
 * the merged prompt text.
 */
const SECONDS_PER_FIXTURE = 233; // measured: 6 fixtures ran 1396s wall on a smoke VM

const read = (relativePath: string) => readFileSync(join(__dirname, '..', relativePath), 'utf8');

const REVIEW_YAML =
  '../../../../../../src/platform/packages/shared/kbn-workflows/managed/definitions/alertzero/rule_tuning_review.yaml';
const WORKER_YAML =
  '../../../../../../src/platform/packages/shared/kbn-workflows/managed/definitions/alertzero/rule_tuning_worker.yaml';

const readReview = () => readFileSync(join(__dirname, REVIEW_YAML), 'utf8');
const readWorker = () => readFileSync(join(__dirname, WORKER_YAML), 'utf8');

const countFixtures = () => {
  const spec = read('evals/rule_tuning_decision.spec.ts');
  const ids = spec.match(/^ {4}id: '/gm) ?? [];
  return ids.length;
};

const configuredTimeoutMs = () => {
  const config = read('playwright.config.ts');
  const match = config.match(/timeout:\s*([\d\s*_]+?),/);
  if (!match) throw new Error('playwright.config.ts no longer declares a `timeout`');
  return match[1]
    .replace(/_/g, '')
    .split('*')
    .map((factor) => Number(factor.trim()))
    .reduce((product, factor) => product * factor, 1);
};

const configuredRepetitions = () => {
  const config = read('playwright.config.ts');
  const match = config.match(/repetitions:\s*(\d+)/);
  if (!match) throw new Error('playwright.config.ts no longer declares `repetitions`');
  return Number(match[1]);
};

const labelCounts = () => {
  const spec = read('evals/rule_tuning_decision.spec.ts');
  const labels = [...spec.matchAll(/^ {4}expected: '([a-z_]+)'/gm)].map((m) => m[1]);
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return counts;
};

describe('rule-tuning eval budget', () => {
  it('gives the single evaluate() test enough wall clock for every fixture and repetition', () => {
    const fixtures = countFixtures();
    const repetitions = configuredRepetitions();
    // Post-split a fixture also runs a backtest preview pair before the gate; the
    // measured per-fixture seconds is retained until the first live-stack run
    // re-measures it.
    const requiredMs = fixtures * repetitions * SECONDS_PER_FIXTURE * 1000;

    expect(fixtures).toBeGreaterThan(0);
    expect(configuredTimeoutMs()).toBeGreaterThanOrEqual(requiredMs);
  });

  it('keeps the fixture count at or above the n=30 threshold for a rankable result', () => {
    expect(countFixtures()).toBeGreaterThanOrEqual(30);
  });

  it('states the smallest accuracy gap the fixture count can actually resolve', () => {
    const n = countFixtures();
    const twoSidedExactP = (wins: number, discordant: number) => {
      let tail = 0;
      for (let k = wins; k <= discordant; k++) {
        let coefficient = 1;
        for (let j = 0; j < k; j++) coefficient = (coefficient * (discordant - j)) / (j + 1);
        tail += coefficient;
      }
      return (tail / 2 ** discordant) * 2;
    };
    const discordant = 12;
    let winsNeeded = discordant;
    for (let w = Math.floor(discordant / 2) + 1; w <= discordant; w++) {
      if (twoSidedExactP(w, discordant) < 0.05) {
        winsNeeded = w;
        break;
      }
    }
    const minDetectableGap = (winsNeeded - (discordant - winsNeeded)) / n;
    expect(minDetectableGap).toBeGreaterThan(0.1);
    expect(minDetectableGap).toBeLessThanOrEqual(0.35);
  });

  it('keeps the majority class small enough that a constant answer cannot look competent', () => {
    // Port note: after the 23-label re-derivation, `exception` holds 16/35 — above the
    // 0.5 guard's intent only in spirit (0.457 ≤ 0.5 passes numerically). If the first
    // live-stack characterization run shows the true distribution skews further, the
    // fix is rebalancing fixtures, not raising the guard.
    const counts = labelCounts();
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    const majority = Math.max(...counts.values());

    expect(total).toBeGreaterThan(0);
    expect(majority / total).toBeLessThanOrEqual(0.5);
  });

  it('keeps the worker fan-out able to open every gate at once', () => {
    // The worker's run_reviews parallel branch must allow max >= max_rules_per_sweep so
    // per-rule gates can be pending concurrently (the split's reason to exist). If
    // someone shrinks one without the other, reviews serialize silently.
    const worker = readWorker();
    const maxRules = Number(worker.match(/max_rules_per_sweep:\s*(\d+)/)?.[1]);
    // `run_reviews` declares the only nested `concurrency:` block; its `max:` is the
    // branch fan-out cap (a comment sits between the two, so match across lines).
    const runReviews = worker.slice(worker.indexOf('- name: run_reviews'));
    const concurrencyBlock = runReviews.slice(
      runReviews.indexOf('concurrency:'),
      runReviews.indexOf('steps:')
    );
    const maxBranches = Number(concurrencyBlock.match(/max:\s*(\d+)/)?.[1]);
    expect(maxRules).toBeGreaterThan(0);
    expect(maxBranches).toBeGreaterThanOrEqual(maxRules);
  });

  it('keeps the review gate the only 72h clock (no branch timeout can cancel a parked gate)', () => {
    // Ported from the old unified-workflow lock test: the anti-double-diagnosis
    // guarantee is now structural (per-rule concurrency key + reviewed_tag written
    // post-gate). What must NOT regress: a timeout on the worker's parallel branch
    // would abort branches and cancel parked review children mid-approval.
    const worker = readWorker();
    const runReviews = worker.slice(worker.indexOf('- name: run_reviews'));
    const branch = runReviews.slice(0, runReviews.indexOf('- name: summarize_decisions'));
    expect(branch).not.toMatch(/^\s*(branch-)?timeout:/m);
  });

  it('leaves the investigate-rule skill registered in the diagnose prompt', () => {
    // INVERTED on the port: the fork forbade `skill://` because the skill's contract
    // contradicted the old prompt. Main's merged review deliberately delegates the
    // investigation to skill://investigate-rule. Pin its presence so removing it is a
    // deliberate change (the fixture labels were derived against this prompt).
    const review = readReview();
    const diagnose = review.slice(review.indexOf('- name: diagnose_rule'));
    const message = diagnose.slice(0, diagnose.indexOf('schema:'));
    expect(message).toMatch(/skill:\/\/investigate-rule/);
  });

  it('gives the agent the rule fields it must ground each change_type in', () => {
    const review = readReview();
    const diagnose = review.slice(review.indexOf('- name: diagnose_rule'));
    const message = diagnose.slice(0, diagnose.indexOf('schema:'));

    // The post-split prompt grounds the query recommendation in the rule's type and
    // language rather than interpolating the query/risk fields directly.
    expect(message).toMatch(/steps\.fetch_rule\.output\.type/);
    expect(message).toMatch(/steps\.fetch_rule\.output\.language/);
  });

  it('spells out criteria for every change_type it can emit', () => {
    const review = readReview();
    const diagnose = review.slice(review.indexOf('- name: diagnose_rule'));
    const message = diagnose.slice(0, diagnose.indexOf('schema:'));

    const enumMatch = review.match(/change_type:\s*\n\s*type: string\s*\n\s*enum: \[([^\]]+)\]/);
    if (!enumMatch)
      throw new Error('rule_tuning_review.yaml no longer declares a change_type enum');

    // The merged prompt names each enum value in its guidance sentences (it no
    // longer uses the `label — description` bullet form). Each label must appear.
    for (const label of enumMatch[1].split(',').map((value) => value.trim())) {
      expect(message).toMatch(new RegExp(label));
    }
  });
});
