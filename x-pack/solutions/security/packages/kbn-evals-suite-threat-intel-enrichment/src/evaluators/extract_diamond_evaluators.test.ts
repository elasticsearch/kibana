/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator, EvaluationResult } from '@kbn/evals';
import type { ExtractDiamondResponse } from '../types';
import {
  createDiamondNoIocLeakEvaluator,
  createSignalCountEvaluator,
  withMajorityVote,
} from './extract_diamond_evaluators';

// Shared, loosely-typed args for the generic `withMajorityVote` wrapper, whose
// base ignores them. The typed CODE evaluators below pass `input`/`metadata`
// inline so their example types are enforced.
const voteArgs = {
  input: undefined,
  output: undefined,
  expected: undefined,
  metadata: undefined,
} as unknown as Parameters<Evaluator['evaluate']>[0];

const vertex = (summary = 'generic behavioural description') => ({
  signal: 'HIGH' as const,
  summary,
});

const diamondOutput = (
  overrides: Partial<ExtractDiamondResponse> = {}
): ExtractDiamondResponse => ({
  adversary: vertex(),
  capability: vertex(),
  infrastructure: vertex(),
  victim: vertex(),
  signal_count: 4,
  model_id: 'test-model',
  extracted_at: '2026-01-01T00:00:00.000Z',
  extraction_mode: 'single_call',
  ...overrides,
});

describe('createSignalCountEvaluator', () => {
  const evaluator = createSignalCountEvaluator();

  it('returns score 1 when the signal count meets the floor', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: diamondOutput({ signal_count: 3 }),
      expected: { min_signal_count: 3 },
    });
    expect(result.score).toBe(1);
  });

  it('returns score 0 when a vertex is forced to NONE and the count drops below the floor', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: diamondOutput({
        victim: { signal: 'NONE', summary: '' },
        signal_count: 2,
      }),
      expected: { min_signal_count: 3 },
    });
    expect(result.score).toBe(0);
  });
});

describe('createDiamondNoIocLeakEvaluator', () => {
  const evaluator = createDiamondNoIocLeakEvaluator();

  it('returns score 1 when no vertex summary leaks a literal indicator', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: diamondOutput(),
      expected: { min_signal_count: 0 },
    });
    expect(result.score).toBe(1);
  });

  it('returns score 0 when a vertex summary leaks a literal IP address', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: diamondOutput({
        infrastructure: { signal: 'HIGH', summary: 'callback to 192.0.2.50 over HTTPS' },
      }),
      expected: { min_signal_count: 0 },
    });
    expect(result.score).toBe(0);
  });

  it('returns score 0 when the output is missing', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: undefined as unknown as ExtractDiamondResponse,
      expected: { min_signal_count: 0 },
    });
    expect(result.score).toBe(0);
  });
});

describe('withMajorityVote', () => {
  const criterion = (id: string, result: 'PASS' | 'FAIL' | 'N/A', weight = 1) => ({
    id,
    result,
    weight,
  });

  // Base evaluator whose successive `evaluate` calls return the queued results,
  // letting a test drive each judge sample independently.
  const baseFromRuns = (runs: EvaluationResult[], extra: Partial<Evaluator> = {}): Evaluator => {
    let call = 0;
    return {
      name: 'criteria',
      kind: 'LLM',
      direction: 'maximize',
      evaluate: async () => runs[Math.min(call++, runs.length - 1)],
      ...extra,
    };
  };

  const votedCriteria = (result: EvaluationResult) =>
    (result.metadata?.criteria ?? []) as Array<{ id: string; result: string }>;

  it('preserves getModel so the executor can attribute the score to the judge', () => {
    const getModel = () =>
      ({ id: 'judge-model' } as ReturnType<NonNullable<Evaluator['getModel']>>);
    const wrapped = withMajorityVote(baseFromRuns([{ score: 1 }], { getModel }), 3);
    expect(wrapped.getModel).toBe(getModel);
  });

  it('preserves getVersion so the executor can attribute the evaluator version', () => {
    const getVersion = () => 'v1';
    const wrapped = withMajorityVote(baseFromRuns([{ score: 1 }], { getVersion }), 3);
    expect(wrapped.getVersion).toBe(getVersion);
  });

  it('scores a criterion 1 when a majority of samples pass', async () => {
    const wrapped = withMajorityVote(
      baseFromRuns([
        { metadata: { criteria: [criterion('c1', 'PASS')] } },
        { metadata: { criteria: [criterion('c1', 'PASS')] } },
        { metadata: { criteria: [criterion('c1', 'FAIL')] } },
      ]),
      3
    );
    const result = await wrapped.evaluate(voteArgs);
    expect(result.score).toBe(1);
  });

  it('scores a criterion 0 when a majority of samples fail', async () => {
    const wrapped = withMajorityVote(
      baseFromRuns([
        { metadata: { criteria: [criterion('c1', 'FAIL')] } },
        { metadata: { criteria: [criterion('c1', 'FAIL')] } },
        { metadata: { criteria: [criterion('c1', 'PASS')] } },
      ]),
      3
    );
    const result = await wrapped.evaluate(voteArgs);
    expect(result.score).toBe(0);
  });

  it('resolves a tie to PASS', async () => {
    const wrapped = withMajorityVote(
      baseFromRuns([
        { metadata: { criteria: [criterion('c1', 'PASS')] } },
        { metadata: { criteria: [criterion('c1', 'FAIL')] } },
      ]),
      2
    );
    const result = await wrapped.evaluate(voteArgs);
    expect(result.score).toBe(1);
  });

  it('counts N/A as passing', async () => {
    const wrapped = withMajorityVote(
      baseFromRuns([
        { metadata: { criteria: [criterion('c1', 'N/A')] } },
        { metadata: { criteria: [criterion('c1', 'N/A')] } },
        { metadata: { criteria: [criterion('c1', 'FAIL')] } },
      ]),
      3
    );
    const result = await wrapped.evaluate(voteArgs);
    expect(result.score).toBe(1);
  });

  it('weights the aggregate score by criterion weight', async () => {
    const runs: EvaluationResult[] = [
      {
        metadata: {
          criteria: [criterion('c1', 'PASS', 3), criterion('c2', 'FAIL', 1)],
        },
      },
    ];
    const wrapped = withMajorityVote(baseFromRuns(runs), 1);
    const result = await wrapped.evaluate(voteArgs);
    expect(result.score).toBe(0.75);
  });

  it('falls back to the last run when there are no criteria to vote on', async () => {
    const wrapped = withMajorityVote(baseFromRuns([{ score: 0.42, label: 'last' }]), 3);
    const result = await wrapped.evaluate(voteArgs);
    expect(result.label).toBe('last');
  });

  it('records each voted verdict in the result metadata', async () => {
    const wrapped = withMajorityVote(
      baseFromRuns([
        { metadata: { criteria: [criterion('c1', 'PASS')] } },
        { metadata: { criteria: [criterion('c1', 'PASS')] } },
        { metadata: { criteria: [criterion('c1', 'FAIL')] } },
      ]),
      3
    );
    const result = await wrapped.evaluate(voteArgs);
    expect(votedCriteria(result)).toEqual([expect.objectContaining({ id: 'c1', result: 'PASS' })]);
  });
});
