/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  analyzeJudgeOverlap,
  realModelIdFromSourceExecution,
  type JudgeOverlapInput,
} from './judge_overlap';

const cells = (modelScores: Record<string, number[]>) =>
  Object.entries(modelScores).flatMap(([modelId, scores]) =>
    scores.map((score, i) => ({ modelId, exampleId: `ex-${i}`, score }))
  );

describe('analyzeJudgeOverlap', () => {
  it('reports a uniform offset when a judge is lenient but agrees on order', () => {
    // Same ordering, every score shifted +0.1. Offset must absorb the shift and
    // leave no residual, because nothing has been reordered.
    const input: JudgeOverlapInput[] = [
      { judgeId: 'strict', cells: cells({ a: [0.4, 0.5], b: [0.6, 0.7] }) },
      { judgeId: 'lenient', cells: cells({ a: [0.5, 0.6], b: [0.7, 0.8] }) },
    ];

    const report = analyzeJudgeOverlap(input);

    const lenient = report.severities.find((s) => s.judgeId === 'lenient')!;
    const strict = report.severities.find((s) => s.judgeId === 'strict')!;
    expect(lenient.offset).toBeCloseTo(0.05, 6);
    expect(strict.offset).toBeCloseTo(-0.05, 6);
    // The whole point: a pure offset does not reorder, so residual is zero.
    expect(report.residual.mean).toBeCloseTo(0, 6);
    expect(report.rankings.strict).toEqual(report.rankings.lenient);
    expect(report.rankable).toBe(true);
  });

  it('flags a board as unrankable when residual disagreement exceeds model spread', () => {
    // Judges invert each other on individual cells while ending at similar
    // means. Offsets cannot explain this, so the board orders judges.
    const input: JudgeOverlapInput[] = [
      { judgeId: 'j1', cells: cells({ a: [0.9, 0.1], b: [0.85, 0.15] }) },
      { judgeId: 'j2', cells: cells({ a: [0.1, 0.9], b: [0.15, 0.85] }) },
    ];

    const report = analyzeJudgeOverlap(input);

    expect(report.residual.mean).toBeGreaterThan(report.modelSpread);
    expect(report.rankable).toBe(false);
  });

  it('keeps only cells every judge graded, so a judge that skipped hard cells cannot look lenient', () => {
    // j2 is missing the hard cell (ex-1). Including it would credit j2 with a
    // higher mean purely from absence.
    const input: JudgeOverlapInput[] = [
      { judgeId: 'j1', cells: cells({ a: [0.8, 0.2] }) },
      {
        judgeId: 'j2',
        cells: [{ modelId: 'a', exampleId: 'ex-0', score: 0.8 }],
      },
    ];

    const report = analyzeJudgeOverlap(input);

    expect(report.commonCellCount).toBe(1);
    // Both judges scored the shared cell identically -> no severity difference.
    expect(report.severities.every((s) => Math.abs(s.offset) < 1e-9)).toBe(true);
  });

  it('identifies models whose rank is identical under every judge', () => {
    const input: JudgeOverlapInput[] = [
      { judgeId: 'j1', cells: cells({ top: [0.9, 0.9], mid: [0.5, 0.7], low: [0.2, 0.2] }) },
      { judgeId: 'j2', cells: cells({ top: [0.8, 0.8], mid: [0.7, 0.5], low: [0.1, 0.1] }) },
    ];

    const report = analyzeJudgeOverlap(input);

    // top and low hold their positions; mid is only stable because it sits
    // between two robust anchors.
    expect(report.stableRanks.map((s) => s.modelId)).toContain('top');
    expect(report.stableRanks.map((s) => s.modelId)).toContain('low');
    expect(report.stableRanks.find((s) => s.modelId === 'top')!.rank).toBe(1);
  });

  it('refuses to compare judges that share no cell', () => {
    const input: JudgeOverlapInput[] = [
      { judgeId: 'j1', cells: [{ modelId: 'a', exampleId: 'ex-0', score: 0.5 }] },
      { judgeId: 'j2', cells: [{ modelId: 'a', exampleId: 'ex-9', score: 0.5 }] },
    ];

    expect(() => analyzeJudgeOverlap(input)).toThrow(/graded by all 2 judges/);
  });

  it('refuses a single judge, which cannot separate judge effect from model effect', () => {
    expect(() => analyzeJudgeOverlap([{ judgeId: 'only', cells: cells({ a: [0.5] }) }])).toThrow(
      /at least 2 judges/
    );
  });
});

describe('realModelIdFromSourceExecution', () => {
  it('recovers the real model id from a blind run', () => {
    expect(
      realModelIdFromSourceExecution(
        'sweep-1788679167-rja-s1of3::security-persona-matrix::anthropic-claude-4.8-opus'
      )
    ).toBe('anthropic-claude-4.8-opus');
  });

  it('throws rather than returning a blind alias when the id is malformed', () => {
    expect(() => realModelIdFromSourceExecution('Model A')).toThrow(/Cannot recover a model id/);
  });
});
