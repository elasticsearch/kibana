/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PERSONA_MATRIX_EXAMPLES } from './datasets/persona_matrix_prompts';
import { GOLDEN_SCORES_SAMPLE } from './__fixtures__/golden_scores_sample';
import { planReplay, summarizePlan } from '@kbn/evals-extensions';

/**
 * Contract test against REAL golden documents (482 score docs, 40 cells,
 * captured 2026-09-06 from the persona-matrix re-judge waves) joined against
 * the REAL suite dataset.
 *
 * Synthetic fixtures cannot catch a schema drift between what the sweep writes
 * and what a replay reads. The first version of this planner passed 21
 * synthetic tests and still produced ZERO replayable cells from production
 * data, because it expected the reference answer inside the score document
 * (golden never stores it). This test is what caught that.
 */
describe('planReplay against real golden documents', () => {
  const docs = GOLDEN_SCORES_SAMPLE;

  const referenceFor = (exampleId: string) =>
    PERSONA_MATRIX_EXAMPLES.find((p) => p.id === exampleId)?.output.reference;

  it('replays real production cells', () => {
    const plan = planReplay(docs, referenceFor);
    // If the golden schema or the dataset ids drift, this drops to zero and a
    // "fast" re-judge would silently grade nothing while reporting success.
    expect(plan.cells.length).toBeGreaterThan(0);
    // One cell per (execution, example) — far fewer than the raw document count,
    // which carries one document per evaluator.
    expect(plan.cells.length).toBeLessThan(docs.length);
  });

  it('every replayable cell carries the three judge inputs', () => {
    const plan = planReplay(docs, referenceFor);
    for (const cell of plan.cells) {
      expect(typeof cell.question).toBe('string');
      expect(cell.question.length).toBeGreaterThan(0);
      expect(cell.agentResponse.length).toBeGreaterThan(0);
      expect(cell.expected.length).toBeGreaterThan(0);
      expect(cell.modelId).toBeTruthy();
    }
  });

  it('joins every real example id to a dataset reference', () => {
    // A miss here means the dataset moved under the stored runs: the replay
    // would skip real work rather than grade it.
    const plan = planReplay(docs, referenceFor);
    const unjoined = plan.skipped.filter((s) => s.reason.includes('dataset reference'));
    expect(unjoined).toHaveLength(0);
  });

  it('covers multiple models and executions', () => {
    const plan = planReplay(docs, referenceFor);
    expect(new Set(plan.cells.map((c) => c.modelId)).size).toBeGreaterThan(1);
    expect(summarizePlan(plan)).toMatch(/\d+ cell\(s\) across \d+ model\(s\)/);
  });
});
