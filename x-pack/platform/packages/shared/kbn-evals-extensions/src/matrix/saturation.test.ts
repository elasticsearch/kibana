/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { analyzeSaturation } from './saturation';

const judges = (a: number, b: number, c: number) => ({ gemini: a, sonnet: b, gpt: c });

describe('analyzeSaturation', () => {
  it('names saturation when judges agree but the rubric pins models at the ceiling', () => {
    // The attack-discovery case: 93-98% judge agreement, yet most models score a
    // perfect 1.0. Calling this "judge noise" would invite a rejudge that cannot
    // possibly separate the models.
    const cells = [
      { modelId: 'a', cellKey: 'x', scoresByJudge: judges(1, 1, 1) },
      { modelId: 'b', cellKey: 'x', scoresByJudge: judges(1, 1, 1) },
      { modelId: 'c', cellKey: 'x', scoresByJudge: judges(1, 1, 1) },
      { modelId: 'd', cellKey: 'x', scoresByJudge: judges(0.5, 0.5, 0.5) },
    ];

    const report = analyzeSaturation({ cells, ceiling: 1 });

    expect(report.limitingFactor).toBe('saturation');
    expect(report.saturatedModels).toBe(3);
    expect(report.ceilingShare).toBeCloseTo(0.75);
    expect(report.verdict).toMatch(/rubric, not the judge/);
  });

  // Precedence regression: a saturated column can ALSO have judgeSpread >=
  // modelSpread, because a ceiling squeezes the model spread toward zero.
  // Testing judge noise first would then report 'judge-noise' for a column no
  // rejudge can fix -- exactly the wrong instruction.
  it('reports saturation, not judge noise, when a ceiling squeezes the model spread', () => {
    const cells = [
      { modelId: 'a', cellKey: 'x', scoresByJudge: judges(1, 1, 1) },
      { modelId: 'b', cellKey: 'x', scoresByJudge: judges(1, 1, 0.9) },
      { modelId: 'c', cellKey: 'x', scoresByJudge: judges(1, 0.9, 1) },
      { modelId: 'd', cellKey: 'x', scoresByJudge: judges(1, 1, 1) },
    ];

    const report = analyzeSaturation({ cells, ceiling: 1 });

    expect(report.judgeSpread).toBeGreaterThanOrEqual(report.modelSpread);
    expect(report.limitingFactor).toBe('saturation');
    expect(report.verdict).toMatch(/rubric, not the judge/);
  });

  it('names judge noise when disagreement swamps the model differences', () => {
    const cells = [
      { modelId: 'a', cellKey: 'x', scoresByJudge: judges(0.1, 0.9, 0.5) },
      { modelId: 'b', cellKey: 'x', scoresByJudge: judges(0.2, 0.8, 0.4) },
    ];

    const report = analyzeSaturation({ cells, ceiling: 1 });

    expect(report.limitingFactor).toBe('judge-noise');
    expect(report.verdict).toMatch(/ensembling judges/);
  });

  it('reports none when models separate by more than the judges disagree', () => {
    const cells = [
      { modelId: 'a', cellKey: 'x', scoresByJudge: judges(0.9, 0.9, 0.88) },
      { modelId: 'b', cellKey: 'x', scoresByJudge: judges(0.5, 0.52, 0.5) },
      { modelId: 'c', cellKey: 'x', scoresByJudge: judges(0.1, 0.12, 0.1) },
    ];

    const report = analyzeSaturation({ cells, ceiling: 1 });

    expect(report.limitingFactor).toBe('none');
  });

  it('counts distinct judges and models rather than raw cells', () => {
    const cells = [
      { modelId: 'a', cellKey: 'x', scoresByJudge: judges(1, 1, 1) },
      { modelId: 'a', cellKey: 'y', scoresByJudge: judges(1, 1, 1) },
      { modelId: 'b', cellKey: 'x', scoresByJudge: judges(0.2, 0.2, 0.2) },
    ];

    const report = analyzeSaturation({ cells, ceiling: 1 });

    expect(report.cellCount).toBe(3);
    expect(report.modelCount).toBe(2);
    expect(report.judgeCount).toBe(3);
  });

  it('refuses to report on an empty column instead of returning NaN', () => {
    expect(() => analyzeSaturation({ cells: [], ceiling: 1 })).toThrow(/at least one cell/);
  });
});
