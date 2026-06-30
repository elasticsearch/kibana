/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderMatrix } from './render_matrix';
import { parseMatrixConfig } from './load_matrix_config';
import type { Matrix } from './build_matrix';

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
  overallLabel: 'Overall',
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
    },
  ],
};

describe('renderMatrix', () => {
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

  it('escapes CSV fields that contain commas or quotes', () => {
    const cfgWithComma = parseMatrixConfig({
      title: 'X',
      columns: [{ id: 'c', label: 'Col, with comma', suites: ['a'] }],
      models: [{ id: 'm', label: 'M' }],
    });
    const m: Matrix = {
      columns: [{ id: 'c', label: 'Col, with comma' }],
      overallLabel: 'Overall',
      proprietary: [
        {
          modelId: 'm',
          modelLabel: 'M',
          openSource: false,
          cells: { c: { kind: 'score', value: 1 } },
          overall: { kind: 'score', value: 1 },
        },
      ],
      openSource: [],
    };

    const { proprietaryCsv } = renderMatrix(m, cfgWithComma);
    expect(proprietaryCsv.split('\n')[0]).toBe('Model,"Col, with comma",Overall');
  });
});
