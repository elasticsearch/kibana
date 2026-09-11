/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  selectJury,
  checkJuryCoverage,
  personaMatrixJury,
  attackDiscoveryJury,
  JURY_ADAPTERS,
} from './jury_adapters';
import type { ReplayCell } from './replay_plan';

const cell = (overrides: Partial<ReplayCell> = {}): ReplayCell => ({
  executionId: 'exec-1',
  exampleId: '0',
  modelId: 'model-a',
  question: 'What happened?',
  expected: 'A reference answer.',
  agentResponse: 'An agent answer.',
  steps: [],
  recordedAt: '2026-09-08T00:00:00.000Z',
  ...overrides,
});

describe('selectJury', () => {
  it('resolves a jury by suite id', () => {
    expect(selectJury('attack-discovery-agent-builder')?.name).toBe('attack-discovery');
    expect(selectJury('security-persona-matrix')?.name).toBe('persona-matrix');
  });

  it('resolves a jury by adapter name', () => {
    expect(selectJury('attack-discovery')?.name).toBe('attack-discovery');
  });

  it('returns undefined for an unregistered suite rather than defaulting', () => {
    // Defaulting to the persona jury is precisely the bug this registry fixes:
    // it produced Factuality/Relevance verdicts for an AD replay.
    expect(selectJury('security-automatic-migrations')).toBeUndefined();
    expect(selectJury('totally-unknown-suite')).toBeUndefined();
  });
});

describe('personaMatrixJury.toArgs', () => {
  it('builds args from a complete cell', () => {
    const args = personaMatrixJury.toArgs(cell());
    expect(args).not.toBeNull();
    expect(args!.input).toEqual({ question: 'What happened?' });
    expect(args!.expected).toEqual({ expected: 'A reference answer.' });
  });

  it('rejects a cell with no agent response', () => {
    expect(personaMatrixJury.toArgs(cell({ agentResponse: '' }))).toBeNull();
  });

  it('rejects a cell with no prose reference', () => {
    expect(personaMatrixJury.toArgs(cell({ expected: '' }))).toBeNull();
  });
});

describe('attackDiscoveryJury.toArgs', () => {
  const adCell = (output: unknown, expectedStructured: unknown = { criteria: ['c1'] }) =>
    cell({
      // AD grades the structured payload, not the transcript, so a cell with
      // no final message is still replayable.
      agentResponse: '',
      taskOutput: output,
      expectedStructured,
    });

  it('grades insights even when the transcript has no final message', () => {
    const args = attackDiscoveryJury.toArgs(
      adCell({ insights: [{ title: 'Suspicious curl', alertIds: ['a1'] }] })
    );
    expect(args).not.toBeNull();
    expect((args!.output as { insights: unknown[] }).insights).toHaveLength(1);
  });

  it('rejects a cell whose insights are empty', () => {
    expect(attackDiscoveryJury.toArgs(adCell({ insights: [] }))).toBeNull();
  });

  it('rejects a cell with no ground truth to grade against', () => {
    expect(
      attackDiscoveryJury.toArgs(adCell({ insights: [{ title: 't' }] }, { criteria: [] }))
    ).toBeNull();
  });
});

describe('attackDiscoveryJury.criteriaFor', () => {
  const args = {
    input: { question: 'Run attack discovery' },
    output: { insights: [{ title: 'Suspicious curl', alertIds: ['a1'] }], errors: [] },
    expected: { criteria: ['c1', 'c2'], attackDiscoveries: [{ title: 'ref', alertIds: ['a1'] }] },
    metadata: {},
  };

  it('emits both Criteria and Rubric invocations', () => {
    const specs = attackDiscoveryJury.criteriaFor!(args);
    expect(specs.map((s) => s.name)).toEqual(['Criteria', 'Rubric']);
  });

  it('passes the suite criteria through verbatim', () => {
    const specs = attackDiscoveryJury.criteriaFor!(args);
    expect(specs.find((s) => s.name === 'Criteria')!.criteria).toEqual(['c1', 'c2']);
  });

  it('passes each of the 7 rubric items as its own criterion', () => {
    // One criterion per requirement is what lets the shared criteria judge
    // return partial credit. Collapsing them into a single "5 of 7 -> Y or N"
    // question, as this adapter used to, scored 95.6% of cells at exactly 1.0
    // and left the AD column unable to rank any model against another.
    const rubric = attackDiscoveryJury.criteriaFor!(args).find(
      (s) => s.name === 'Rubric'
    )!.criteria;

    expect(rubric).toHaveLength(7);
    expect(rubric.some((c) => c.includes('alertIds'))).toBe(true);
    expect(rubric.some((c) => c.includes('MITRE'))).toBe(true);
    // The threshold must not come back: a pass rule on top of per-item scores
    // re-collapses them to binary.
    expect(rubric.some((c) => c.includes('at least 5 of the 7'))).toBe(false);
    // Every criterion carries the reference so it can be judged standalone.
    expect(rubric.every((c) => c.includes('Reference:'))).toBe(true);
  });

  it('prefers rubric items injected by the caller over its own copy', () => {
    // The suite owns the rubric; this adapter keeps a fallback. When the CLI
    // supplies the suite's list, a rubric change in the suite must reach the
    // replay rather than being shadowed by the stale local copy.
    const specs = attackDiscoveryJury.criteriaFor!({
      ...args,
      metadata: { ...args.metadata, rubricCriteria: ['only item A', 'only item B'] },
    } as typeof args);
    const rubric = specs.find((s) => s.name === 'Rubric')!.criteria;

    expect(rubric).toHaveLength(2);
    expect(rubric[0]).toContain('only item A');
    expect(rubric.every((c) => c.includes('Reference:'))).toBe(true);
  });

  it('omits the Rubric invocation when there is no reference discovery', () => {
    const specs = attackDiscoveryJury.criteriaFor!({
      ...args,
      expected: { criteria: ['c1'], attackDiscoveries: [] },
    });
    expect(specs.map((s) => s.name)).toEqual(['Criteria']);
  });
});

describe('checkJuryCoverage', () => {
  it('accepts results carrying the jury evaluators', () => {
    const result = checkJuryCoverage(attackDiscoveryJury, [
      { name: 'Criteria', score: 1 },
      { name: 'Rubric', score: 0.5 },
    ]);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('rejects persona verdicts returned for an AD replay', () => {
    // The exact failure that produced 253 unusable cells.
    const result = checkJuryCoverage(attackDiscoveryJury, [
      { name: 'Factuality', score: 0 },
      { name: 'Relevance', score: 0.5 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.unexpected).toEqual(['Factuality', 'Relevance']);
  });

  it('reports a partially-covered jury without failing it', () => {
    const result = checkJuryCoverage(attackDiscoveryJury, [{ name: 'Criteria', score: 1 }]);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual(['Rubric']);
  });

  it('does not accept a run that produced no verdicts at all', () => {
    // Failure mode 2: the jury resolves without throwing but grades nothing.
    // The run exits 0 with no failures, so only an assertion on the evaluator
    // names present distinguishes it from a successful rejudge.
    const result = checkJuryCoverage(attackDiscoveryJury, []);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['Criteria', 'Rubric']);
  });

  it('does not accept verdicts whose scores are all null', () => {
    // A judge that answers but cannot parse its own output yields named
    // evaluators carrying no score. Counting the name as coverage would let an
    // ungraded column read as refreshed.
    const result = checkJuryCoverage(attackDiscoveryJury, [
      { name: 'Criteria', score: null },
      { name: 'Rubric', score: null },
    ]);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['Criteria', 'Rubric']);
  });
});

describe('JURY_ADAPTERS registry', () => {
  it('declares evaluator names for every jury', () => {
    for (const jury of JURY_ADAPTERS) {
      expect(jury.evaluatorNames.length).toBeGreaterThan(0);
    }
  });

  it('never maps one suite id to two juries', () => {
    const seen = new Set<string>();
    for (const jury of JURY_ADAPTERS) {
      for (const suiteId of jury.suiteIds) {
        expect(seen.has(suiteId)).toBe(false);
        seen.add(suiteId);
      }
    }
  });
});
