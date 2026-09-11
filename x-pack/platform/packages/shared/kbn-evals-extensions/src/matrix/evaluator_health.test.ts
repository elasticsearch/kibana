/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { checkEvaluatorHealth } from './evaluator_health';

const observe = (evaluatorName: string, scores: number[], role?: 'gate' | 'grader') =>
  scores.map((score, i) => ({
    evaluatorName,
    modelId: `model-${i}`,
    score,
    ...(role ? { role } : {}),
  }));

describe('checkEvaluatorHealth', () => {
  it('flags an evaluator that returns the same score for every model', () => {
    const report = checkEvaluatorHealth({
      observations: observe('DocVersionReleaseDate', Array(40).fill(1)),
    });

    const finding = report.findings[0];
    expect(finding.classification).toBe('constant');
    expect(finding.distinctValues).toBe(1);
    // A constant evaluator cannot separate any pair, so it must not be
    // reported as merely "saturated" -- it carries no information at all.
    expect(report.ok).toBe(false);
  });

  it('flags a grader pinned at the ceiling even when it has a couple of values', () => {
    // 95% at 1.0: this is the shape the collapsed attack-discovery rubric had.
    const scores = [...Array(38).fill(1), 0, 0];
    const report = checkEvaluatorHealth({ observations: observe('Rubric', scores) });

    expect(report.findings[0].classification).toBe('saturated');
    expect(report.findings[0].ceilingShare).toBeCloseTo(0.95, 2);
    expect(report.ok).toBe(false);
  });

  it('passes a grader that spreads models out', () => {
    const scores = Array.from({ length: 40 }, (_, i) => i / 39);
    const report = checkEvaluatorHealth({ observations: observe('Factuality', scores) });

    expect(report.findings[0].classification).toBe('discriminating');
    expect(report.ok).toBe(true);
  });

  it('does not fail a gate for sitting at the ceiling', () => {
    // Gates SHOULD saturate: "every model avoided the forbidden tool" is a pass,
    // not a broken evaluator. Failing them would train people to ignore the gate.
    const report = checkEvaluatorHealth({
      observations: observe('ShouldNotCallTool', Array(40).fill(1), 'gate'),
    });

    expect(report.findings[0].classification).toBe('gate-satisfied');
    expect(report.ok).toBe(true);
  });

  it('still fails a gate that never passes for anyone', () => {
    // A gate stuck at 0 for every model is broken or mis-specified, and unlike
    // a satisfied gate it is never the good news it looks like.
    const report = checkEvaluatorHealth({
      observations: observe('ShouldNotCallTool', Array(40).fill(0), 'gate'),
    });

    expect(report.findings[0].classification).toBe('gate-failing');
    expect(report.ok).toBe(false);
  });

  it('refuses to judge an evaluator with too few observations', () => {
    const report = checkEvaluatorHealth({
      observations: observe('Rubric', [1, 1, 1]),
      minObservations: 20,
    });

    expect(report.findings[0].classification).toBe('insufficient-data');
    // Not enough data is not the same as healthy; it must not silently pass.
    expect(report.findings[0].distinctValues).toBe(1);
    expect(report.ok).toBe(true);
    expect(report.skipped).toBe(1);
  });

  it('separates composite-safe evaluators from the rest', () => {
    const report = checkEvaluatorHealth({
      observations: [
        ...observe(
          'Factuality',
          Array.from({ length: 40 }, (_, i) => i / 39)
        ),
        ...observe('ShouldNotCallTool', Array(40).fill(1), 'gate'),
        ...observe('DeadWeight', Array(40).fill(1)),
      ],
    });

    // Only graders that discriminate belong in a ranking composite; folding in
    // gates and constants is what moved models by up to 14 places on the board.
    expect(report.compositeSafe).toEqual(['Factuality']);
  });

  it('reports every evaluator, not just the failing ones', () => {
    const report = checkEvaluatorHealth({
      observations: [
        ...observe(
          'Good',
          Array.from({ length: 40 }, (_, i) => i / 39)
        ),
        ...observe('Bad', Array(40).fill(1)),
      ],
    });

    expect(report.findings).toHaveLength(2);
    expect(report.findings.map((f) => f.evaluatorName).sort()).toEqual(['Bad', 'Good']);
  });

  it('throws rather than reporting health for no observations at all', () => {
    expect(() => checkEvaluatorHealth({ observations: [] })).toThrow(/at least one observation/);
  });

  it('treats a non-1 ceiling correctly', () => {
    // A 0-5 rubric pinned at 5 is just as saturated as a 0-1 pinned at 1.
    const report = checkEvaluatorHealth({
      observations: observe('Scale5', [...Array(38).fill(5), 4, 3]),
      ceiling: 5,
    });

    expect(report.findings[0].classification).toBe('saturated');
  });
});
