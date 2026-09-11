/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { runRejudge, describeJudgeFailure, type CellJudge } from './run_rejudge';
import type { ReplayCell } from './replay_plan';

const cell = (overrides: Partial<ReplayCell> = {}): ReplayCell => ({
  executionId: 'exec-1',
  exampleId: 'ex-a',
  modelId: 'model-x',
  question: 'q',
  expected: 'e',
  agentResponse: 'a',
  steps: [],
  recordedAt: '2026-08-22T16:24:55.232Z',
  ...overrides,
});

const okJudge: CellJudge = async (c) => ({
  scores: [{ name: 'Factuality', score: 1, label: 'ACCURATE' }],
  analyses: { correctness: { example: c.exampleId } },
});

describe('runRejudge', () => {
  it('judges every cell and tags results with the judge execution id', async () => {
    const result = await runRejudge({
      cells: [cell(), cell({ exampleId: 'ex-b' })],
      judge: okJudge,
      judgeTag: 'haiku',
      concurrency: 2,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].executionId).toBe('exec-1::rejudge-haiku');
    expect(result.failures).toEqual([]);
  });

  it('reports a failing cell instead of dropping it', async () => {
    // A judge that throws on some cells must not silently shrink the matrix:
    // a model whose hard examples all failed would otherwise publish an
    // average over only its easy ones, which reads as a better model.
    const judge: CellJudge = async (c) => {
      if (c.exampleId === 'ex-b') throw new Error('judge 500');
      return okJudge(c);
    };

    const result = await runRejudge({
      cells: [cell(), cell({ exampleId: 'ex-b' })],
      judge,
      judgeTag: 'haiku',
      concurrency: 2,
    });

    expect(result.results).toHaveLength(1);
    expect(result.failures).toEqual([
      expect.objectContaining({ exampleId: 'ex-b', reason: expect.stringContaining('judge 500') }),
    ]);
  });

  it('respects the concurrency limit', async () => {
    // Unbounded fan-out over ~400 cells rate-limits the judge connector and
    // turns a cheap replay into a retry storm.
    let inFlight = 0;
    let peak = 0;
    const judge: CellJudge = async (c) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return okJudge(c);
    };

    await runRejudge({
      cells: Array.from({ length: 12 }, (_, i) => cell({ exampleId: `ex-${i}` })),
      judge,
      judgeTag: 'haiku',
      concurrency: 3,
    });

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('refuses an empty judge tag', async () => {
    // Without a tag the replay writes under the source execution id and mixes
    // two judges' verdicts into one cell.
    await expect(
      runRejudge({ cells: [cell()], judge: okJudge, judgeTag: '', concurrency: 1 })
    ).rejects.toThrow(/judge tag/i);
  });

  it('preserves source provenance on each result', async () => {
    const result = await runRejudge({
      cells: [cell()],
      judge: okJudge,
      judgeTag: 'haiku',
      concurrency: 1,
    });

    expect(result.results[0]).toEqual(
      expect.objectContaining({
        sourceExecutionId: 'exec-1',
        modelId: 'model-x',
        exampleId: 'ex-a',
      })
    );
  });
});

describe('describeJudgeFailure', () => {
  // Regression: a whole 99-cell judge run reported one indistinguishable reason
  // ("LLM could not complete task successfully in 4 attempts") because
  // AggregateError.message hides the per-attempt causes that name the real
  // problem. Without them there is nothing to act on.
  it('unwraps the causes an AggregateError hides behind its summary', () => {
    const error = new AggregateError(
      [
        new Error('Tool call did not match schema: criteria is required'),
        new Error('rate limited'),
      ],
      'LLM could not complete task successfully in 4 attempts'
    );

    const reason = describeJudgeFailure(error);

    expect(reason).toContain('LLM could not complete task successfully in 4 attempts');
    expect(reason).toContain('Tool call did not match schema: criteria is required');
    expect(reason).toContain('rate limited');
  });

  it('collapses repeated identical causes instead of repeating them per attempt', () => {
    const error = new AggregateError(
      [new Error('same failure'), new Error('same failure'), new Error('same failure')],
      'summary'
    );

    expect(describeJudgeFailure(error)).toBe('summary: same failure');
  });

  it('passes an ordinary Error message through unchanged', () => {
    expect(describeJudgeFailure(new Error('plain failure'))).toBe('plain failure');
  });

  it('stringifies a non-Error rejection', () => {
    expect(describeJudgeFailure('string failure')).toBe('string failure');
  });
});
