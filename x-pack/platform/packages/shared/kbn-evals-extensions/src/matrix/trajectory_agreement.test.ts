/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  answerSimilarity,
  answersFromDocs,
  cellAgreement,
  firstDivergence,
  intervalsOverlap,
  pathContractFromDocs,
  resolveProbe,
  rowAgreement,
  sequenceSimilarity,
  trailsEqual,
  trailSetsEqual,
  trailsFromDocs,
  wilsonInterval,
} from './trajectory_agreement';

describe('trailsEqual / sequenceSimilarity', () => {
  it('treats identical tool_id sequences as equal', () => {
    expect(trailsEqual(['load_skill', 'search'], ['load_skill', 'search'])).toBe(true);
  });

  it('does not treat reorder as equal — order is the path', () => {
    expect(trailsEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('reports 1 for two empty trails and 0 for empty vs non-empty', () => {
    expect(sequenceSimilarity([], [])).toBe(1);
    expect(sequenceSimilarity([], ['a'])).toBe(0);
  });

  it('scores a shared prefix below 1', () => {
    const sim = sequenceSimilarity(['a', 'b', 'c'], ['a', 'b', 'd']);
    expect(sim).toBeCloseTo(0.666, 2);
  });
});

describe('cellAgreement', () => {
  it('marks a single trail unmeasured, not 0 and not 1', () => {
    expect(cellAgreement([['a']])).toEqual({ status: 'unmeasured', repetitions: 1 });
    expect(cellAgreement([])).toEqual({ status: 'unmeasured', repetitions: 0 });
  });

  it('reports identicalRate 1 when every pair matches', () => {
    const a = cellAgreement([
      ['load_skill', 'search'],
      ['load_skill', 'search'],
      ['load_skill', 'search'],
    ]);
    expect(a.status).toBe('measured');
    expect(a.identicalRate).toBe(1);
    expect(a.sequenceSimilarity).toBe(1);
  });

  it('reports identicalRate 0 when no pair matches, even if similar', () => {
    const a = cellAgreement([['generate_workflow'], ['sml_search', 'discover_apis']]);
    expect(a.identicalRate).toBe(0);
    expect(a.sequenceSimilarity).toBeLessThan(1);
  });
});

describe('trailsFromDocs', () => {
  const step = (toolId: string) => ({ type: 'tool_call', tool_id: toolId });

  it('keeps one trail per repetition_index, first doc wins', () => {
    const trails = trailsFromDocs([
      { task: { repetition_index: 0, output: { steps: [step('a'), step('b')] } } },
      // same rep, different evaluator — must not become a second trail
      { task: { repetition_index: 0, output: { steps: [step('a'), step('b')] } } },
      { task: { repetition_index: 1, output: { steps: [step('a')] } } },
    ]);
    expect(trails).toEqual([['a', 'b'], ['a']]);
  });

  it('never keys on tool_call_id — only tool_id is collected', () => {
    const trails = trailsFromDocs([
      {
        task: {
          repetition_index: 0,
          output: {
            steps: [{ type: 'tool_call', tool_id: 'search', tool_call_id: 'toolu_AAA' } as never],
          },
        },
      },
      {
        task: {
          repetition_index: 1,
          output: {
            steps: [{ type: 'tool_call', tool_id: 'search', tool_call_id: 'toolu_BBB' } as never],
          },
        },
      },
    ]);
    expect(trails).toEqual([['search'], ['search']]);
    expect(cellAgreement(trails).identicalRate).toBe(1);
  });
});

describe('rowAgreement', () => {
  it('stays unmeasured when every cell is a single rep', () => {
    const row = rowAgreement(
      [
        { model: 'opus', example: 'a', trails: [['x']] },
        { model: 'opus', example: 'b', trails: [['y']] },
      ],
      'opus'
    );
    expect(row.status).toBe('unmeasured');
    expect(row.identicalRate).toBeUndefined();
    expect(row.measuredCells).toBe(0);
  });

  it('averages only measured cells and ignores other models', () => {
    const row = rowAgreement(
      [
        {
          model: 'opus',
          example: 'a',
          trails: [['x'], ['x']],
        },
        {
          model: 'opus',
          example: 'b',
          trails: [['y'], ['z']],
        },
        { model: 'gpt', example: 'a', trails: [['x'], ['x']] },
      ],
      'opus'
    );
    expect(row.status).toBe('measured');
    expect(row.measuredCells).toBe(2);
    expect(row.identicalRate).toBe(0.5);
  });
});

describe('answersFromDocs / pathContractFromDocs', () => {
  const doc = (rep: number, message: string, pathContract?: string) => ({
    task: { repetition_index: rep, output: { messages: [{ message }] } },
    example: pathContract ? { metadata: { pathContract } } : {},
  });

  it('returns one answer per repetition, ordered by repetition index', () => {
    const long = 'a'.repeat(60);
    expect(answersFromDocs([doc(1, `${long}-second`), doc(0, `${long}-first`)])).toEqual([
      `${long}-first`,
      `${long}-second`,
    ]);
  });

  it('aligns with trailsFromDocs so answer pairs match path pairs', () => {
    const long = 'a'.repeat(60);
    const docs = [
      {
        ...doc(0, `${long}-x`),
        task: { repetition_index: 0, output: { steps: [], messages: [{ message: `${long}-x` }] } },
      },
      {
        ...doc(1, `${long}-y`),
        task: { repetition_index: 1, output: { steps: [], messages: [{ message: `${long}-y` }] } },
      },
    ];
    expect(answersFromDocs(docs).length).toBe(trailsFromDocs(docs).length);
  });

  it('reads the declared contract and returns undefined for pre-field corpora', () => {
    expect(pathContractFromDocs([doc(0, 'x', 'probe')])).toBe('probe');
    expect(pathContractFromDocs([doc(0, 'x')])).toBeUndefined();
  });
});

describe('trailSetsEqual', () => {
  it('treats a reordered trail as the same tool set', () => {
    expect(trailSetsEqual(['a', 'b'], ['b', 'a'])).toBe(true);
    // ...while exact-sequence equality does not — that gap is the order-only churn.
    expect(trailsEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('ignores repetition of the same tool', () => {
    expect(trailSetsEqual(['a', 'a', 'b'], ['b', 'a'])).toBe(true);
  });

  it('separates a genuinely different tool from a reordering', () => {
    expect(trailSetsEqual(['a', 'b'], ['a', 'c'])).toBe(false);
  });
});

describe('cellAgreement toolSetRate', () => {
  it('scores order-only churn as full tool-set agreement but zero exact agreement', () => {
    const agreement = cellAgreement([
      ['search', 'load_skill'],
      ['load_skill', 'search'],
    ]);
    expect(agreement.identicalRate).toBe(0);
    expect(agreement.toolSetRate).toBe(1);
  });

  it('scores a different tool as disagreement on both metrics', () => {
    const agreement = cellAgreement([['search'], ['execute_esql']]);
    expect(agreement.identicalRate).toBe(0);
    expect(agreement.toolSetRate).toBe(0);
  });
});

describe('resolveProbe', () => {
  it('prefers the declared contract over the example id', () => {
    // A hunt-prefixed example the dataset declares rankable must be treated as
    // rankable: the dataset is the source of truth, not the id.
    expect(resolveProbe('threat-hunting-a', 'rankable')).toEqual({
      probe: false,
      source: 'declared',
    });
    expect(resolveProbe('workflow-authoring-a', 'probe')).toEqual({
      probe: true,
      source: 'declared',
    });
  });

  it('falls back to the legacy prefix list and reports it, for pre-field corpora', () => {
    expect(resolveProbe('alert-analysis-a')).toEqual({ probe: true, source: 'legacy-prefix' });
    expect(resolveProbe('entity-analytics-c')).toEqual({ probe: true, source: 'legacy-prefix' });
    expect(resolveProbe('workflow-authoring-a')).toEqual({
      probe: false,
      source: 'legacy-prefix',
    });
  });
});

describe('wilsonInterval', () => {
  it('brackets the point estimate and stays inside [0, 1]', () => {
    const wide = wilsonInterval(7, 27);
    expect(wide.low).toBeGreaterThan(0.1);
    expect(wide.high).toBeLessThan(0.5);
    expect(wide.low).toBeLessThan(7 / 27);
    expect(wide.high).toBeGreaterThan(7 / 27);
  });

  it('does not run below zero at a zero rate', () => {
    const zero = wilsonInterval(0, 10);
    expect(zero.low).toBe(0);
    expect(zero.high).toBeGreaterThan(0);
  });

  it('narrows as the sample grows', () => {
    const small = wilsonInterval(5, 20);
    const large = wilsonInterval(50, 200);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });
});

describe('intervalsOverlap', () => {
  it('treats two small-sample rates a few points apart as indistinguishable', () => {
    // 26% and 22% over ~27 pairs each — the case the board must not order.
    expect(intervalsOverlap(wilsonInterval(7, 27), wilsonInterval(6, 27))).toBe(true);
  });

  it('separates rates that genuinely differ at adequate sample size', () => {
    expect(intervalsOverlap(wilsonInterval(10, 200), wilsonInterval(180, 200))).toBe(false);
  });
});

describe('answerSimilarity', () => {
  it('scores identical text 1 and disjoint text 0', () => {
    expect(answerSimilarity('the host was compromised', 'the host was compromised')).toBe(1);
    expect(answerSimilarity('alpha bravo', 'charlie delta')).toBe(0);
  });

  it('ignores case and punctuation', () => {
    expect(answerSimilarity('Host: compromised!', 'host compromised')).toBe(1);
  });
});

describe('firstDivergence', () => {
  it('reports the index and tool where two paths split', () => {
    expect(firstDivergence(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual({ step: 1, tool: 'b' });
  });

  it('reports the extra step when one path is a prefix of the other', () => {
    expect(firstDivergence(['a', 'b'], ['a', 'b', 'c'])).toEqual({ step: 2, tool: 'c' });
  });

  it('returns undefined for identical paths', () => {
    expect(firstDivergence(['a', 'b'], ['a', 'b'])).toBeUndefined();
  });
});
