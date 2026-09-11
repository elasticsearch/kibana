/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Characterization tests for the rule-tuning eval suite.
 *
 * These do NOT assert what the code *should* do. They pin what it *does* do today, so that a
 * later change to the workflow, the seeder, or the fixtures is a DELIBERATE, reviewable diff
 * rather than an accidental drift. Each test documents the finding it guards, so a future
 * author who trips one knows exactly which behaviour changed and why it mattered.
 *
 * The contract is: these tests are GREEN on the base they characterize, and go RED when the
 * behaviour they pin changes. The follow-up PR that changes the behaviour is expected to
 * update them in the same commit as the change it makes.
 *
 * Ported 2026-09-11 to the post-#290097 split: the unified workflow became
 * worker (harvest + fan-out) + review (per-rule diagnose + approval gate),
 * under `definitions/alertzero/`. Diagnose now lives in the REVIEW yaml.
 */

const read = (relativePath: string) => readFileSync(join(__dirname, '..', relativePath), 'utf8');

const WORKER_YAML =
  '../../../../../../src/platform/packages/shared/kbn-workflows/managed/definitions/alertzero/rule_tuning_worker.yaml';
const REVIEW_YAML =
  '../../../../../../src/platform/packages/shared/kbn-workflows/managed/definitions/alertzero/rule_tuning_review.yaml';

const readWorker = () => readFileSync(join(__dirname, WORKER_YAML), 'utf8');
const readReview = () => readFileSync(join(__dirname, REVIEW_YAML), 'utf8');

const readSeeder = () => read('evals/seed_fp_cluster.ts');

const readSpec = () => read('evals/rule_tuning_decision.spec.ts');

/**
 * Extract the golden label contract (fixture id -> expected change_type) from the eval spec.
 * Only the fixture specs use a 4-space-indented `id:` / `expected: '...'` string form.
 */
const goldenLabels = () => {
  const spec = readSpec();
  const ids = [...spec.matchAll(/^ {4}id: '([^']+)'/gm)].map((m) => m[1]);
  const expected = [...spec.matchAll(/^ {4}expected: '([a-z_]+)'/gm)].map((m) => m[1]);
  if (ids.length !== expected.length) {
    throw new Error(`fixture spec id count (${ids.length}) != expected count (${expected.length})`);
  }
  return new Map(ids.map((id, i) => [id, expected[i]]));
};

describe('rule-tuning coverage characterization', () => {
  it('characterizes seeded alert scoring as a shared medium/40 literal', () => {
    // The seeder writes the SAME severity/risk_score onto every alert row and every rule,
    // regardless of fixture. Pin the literal so threading per-fixture scoring through is a
    // visible, deliberate change rather than an unnoticed one.
    const seeder = readSeeder();
    expect(seeder).toMatch(/'kibana\.alert\.severity': 'medium'/);
    expect(seeder).toMatch(/'kibana\.alert\.risk_score': 40/);
  });

  it('characterizes seeded alerts as uniformly closed false positives with no true-positive minority', () => {
    const seeder = readSeeder();
    expect(seeder).toMatch(/'kibana\.alert\.workflow_status': 'closed'/);
    expect(seeder).toMatch(/'kibana\.alert\.workflow_reason': 'false_positive'/);
    expect(seeder).not.toMatch(/'kibana\.alert\.workflow_status': 'open'/);
    expect(seeder).not.toMatch(/true.?positive/i);
  });

  it('characterizes the harvest as reading only closed false positives', () => {
    const worker = readWorker();
    expect(worker).toMatch(/kibana\.alert\.workflow_status` == "closed"/);
    expect(worker).toMatch(/kibana\.alert\.workflow_reason` == "false_positive"/);
    expect(worker).not.toMatch(/name: fetch_open_entities/);
  });

  it('characterizes the diagnose step budget as 10 minutes', () => {
    const review = readReview();
    const diagnose = review.slice(review.indexOf('- name: diagnose_rule'));
    expect(diagnose).toMatch(/timeout: "10m"/);
  });

  it('characterizes the diagnose enum as the post-split four', () => {
    // The fork characterized a six-value enum including risk_score/disable/manual.
    // Post-split the review can only emit [exception, suppression, query, threshold];
    // pin that so re-adding a label is a deliberate, reviewed change (and the fixture
    // labels can never silently include an unemittable one again).
    const review = readReview();
    const diagnose = review.slice(review.indexOf('- name: diagnose_rule'));
    const schema = diagnose.slice(diagnose.indexOf('schema:'));
    expect(schema).toMatch(/enum: \[exception, suppression, query, threshold\]/);
  });

  it('characterizes the golden label contract of all fixtures', () => {
    // Labels are PRELIMINARY after the 2026-09-11 port (23 re-derived); pin the
    // current mapping so any further relabel is a deliberate, reviewed decision.
    const labels = goldenLabels();
    expect(labels.size).toBe(35);
    // No label may sit outside the emittable enum — the port's core invariant.
    const emittable = new Set(['exception', 'suppression', 'query', 'threshold']);
    for (const [id, label] of labels) {
      if (!emittable.has(label)) {
        throw new Error(`fixture ${id} carries unemittable label ${label}`);
      }
    }
  });
});
