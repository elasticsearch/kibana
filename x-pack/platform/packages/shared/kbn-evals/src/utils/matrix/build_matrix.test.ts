/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildMatrix } from './build_matrix';
import { parseMatrixConfig, type MatrixConfig } from './load_matrix_config';
import type { AggregatedModelScores } from './query_matrix_scores';

const config: MatrixConfig = parseMatrixConfig({
  columns: [
    { id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 },
    { id: 'detect', label: 'Detect', suites: ['suite-b'], weight: 2 },
  ],
  models: [
    { id: 'model-good', label: 'Good Model' },
    { id: 'model-oss', label: 'OSS Model', openSource: true },
    { id: 'model-missing', label: 'Absent Model' },
  ],
});

const evaluator = (mean: number, count = 10) => ({ evaluatorName: 'correctness', mean, count });

const aggregated: AggregatedModelScores[] = [
  {
    modelId: 'model-good',
    provider: 'anthropic',
    suites: [
      {
        suiteId: 'suite-a',
        experimentId: 'run-1',
        datasets: [{ datasetId: 'd1', datasetName: 'D1', evaluators: [evaluator(0.9)] }],
      },
      {
        suiteId: 'suite-b',
        experimentId: 'run-2',
        datasets: [{ datasetId: 'd2', datasetName: 'D2', evaluators: [evaluator(0.8)] }],
      },
    ],
  },
  {
    modelId: 'model-oss',
    provider: 'meta',
    suites: [
      {
        suiteId: 'suite-a',
        experimentId: 'run-3',
        datasets: [{ datasetId: 'd1', datasetName: 'D1', evaluators: [evaluator(0.5)] }],
      },
      // No suite-b data -> "detect" column missing for this model.
    ],
  },
];

describe('buildMatrix', () => {
  it('scales evaluator means onto a 0-10 scale and splits proprietary/open-source', () => {
    const matrix = buildMatrix(aggregated, config);

    expect(matrix.proprietary).toHaveLength(1);
    expect(matrix.openSource).toHaveLength(1);

    const good = matrix.proprietary[0];
    expect(good.modelLabel).toBe('Good Model');
    expect(good.cells.triage).toEqual({ kind: 'score', value: 9 });
    expect(good.cells.detect).toEqual({ kind: 'score', value: 8 });
    // Weighted overall: (9*1 + 8*2) / 3 = 8.33
    expect(good.overall).toEqual({ kind: 'score', value: 8.33 });
  });

  it('marks columns with no data as missing and counts them as 0 in the overall', () => {
    const matrix = buildMatrix(aggregated, config);
    const oss = matrix.openSource[0];

    expect(oss.cells.triage).toEqual({ kind: 'score', value: 5 });
    expect(oss.cells.detect).toEqual({ kind: 'missing' });
    // detect is missing (excluded entirely), so overall = triage only = 5.
    expect(oss.overall).toEqual({ kind: 'score', value: 5 });
  });

  it('skips models absent from the aggregated data', () => {
    const matrix = buildMatrix(aggregated, config);
    const labels = [...matrix.proprietary, ...matrix.openSource].map((row) => row.modelLabel);
    expect(labels).not.toContain('Absent Model');
  });

  it('renders "not recommended" when a scaled score is at/under the threshold', () => {
    const zeroConfig = parseMatrixConfig({
      columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'] }],
      models: [{ id: 'm', label: 'M' }],
    });
    const matrix = buildMatrix(
      [
        {
          modelId: 'm',
          suites: [
            {
              suiteId: 'suite-a',
              experimentId: 'r',
              datasets: [{ datasetId: 'd', datasetName: 'D', evaluators: [evaluator(0)] }],
            },
          ],
        },
      ],
      zeroConfig
    );

    expect(matrix.proprietary[0].cells.triage).toEqual({ kind: 'not-recommended' });
  });

  it('excludes observability-tier evaluators (latency/tokens/tool calls) by default', () => {
    const matrix = buildMatrix(
      [
        {
          modelId: 'm',
          suites: [
            {
              suiteId: 'suite-a',
              experimentId: 'r',
              datasets: [
                {
                  datasetId: 'd',
                  datasetName: 'D',
                  evaluators: [
                    { evaluatorName: 'Factuality', mean: 0.8, count: 10 },
                    { evaluatorName: 'Latency', mean: 4200, count: 10 },
                    { evaluatorName: 'Input Tokens', mean: 51234, count: 10 },
                    { evaluatorName: 'Tool Calls', mean: 7, count: 10 },
                    { evaluatorName: 'Skill Invoked (alert-analysis)', mean: 1, count: 10 },
                  ],
                },
              ],
            },
          ],
        },
      ],
      parseMatrixConfig({
        columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'] }],
        models: [{ id: 'm', label: 'M' }],
      })
    );

    // Only Factuality (0.8) contributes -> 0.8 * 10 = 8, not blown out by tokens/latency.
    expect(matrix.proprietary[0].cells.triage).toEqual({ kind: 'score', value: 8 });
  });

  it('honors a column evaluator allowlist over the global exclusion list', () => {
    const matrix = buildMatrix(
      [
        {
          modelId: 'm',
          suites: [
            {
              suiteId: 'suite-a',
              experimentId: 'r',
              datasets: [
                {
                  datasetId: 'd',
                  datasetName: 'D',
                  evaluators: [
                    { evaluatorName: 'Factuality', mean: 0.8, count: 10 },
                    { evaluatorName: 'Latency', mean: 0.2, count: 10 },
                  ],
                },
              ],
            },
          ],
        },
      ],
      parseMatrixConfig({
        // Explicit allowlist including 'Latency' opts it back in despite the default exclusion.
        columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], evaluators: ['Latency'] }],
        models: [{ id: 'm', label: 'M' }],
      })
    );

    expect(matrix.proprietary[0].cells.triage).toEqual({ kind: 'score', value: 2 });
  });

  it('sorts rows by overall score descending', () => {
    const matrix = buildMatrix(
      [
        {
          modelId: 'model-good',
          suites: [
            {
              suiteId: 'suite-a',
              experimentId: 'r1',
              datasets: [{ datasetId: 'd', datasetName: 'D', evaluators: [evaluator(0.3)] }],
            },
          ],
        },
        {
          modelId: 'model-missing',
          suites: [
            {
              suiteId: 'suite-a',
              experimentId: 'r2',
              datasets: [{ datasetId: 'd', datasetName: 'D', evaluators: [evaluator(0.9)] }],
            },
          ],
        },
      ],
      parseMatrixConfig({
        columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'] }],
        models: [
          { id: 'model-good', label: 'Lower' },
          { id: 'model-missing', label: 'Higher' },
        ],
      })
    );

    expect(matrix.proprietary.map((row) => row.modelLabel)).toEqual(['Higher', 'Lower']);
  });
});
