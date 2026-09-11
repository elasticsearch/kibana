/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Matrix } from './build_matrix';
import { renderReliabilityHtml } from './render_reliability_html';

const matrix: Matrix = {
  columns: [],
  composites: [],
  displayColumns: [],
  overallLabel: 'Overall',
  evaluatorSaturation: [],
  proprietary: [
    {
      modelId: 'measured',
      modelLabel: 'Measured',
      openSource: false,
      cells: {},
      overall: { kind: 'score', value: 8 },
      capability: { kind: 'score', value: 9 },
      judgedQuality: { kind: 'score', value: 7 },
      coverage: { covered: 8, total: 8 },
      tier: 1,
    },
    {
      modelId: 'single',
      modelLabel: 'Single run',
      openSource: false,
      cells: {},
      overall: { kind: 'score', value: 7 },
      capability: { kind: 'score', value: 6 },
      judgedQuality: { kind: 'score', value: 8 },
      coverage: { covered: 8, total: 8 },
      tier: 1,
    },
  ],
  openSource: [],
};

describe('renderReliabilityHtml', () => {
  it('renders a separate reliability artifact without treating unmeasured as zero', () => {
    const html = renderReliabilityHtml(matrix, {
      'measured:example-a': { repTrails: [['search'], ['search']] },
      'measured:example-b': { repTrails: [['search'], ['load_skill']] },
      'single:example-a': { repTrails: [['search']] },
    });
    expect(html).toContain('Capability · Reliability · Judged quality');
    expect(html).toContain('<strong>50%</strong>');
    expect(html).toContain('9.00');
    expect(html).toContain('7.00');
    expect(html).toContain('Unmeasured');
    expect(html).not.toContain('Unmeasured</span><small>0');
  });

  it('excludes probe examples from the identical-path rate', () => {
    const html = renderReliabilityHtml(matrix, {
      'measured:alert-analysis-a': { repTrails: [['search'], ['load_skill']] },
      'measured:workflow-authoring-a': { repTrails: [['search'], ['search']] },
    });
    expect(html).toContain('<strong>100%</strong>');
    expect(html).not.toContain('<strong>50%</strong>');
  });

  it('reports the pair count and interval instead of a bare rate', () => {
    const html = renderReliabilityHtml(matrix, {
      'measured:example-a': { repTrails: [['search'], ['search']] },
      'measured:example-b': { repTrails: [['search'], ['load_skill']] },
    });
    // 2 pairs is a near-useless sample; the page must say so rather than
    // presenting 50% as a finding.
    expect(html).toContain('2 pairs');
    expect(html).toMatch(/\(\d+%–\d+%\)/);
  });

  it('marks measured rows as tied when their intervals overlap', () => {
    const html = renderReliabilityHtml(matrix, {
      'measured:example-a': { repTrails: [['search'], ['search']] },
      'measured:example-b': { repTrails: [['search'], ['load_skill']] },
      'single:example-a': { repTrails: [['search'], ['search']] },
      'single:example-b': { repTrails: [['search'], ['load_skill']] },
    });
    expect(html).toContain('statistically tied');
  });

  it('prefers the declared path contract over the legacy prefix guess', () => {
    const html = renderReliabilityHtml(matrix, {
      // Hunt-prefixed but declared rankable: it must count, and the page must
      // not claim any cell was legacy-classified.
      'measured:alert-analysis-a': {
        repTrails: [['search'], ['load_skill']],
        pathContract: 'rankable',
      },
    });
    expect(html).toContain('<strong>0%</strong>');
    expect(html).not.toContain('legacy example-prefix list');
  });

  it('discloses legacy classification for corpora predating pathContract', () => {
    const html = renderReliabilityHtml(matrix, {
      'measured:workflow-authoring-a': { repTrails: [['search'], ['search']] },
    });
    expect(html).toContain('legacy example-prefix list');
  });

  it('reports answer similarity separately from path agreement', () => {
    const answer = 'the host was compromised via a scheduled task '.repeat(3);
    const html = renderReliabilityHtml(matrix, {
      'measured:example-a': {
        repTrails: [['search'], ['search']],
        repAnswers: [answer, 'a completely different conclusion entirely here now'],
      },
    });
    // Identical paths, divergent answers: the board must not imply one from
    // the other.
    expect(html).toContain('<strong>100%</strong>');
    expect(html).toContain('answer similarity');
  });

  it('says what an unmeasured row needs instead of leaving it blank', () => {
    const html = renderReliabilityHtml(matrix, {
      'measured:example-a': { repTrails: [['search'], ['search']] },
    });
    expect(html).toContain('needs k&ge;5');
  });

  it('discloses a dirty working tree in provenance', () => {
    const html = renderReliabilityHtml(
      matrix,
      { 'measured:example-a': { repTrails: [['search'], ['search']] } },
      { commitSha: 'abc123', dirtyWorkingTree: true }
    );
    expect(html).toContain('uncommitted changes present');
  });

  describe('judge agreement column', () => {
    const verdict = (
      modelId: string,
      judgeId: string,
      example: string,
      evaluator: string,
      score: number
    ) => ({ modelId, judgeId, example, repetition: 0, evaluator, score });

    it('renders Unmeasured when no judge verdicts are supplied', () => {
      const html = renderReliabilityHtml(matrix, {}, {});
      expect(html).toContain('Judge agreement');
      expect(html).toContain('no verdicts');
    });

    it('renders Single judge, never a percentage, for one-judge models', () => {
      const html = renderReliabilityHtml(matrix, {}, {}, [
        verdict('measured', 'gemini', 'ex-1', 'Relevance', 1),
        verdict('measured', 'gemini', 'ex-2', 'Relevance', 1),
      ]);
      expect(html).toContain('Single judge');
      expect(html).toContain('no second opinion');
      // The regression that matters: a lone judge must not read as consensus.
      expect(html).not.toContain('100.0%');
    });

    it('renders agreement with its interval and pair count', () => {
      const html = renderReliabilityHtml(matrix, {}, {}, [
        verdict('measured', 'gemini', 'ex-1', 'Relevance', 1),
        verdict('measured', 'sonnet', 'ex-1', 'Relevance', 1),
        verdict('measured', 'gemini', 'ex-2', 'Relevance', 1),
        verdict('measured', 'sonnet', 'ex-2', 'Relevance', 0),
      ]);
      expect(html).toContain('50.0%');
      expect(html).toContain('2 paired verdicts');
      expect(html).toContain('95% CI');
    });

    it('names the worst evaluator with its flip interval', () => {
      const html = renderReliabilityHtml(matrix, {}, {}, [
        verdict('measured', 'gemini', 'ex-1', 'Relevance', 1),
        verdict('measured', 'sonnet', 'ex-1', 'Relevance', 0),
      ]);
      expect(html).toContain('worst:');
      expect(html).toContain('Relevance');
    });

    it('states that agreement is not correctness', () => {
      const html = renderReliabilityHtml(matrix, {}, {}, [
        verdict('measured', 'gemini', 'ex-1', 'Relevance', 1),
        verdict('measured', 'sonnet', 'ex-1', 'Relevance', 1),
      ]);
      expect(html).toContain('both judges can agree and both be wrong');
    });
  });
});
