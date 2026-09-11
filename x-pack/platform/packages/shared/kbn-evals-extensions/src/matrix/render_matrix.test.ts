/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderMatrix } from './render_matrix';
import { parseMatrixConfig } from './load_matrix_config';
import type { Matrix } from './build_matrix';
import { buildMatrix, OVERALL_COLUMN_ID } from './build_matrix';
import type { AggregatedModelScores } from './query_matrix_scores';

const config = parseMatrixConfig({
  title: 'Test Matrix',
  columns: [
    { id: 'triage', label: 'Alert Triage', suites: ['a'] },
    { id: 'detect', label: 'Detection Engineering', suites: ['b'] },
  ],
  models: [{ id: 'm', label: 'M' }],
});

const matrix: Matrix = {
  columns: [
    { id: 'triage', label: 'Alert Triage' },
    { id: 'detect', label: 'Detection Engineering' },
  ],
  composites: [],
  displayColumns: [
    { id: 'triage', label: 'Alert Triage', kind: 'base' },
    { id: 'detect', label: 'Detection Engineering', kind: 'base' },
    { id: OVERALL_COLUMN_ID, label: 'Overall', kind: 'overall' },
  ],
  overallLabel: 'Overall',
  evaluatorSaturation: [],
  proprietary: [
    {
      modelId: 'claude',
      modelLabel: 'Claude Sonnet 4',
      openSource: false,
      cells: {
        triage: { kind: 'score', value: 9.2 },
        detect: { kind: 'not-recommended' },
      },
      overall: { kind: 'score', value: 4.6 },
      coverage: { covered: 2, total: 2 },
    },
  ],
  openSource: [
    {
      modelId: 'oss',
      modelLabel: 'GPT OSS 120B',
      openSource: true,
      cells: {
        triage: { kind: 'score', value: 7.6 },
        detect: { kind: 'missing' },
      },
      overall: { kind: 'score', value: 3.8 },
      coverage: { covered: 1, total: 2 },
    },
  ],
};

describe('renderMatrix', () => {
  it('distinguishes a judge-rejected cell from a blank one in CSV', () => {
    // A cell whose scores were all self-judged must not read as "no data".
    // Both render empty otherwise, and a reader cannot tell that re-running the
    // model is pointless until the judge is changed (2026-08-29 incident).
    const withExcluded = {
      ...matrix,
      openSource: [
        {
          ...matrix.openSource[0],
          cells: {
            triage: { kind: 'score' as const, value: 7.6 },
            detect: { kind: 'excluded' as const, reason: 'self-judged' as const, docs: 294 },
          },
        },
      ],
    };

    const { openSourceCsv } = renderMatrix(withExcluded, config);

    expect(openSourceCsv).toContain('excluded:self-judged');
    expect(openSourceCsv).not.toContain('GPT OSS 120B,7.6,,');
  });

  it('renders CSV with a header row and one row per model', () => {
    const { proprietaryCsv, openSourceCsv } = renderMatrix(matrix, config);

    expect(proprietaryCsv.split('\n')[0]).toBe('Model,Alert Triage,Detection Engineering,Overall');
    expect(proprietaryCsv).toContain('Claude Sonnet 4,9.2,Not recommended,4.6');
    // Missing cells render as empty fields.
    expect(openSourceCsv).toContain('GPT OSS 120B,7.6,,3.8');
  });

  it('renders markdown with proprietary and open-source sections', () => {
    const { markdown } = renderMatrix(matrix, config);

    expect(markdown).toContain('# Test Matrix');
    expect(markdown).toContain('## Proprietary models');
    expect(markdown).toContain('## Open-source models');
    expect(markdown).toContain('| Claude Sonnet 4 | 9.2 | Not recommended | 4.6 |');
  });

  it('produces valid JSON with the matrix structure', () => {
    const { json } = renderMatrix(matrix, config);
    const parsed = JSON.parse(json);

    expect(parsed.title).toBe('Test Matrix');
    expect(parsed.proprietary).toHaveLength(1);
    expect(parsed.openSource[0].modelLabel).toBe('GPT OSS 120B');
  });

  it('renders composite columns in displayColumns order (no trailing legacy overall)', () => {
    const compositeMatrix: Matrix = {
      columns: [
        { id: 'a', label: 'Alert Triage', group: 'Agent Builder' },
        { id: 'b', label: 'Investigation', group: 'Agent Builder' },
      ],
      composites: [
        { id: 'ab', label: 'Agent Builder Score' },
        { id: 'overall_score', label: 'Overall Score' },
      ],
      displayColumns: [
        { id: 'a', label: 'Alert Triage', group: 'Agent Builder', kind: 'base' },
        { id: 'b', label: 'Investigation', group: 'Agent Builder', kind: 'base' },
        { id: 'ab', label: 'Agent Builder Score', kind: 'composite' },
        { id: 'overall_score', label: 'Overall Score', kind: 'composite' },
      ],
      overallLabel: 'Overall',
      evaluatorSaturation: [],
      proprietary: [
        {
          modelId: 'm',
          modelLabel: 'Claude',
          openSource: false,
          cells: {
            a: { kind: 'score', value: 8.6 },
            b: { kind: 'score', value: 7.4 },
            ab: { kind: 'score', value: 8 },
            overall_score: { kind: 'score', value: 8 },
          },
          overall: { kind: 'score', value: 8 },
          coverage: { covered: 2, total: 2 },
        },
      ],
      openSource: [],
    };

    const { proprietaryCsv } = renderMatrix(compositeMatrix, config);
    // No trailing "Overall" column; composites appear in declared layout order.
    expect(proprietaryCsv.split('\n')[0]).toBe(
      'Model,Alert Triage,Investigation,Agent Builder Score,Overall Score'
    );
    expect(proprietaryCsv).toContain('Claude,8.6,7.4,8,8');
  });

  it('escapes CSV fields that contain commas or quotes', () => {
    const cfgWithComma = parseMatrixConfig({
      title: 'X',
      columns: [{ id: 'c', label: 'Col, with comma', suites: ['a'] }],
      models: [{ id: 'm', label: 'M' }],
    });
    const m: Matrix = {
      columns: [{ id: 'c', label: 'Col, with comma' }],
      composites: [],
      displayColumns: [
        { id: 'c', label: 'Col, with comma', kind: 'base' },
        { id: OVERALL_COLUMN_ID, label: 'Overall', kind: 'overall' },
      ],
      overallLabel: 'Overall',
      evaluatorSaturation: [],
      proprietary: [
        {
          modelId: 'm',
          modelLabel: 'M',
          openSource: false,
          cells: { c: { kind: 'score', value: 1 } },
          overall: { kind: 'score', value: 1 },
          coverage: { covered: 1, total: 1 },
        },
      ],
      openSource: [],
    };

    const { proprietaryCsv } = renderMatrix(m, cfgWithComma);
    expect(proprietaryCsv.split('\n')[0]).toBe('Model,"Col, with comma",Overall');
  });
});

describe('renderMatrix token axis', () => {
  const tokenConfig = parseMatrixConfig({
    title: 'Token Matrix',
    columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 }],
    models: [{ id: 'm1', label: 'M1' }],
    tokenCost: {},
  });

  const withTokens: AggregatedModelScores[] = [
    {
      modelId: 'm1',
      suites: [
        {
          suiteId: 'suite-a',
          experimentId: 'r1',
          datasets: [
            {
              datasetId: 'd1',
              datasetName: 'D1',
              evaluators: [
                { evaluatorName: 'correctness', mean: 0.9, count: 2 },
                {
                  evaluatorName: 'Input Tokens',
                  mean: 120_000,
                  count: 2,
                  min: 90_000,
                  max: 150_000,
                },
                { evaluatorName: 'Output Tokens', mean: 3_000, count: 2, min: 2_000, max: 4_000 },
              ],
            },
          ],
        },
      ],
    },
  ];

  it('serializes the saturation verdict so the Overall exclusion is auditable', () => {
    // Without this the artifact shows a score that silently changed because an
    // evaluator was dropped, and the reader has no way to see which one.
    const saturated = {
      ...matrix,
      evaluatorSaturation: [
        {
          evaluatorName: 'MinExpectedSteps',
          mean: 0.97,
          stdev: 0.03,
          range: 0.09,
          observations: 20,
          distinctValues: 5,
          saturated: true,
        },
        {
          evaluatorName: 'Factuality',
          mean: 0.35,
          stdev: 0.12,
          range: 0.58,
          observations: 20,
          distinctValues: 18,
          saturated: false,
        },
      ],
    };

    const parsed = JSON.parse(renderMatrix(saturated, config).json);

    expect(parsed.evaluatorSaturation).toHaveLength(2);
    const flagged = parsed.evaluatorSaturation.filter(
      (entry: { saturated: boolean }) => entry.saturated
    );
    expect(flagged.map((entry: { evaluatorName: string }) => entry.evaluatorName)).toEqual([
      'MinExpectedSteps',
    ]);
    expect(flagged[0].range).toBeCloseTo(0.09);
  });

  it('serializes tokenCost into matrix.json', () => {
    const { json } = renderMatrix(buildMatrix(withTokens, tokenConfig), tokenConfig);
    const parsed = JSON.parse(json);

    expect(parsed.tokenCost.models).toHaveLength(1);
    expect(parsed.tokenCost.models[0].modelId).toBe('m1');
    expect(parsed.tokenCost.models[0].cells[0]).toEqual({
      columnId: 'triage',
      inputTokens: { mean: 120_000, min: 90_000, max: 150_000, count: 2 },
      outputTokens: { mean: 3_000, min: 2_000, max: 4_000, count: 2 },
      totalMean: 123_000,
    });
  });

  it('omits the tokenCost key entirely when not configured', () => {
    const plain = parseMatrixConfig({
      title: 'Plain',
      columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 }],
      models: [{ id: 'm1', label: 'M1' }],
    });
    const { json } = renderMatrix(buildMatrix(withTokens, plain), plain);
    expect(JSON.parse(json)).not.toHaveProperty('tokenCost');
  });

  it('embeds traces into matrix.json when provided', () => {
    const traces = {
      'm1:triage': {
        question: 'What happened?',
        answer: 'An alert fired.',
        toolTrail: ['security.alerts'],
      },
    };
    const { json } = renderMatrix(matrix, config, {}, traces as never);
    const parsed = JSON.parse(json);
    expect(parsed.traces['m1:triage'].question).toBe('What happened?');
    expect(parsed.traces['m1:triage'].toolTrail).toEqual(['security.alerts']);
  });

  it('omits the traces key when trace data was not queried', () => {
    const { json } = renderMatrix(matrix, config);
    expect(JSON.parse(json)).not.toHaveProperty('traces');
  });
});

describe('renderMatrix provenance', () => {
  const provConfig = parseMatrixConfig({
    title: 'Prov Matrix',
    columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 }],
    models: [{ id: 'm1', label: 'M1' }],
  });

  const scores: AggregatedModelScores[] = [
    {
      modelId: 'm1',
      suites: [
        {
          suiteId: 'suite-a',
          experimentId: 'r1',
          datasets: [
            {
              datasetId: 'd1',
              datasetName: 'D1',
              evaluators: [{ evaluatorName: 'correctness', mean: 0.9, count: 2 }],
            },
          ],
        },
      ],
    },
  ];

  const render = (provenance?: Parameters<typeof renderMatrix>[2]) =>
    renderMatrix(buildMatrix(scores, provConfig), provConfig, provenance);

  it('stamps the filters that produced the numbers into markdown and json', () => {
    const { markdown, json } = render({
      branch: 'main',
      lookbackDays: 14,
      suiteIds: ['suite-a'],
      commitSha: 'abc123',
      buildUrl: 'https://buildkite.com/b/1',
    });

    expect(markdown).toContain('branch `main`');
    expect(markdown).toContain('14-day lookback');
    expect(markdown).toContain('commit `abc123`');
    expect(markdown).toContain('[build](https://buildkite.com/b/1)');

    const parsed = JSON.parse(json);
    expect(parsed.provenance).toEqual({
      branch: 'main',
      lookbackDays: 14,
      suiteIds: ['suite-a'],
      commitSha: 'abc123',
      buildUrl: 'https://buildkite.com/b/1',
    });
    expect(parsed.generatedAt).toEqual(expect.any(String));
  });

  it('omits unknown fields rather than stamping placeholders', () => {
    const { markdown, json } = render({ branch: 'main', lookbackDays: 7 });

    expect(markdown).toContain('branch `main`');
    expect(markdown).not.toContain('commit');
    expect(markdown).not.toContain('undefined');
    expect(JSON.parse(json).provenance).toEqual({ branch: 'main', lookbackDays: 7 });
  });

  it('still renders a dated line when no provenance is supplied', () => {
    const { markdown, json } = render();

    expect(markdown).toContain('Generated ');
    expect(markdown).not.toContain('undefined');
    expect(JSON.parse(json).provenance).toEqual({});
  });

  it('uses one timestamp for both markdown and json', () => {
    const { markdown, json } = render();
    expect(markdown).toContain(`Generated ${JSON.parse(json).generatedAt}`);
  });
});
