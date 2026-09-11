/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationScoreDocument } from '@kbn/evals-common';
import { diffStability, toCells } from './stability_diff';

const doc = (
  model: string,
  example: string,
  evaluator: string,
  score: number,
  repetition = 0
): EvaluationScoreDocument =>
  ({
    evaluator: { name: evaluator, score },
    example: { id: example },
    task: { model: { id: model }, repetition_index: repetition },
  } as unknown as EvaluationScoreDocument);

describe('toCells', () => {
  it('averages repetitions into one cell and records the count', () => {
    const cells = toCells([
      doc('haiku', 'alert-analysis-a', 'criteria', 0, 0),
      doc('haiku', 'alert-analysis-a', 'criteria', 1, 1),
    ]);
    expect([...cells.values()]).toEqual([
      {
        model: 'haiku',
        example: 'alert-analysis-a',
        evaluator: 'criteria',
        score: 0.5,
        repetitions: 2,
      },
    ]);
  });

  it('skips documents missing model, example, evaluator or score', () => {
    expect(toCells([{ evaluator: { name: 'criteria' } } as EvaluationScoreDocument]).size).toBe(0);
  });
});

describe('diffStability', () => {
  it('flags the real run5 -> run6 Haiku flip that a single sweep hides', () => {
    // run5: Haiku failed alert-analysis-a and multi-step-b (19/21).
    // run6: same commit, same stack, both passed (21/21).
    const run5 = [
      doc('haiku', 'alert-analysis-a', 'criteria', 0),
      doc('haiku', 'multi-step-b', 'criteria', 0),
      doc('haiku', 'entity-analytics-a', 'criteria', 1),
    ];
    const run6 = [
      doc('haiku', 'alert-analysis-a', 'criteria', 1),
      doc('haiku', 'multi-step-b', 'criteria', 1),
      doc('haiku', 'entity-analytics-a', 'criteria', 1),
    ];

    const diff = diffStability(run5, run6);

    expect(diff.unchanged).toBe(1);
    expect(diff.flips).toHaveLength(2);
    expect(diff.flips.map((f) => f.example).sort()).toEqual(['alert-analysis-a', 'multi-step-b']);
    // Neither sweep repeated, so these are noise-suspect, not proven regressions.
    expect(diff.flips.every((f) => f.singleSampled)).toBe(true);
  });

  it('sorts regressions before improvements', () => {
    const diff = diffStability(
      [doc('m', 'a', 'criteria', 1), doc('m', 'b', 'criteria', 0)],
      [doc('m', 'a', 'criteria', 0), doc('m', 'b', 'criteria', 1)]
    );
    expect(diff.flips[0]).toMatchObject({ example: 'a', delta: -1 });
    expect(diff.flips[1]).toMatchObject({ example: 'b', delta: 1 });
  });

  it('does not mark a flip single-sampled when repetitions back it', () => {
    const diff = diffStability(
      [doc('m', 'a', 'Relevance', 8, 0), doc('m', 'a', 'Relevance', 8, 1)],
      [doc('m', 'a', 'Relevance', 3, 0), doc('m', 'a', 'Relevance', 3, 1)]
    );
    expect(diff.flips[0].singleSampled).toBe(false);
  });

  it('ignores wobble within tolerance', () => {
    const diff = diffStability(
      [doc('m', 'a', 'Groundedness', 8.0)],
      [doc('m', 'a', 'Groundedness', 8.2)],
      { tolerance: 0.5 }
    );
    expect(diff.flips).toHaveLength(0);
    expect(diff.unchanged).toBe(1);
  });

  it('counts cells that exist in only one sweep instead of reporting them as flips', () => {
    const diff = diffStability([doc('m', 'gone', 'criteria', 1)], [doc('m', 'new', 'criteria', 1)]);
    expect(diff.flips).toHaveLength(0);
    expect(diff.onlyBefore).toBe(1);
    expect(diff.onlyAfter).toBe(1);
  });
});
