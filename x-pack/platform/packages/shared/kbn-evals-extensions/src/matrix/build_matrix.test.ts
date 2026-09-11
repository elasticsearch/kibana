/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildMatrix, rowCommitShas } from './build_matrix';
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

describe('buildMatrix tie tiers', () => {
  // Re-running one model on an unchanged commit moves its overall by ~0.2
  // (stdev over 7 haiku runs on golden). Publishing 8.54 above 8.42 as a
  // ranking therefore asserts a difference the data cannot support.
  const tierConfig: MatrixConfig = parseMatrixConfig({
    minCoverage: 1,
    overall: { runStdev: 0.198 },
    columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 }],
    models: [
      { id: 'model-a', label: 'A' },
      { id: 'model-b', label: 'B' },
      { id: 'model-c', label: 'C' },
    ],
  });

  const one = (id: string, mean: number) => ({
    suiteId: 'suite-a',
    experimentId: id,
    datasets: [{ datasetId: id, datasetName: id, evaluators: [evaluator(mean)] }],
  });

  it('ties rows inside the noise band and splits only on a real gap', () => {
    const matrix = buildMatrix(
      [
        { modelId: 'model-a', provider: 'p', suites: [one('r1', 0.85)] },
        { modelId: 'model-b', provider: 'p', suites: [one('r2', 0.84)] },
        { modelId: 'model-c', provider: 'p', suites: [one('r3', 0.4)] },
      ],
      tierConfig
    );

    const tiers = Object.fromEntries(matrix.proprietary.map((r) => [r.modelId, r.tier]));
    // 8.5 vs 8.4 is inside the interval -> same tier, not a ranking.
    expect(tiers['model-a']).toBe(tiers['model-b']);
    // 8.5 vs 4.0 clears it comfortably -> a real difference.
    expect(tiers['model-c']).toBeGreaterThan(tiers['model-a']!);
  });
});

describe('buildMatrix coverage floor', () => {
  // Reproduces the 2026-08-29 matrix: GLM-5.2 answered 2 of 24 prompts, scored
  // 10.0 on both, and outranked every frontier model. A thin run must never
  // publish an Overall number.
  const floorConfig: MatrixConfig = parseMatrixConfig({
    minCoverage: 2,
    columns: [
      { id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 },
      { id: 'detect', label: 'Detect', suites: ['suite-b'], weight: 1 },
      { id: 'hunt', label: 'Hunt', suites: ['suite-c'], weight: 1 },
    ],
    models: [
      { id: 'model-thin', label: 'Thin Model' },
      { id: 'model-broad', label: 'Broad Model' },
    ],
  });

  const suite = (suiteId: string, id: string, mean: number) => ({
    suiteId,
    experimentId: `run-${id}`,
    datasets: [{ datasetId: id, datasetName: id, evaluators: [evaluator(mean)] }],
  });

  it('withholds Overall and ranks last when scored on too few columns', () => {
    const scores: AggregatedModelScores[] = [
      // One perfect cell — a 1.0 mean that would average to a rank-topping 10.
      { modelId: 'model-thin', provider: 'zai', suites: [suite('suite-a', 'd1', 1.0)] },
      // Two solid-but-lower cells from a model that actually ran the suite.
      {
        modelId: 'model-broad',
        provider: 'anthropic',
        suites: [suite('suite-a', 'd1', 0.8), suite('suite-b', 'd2', 0.8)],
      },
    ];

    const matrix = buildMatrix(scores, floorConfig);
    const thin = matrix.proprietary.find((r) => r.modelId === 'model-thin')!;
    const broad = matrix.proprietary.find((r) => r.modelId === 'model-broad')!;

    // The thin row must not publish a number...
    expect(thin.overall.kind).toBe('insufficient-coverage');
    expect(thin.coverage.covered).toBe(1);
    // ...and must rank BELOW the model with real coverage, despite scoring 10.
    expect(broad.overall.kind).toBe('score');
    expect(matrix.proprietary.indexOf(broad)).toBeLessThan(matrix.proprietary.indexOf(thin));
  });

  it('publishes Overall once the floor is met', () => {
    const scores: AggregatedModelScores[] = [
      {
        modelId: 'model-thin',
        provider: 'zai',
        suites: [suite('suite-a', 'd1', 1.0), suite('suite-b', 'd2', 1.0)],
      },
    ];
    const matrix = buildMatrix(scores, floorConfig);
    const row = matrix.proprietary.find((r) => r.modelId === 'model-thin')!;
    expect(row.overall.kind).toBe('score');
    expect(row.coverage.covered).toBe(2);
  });
});

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

  describe('composites', () => {
    const compositeConfig: MatrixConfig = parseMatrixConfig({
      showOverall: false,
      columns: [
        { id: 'c1', label: 'C1', group: 'Group', suites: ['s1'] },
        { id: 'c2', label: 'C2', group: 'Group', suites: ['s2'] },
        { id: 'feat', label: 'Feat', suites: ['s3'] },
      ],
      composites: [
        { id: 'group_score', label: 'Group Score', from: ['c1', 'c2'] },
        { id: 'overall_score', label: 'Overall Score', from: ['group_score', 'feat'] },
      ],
      layout: ['c1', 'c2', 'group_score', 'feat', 'overall_score'],
      models: [
        { id: 'm1', label: 'M1' },
        { id: 'm2', label: 'M2' },
      ],
    });

    const suite = (suiteId: string, mean: number) => ({
      suiteId,
      experimentId: `e-${suiteId}`,
      datasets: [{ datasetId: 'd', datasetName: 'D', evaluators: [evaluator(mean)] }],
    });

    it('averages base cells into a composite and layers composites of composites', () => {
      const matrix = buildMatrix(
        [{ modelId: 'm1', suites: [suite('s1', 0.8), suite('s2', 0.6)] }],
        compositeConfig
      );
      const row = matrix.proprietary[0];

      expect(row.cells.group_score).toEqual({ kind: 'score', value: 7 });
      // feat has no data -> missing, so overall = group_score only = 7.
      expect(row.cells.feat).toEqual({ kind: 'missing' });
      expect(row.cells.overall_score).toEqual({ kind: 'score', value: 7 });
    });

    it('counts "Not recommended" sources as 0 inside a composite', () => {
      const matrix = buildMatrix(
        [{ modelId: 'm1', suites: [suite('s1', 0), suite('s2', 0.6)] }],
        compositeConfig
      );
      const row = matrix.proprietary[0];

      expect(row.cells.c1).toEqual({ kind: 'not-recommended' });
      // mean(0, 6) = 3.
      expect(row.cells.group_score).toEqual({ kind: 'score', value: 3 });
    });

    it('marks a composite missing when none of its sources have data', () => {
      const matrix = buildMatrix([{ modelId: 'm1', suites: [suite('s3', 0.9)] }], compositeConfig);
      const row = matrix.proprietary[0];

      expect(row.cells.group_score).toEqual({ kind: 'missing' });
      // overall = feat only = 9.
      expect(row.cells.overall_score).toEqual({ kind: 'score', value: 9 });
    });

    it('builds display columns in layout order and suppresses the legacy overall', () => {
      const matrix = buildMatrix(
        [{ modelId: 'm1', suites: [suite('s1', 0.8), suite('s2', 0.6)] }],
        compositeConfig
      );

      expect(matrix.displayColumns?.map((column) => column.id)).toEqual([
        'c1',
        'c2',
        'group_score',
        'feat',
        'overall_score',
      ]);
      expect(matrix.displayColumns?.find((column) => column.id === 'group_score')?.kind).toBe(
        'composite'
      );
      expect(matrix.displayColumns?.some((column) => column.kind === 'overall')).toBe(false);
      expect(matrix.displayColumns?.find((column) => column.id === 'c1')?.group).toBe('Group');
    });

    it('ranks rows by the final composite (Overall Score) descending', () => {
      const matrix = buildMatrix(
        [
          { modelId: 'm1', suites: [suite('s1', 0.3), suite('s2', 0.3)] },
          { modelId: 'm2', suites: [suite('s1', 0.9), suite('s2', 0.9)] },
        ],
        compositeConfig
      );

      expect(matrix.proprietary.map((row) => row.modelLabel)).toEqual(['M2', 'M1']);
    });

    it('throws when the layout references an unknown id', () => {
      const badConfig = parseMatrixConfig({
        columns: [{ id: 'c1', label: 'C1', suites: ['s1'] }],
        layout: ['c1', 'nope'],
        models: [{ id: 'm1', label: 'M1' }],
      });
      expect(() => buildMatrix([{ modelId: 'm1', suites: [suite('s1', 0.5)] }], badConfig)).toThrow(
        /unknown column\/composite id/
      );
    });
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

describe('buildMatrix token axis', () => {
  const tokenEvaluator = (name: string, mean: number, min: number, max: number, count = 3) => ({
    evaluatorName: name,
    mean,
    count,
    min,
    max,
  });

  const tokenAggregated: AggregatedModelScores[] = [
    {
      modelId: 'model-good',
      suites: [
        {
          suiteId: 'suite-a',
          experimentId: 'run-1',
          datasets: [
            {
              datasetId: 'd1',
              datasetName: 'D1',
              evaluators: [
                evaluator(0.9),
                tokenEvaluator('Input Tokens', 100_000, 50_000, 150_000),
                tokenEvaluator('Output Tokens', 2_000, 1_000, 3_000),
              ],
            },
          ],
        },
      ],
    },
  ];

  const tokenConfig: MatrixConfig = parseMatrixConfig({
    columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 }],
    models: [{ id: 'model-good', label: 'Good Model' }],
    tokenCost: {},
  });

  it('is omitted entirely when the config does not opt in', () => {
    expect(buildMatrix(tokenAggregated, config).tokenCost).toBeUndefined();
  });

  it('aggregates token evaluators in native units with min/max preserved', () => {
    const matrix = buildMatrix(tokenAggregated, tokenConfig);
    const cell = matrix.tokenCost!.models[0].cells[0];

    expect(cell.columnId).toBe('triage');
    expect(cell.inputTokens).toEqual({ mean: 100_000, min: 50_000, max: 150_000, count: 3 });
    expect(cell.outputTokens).toEqual({ mean: 2_000, min: 1_000, max: 3_000, count: 3 });
    expect(cell.totalMean).toBe(102_000);
  });

  it('does not let token evaluators leak into quality cells', () => {
    const matrix = buildMatrix(tokenAggregated, tokenConfig);
    // 0.9 * defaultScale(10) — unaffected by the 100k-magnitude token evaluators.
    expect(matrix.proprietary[0].cells.triage).toEqual({ kind: 'score', value: 9 });
  });

  it('weights the mean by sample count across suites', () => {
    const twoSuite: MatrixConfig = parseMatrixConfig({
      columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a', 'suite-b'], weight: 1 }],
      models: [{ id: 'model-good', label: 'Good Model' }],
      tokenCost: {},
    });
    const matrix = buildMatrix(
      [
        {
          modelId: 'model-good',
          suites: [
            {
              suiteId: 'suite-a',
              experimentId: 'r1',
              datasets: [
                {
                  datasetId: 'd1',
                  datasetName: 'D1',
                  evaluators: [tokenEvaluator('Input Tokens', 100, 100, 100, 1)],
                },
              ],
            },
            {
              suiteId: 'suite-b',
              experimentId: 'r2',
              datasets: [
                {
                  datasetId: 'd2',
                  datasetName: 'D2',
                  evaluators: [tokenEvaluator('Input Tokens', 200, 200, 200, 3)],
                },
              ],
            },
          ],
        },
      ],
      twoSuite
    );
    // (100*1 + 200*3) / 4 = 175, not the unweighted 150.
    expect(matrix.tokenCost!.models[0].cells[0].inputTokens!.mean).toBe(175);
    expect(matrix.tokenCost!.models[0].cells[0].inputTokens!.min).toBe(100);
    expect(matrix.tokenCost!.models[0].cells[0].inputTokens!.max).toBe(200);
  });

  it('omits cells with no token data', () => {
    const matrix = buildMatrix(aggregated, tokenConfig);
    expect(matrix.tokenCost!.models).toEqual([]);
  });
});

describe('buildMatrix saturated-evaluator exclusion', () => {
  // Two evaluators per model: `discriminating` separates the models, `ceiling`
  // returns effectively the same high score for everyone. Folding `ceiling`
  // into Overall drags every model toward it and compresses the spread.
  const buildScores = (): AggregatedModelScores[] =>
    [
      { id: 'model-a', discriminating: 0.9 },
      { id: 'model-b', discriminating: 0.8 },
      { id: 'model-c', discriminating: 0.7 },
      { id: 'model-d', discriminating: 0.6 },
      { id: 'model-e', discriminating: 0.5 },
      { id: 'model-f', discriminating: 0.45 },
      { id: 'model-g', discriminating: 0.4 },
      { id: 'model-h', discriminating: 0.3 },
      { id: 'model-i', discriminating: 0.2 },
      { id: 'model-j', discriminating: 0.1 },
    ].map(({ id, discriminating }) => ({
      modelId: id,
      suites: [
        {
          suiteId: 'suite-a',
          datasets: [
            {
              datasetName: 'suite-a',
              evaluators: [
                { evaluatorName: 'discriminating', mean: discriminating, count: 10 },
                { evaluatorName: 'ceiling', mean: 0.97, count: 10 },
              ],
            },
          ],
        },
      ],
    })) as unknown as AggregatedModelScores[];

  const configWith = (excludeSaturatedEvaluators: boolean): MatrixConfig =>
    parseMatrixConfig({
      minCoverage: 1,
      overall: { excludeSaturatedEvaluators },
      columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 }],
      models: [
        { id: 'model-a', label: 'A' },
        { id: 'model-b', label: 'B' },
        { id: 'model-c', label: 'C' },
        { id: 'model-d', label: 'D' },
        { id: 'model-e', label: 'E' },
        { id: 'model-f', label: 'F' },
        { id: 'model-g', label: 'G' },
        { id: 'model-h', label: 'H' },
        { id: 'model-i', label: 'I' },
        { id: 'model-j', label: 'J' },
      ],
    });

  const overallOf = (matrix: ReturnType<typeof buildMatrix>) =>
    matrix.proprietary.map((row) =>
      row.overall.kind === 'score' ? Number(row.overall.value.toFixed(3)) : undefined
    );

  it('widens the spread between models when the saturated evaluator is dropped', () => {
    const scores = buildScores();
    const before = overallOf(buildMatrix(scores, configWith(false)));
    const after = overallOf(buildMatrix(scores, configWith(true)));

    const spread = (values: Array<number | undefined>) =>
      Math.max(...(values as number[])) - Math.min(...(values as number[]));

    // Averaging in a flat evaluator halves the real difference between models.
    expect(spread(before)).toBeCloseTo(4, 3);
    expect(spread(after)).toBeCloseTo(8, 3);
    expect(spread(after)).toBeGreaterThan(spread(before));
  });

  it('reports which evaluators were judged saturated', () => {
    const matrix = buildMatrix(buildScores(), configWith(true));
    const saturated = matrix.evaluatorSaturation.filter((entry) => entry.saturated);

    expect(saturated.map((entry) => entry.evaluatorName)).toEqual(['ceiling']);
  });

  it('keeps the saturated evaluator in Overall when the config does not opt in', () => {
    const matrix = buildMatrix(buildScores(), configWith(false));

    // Detection is opt-in: nothing is reported and nothing is dropped.
    expect(matrix.evaluatorSaturation).toEqual([]);
    expect(overallOf(matrix)[0]).toBeCloseTo(9.35, 2);
    expect(overallOf(matrix).at(-1)).toBeCloseTo(5.35, 2);
  });
});

describe('buildMatrix sparse-column warning', () => {
  const sparseConfig: MatrixConfig = parseMatrixConfig({
    minCoverage: 1,
    columns: [
      { id: 'dense', label: 'Dense', suites: ['suite-a'], weight: 1 },
      { id: 'sparse', label: 'Attack Discovery', suites: ['suite-b'], weight: 1 },
    ],
    models: [
      { id: 'model-a', label: 'A' },
      { id: 'model-b', label: 'B' },
      { id: 'model-c', label: 'C' },
      { id: 'model-d', label: 'D' },
    ],
  });

  // Every model runs `suite-a`; only one ever ran `suite-b`.
  const sparseScores = ['model-a', 'model-b', 'model-c', 'model-d'].map((modelId) => ({
    modelId,
    suites: [
      {
        suiteId: 'suite-a',
        datasets: [
          {
            datasetName: 'suite-a',
            evaluators: [{ evaluatorName: 'correctness', mean: 0.8, count: 5 }],
          },
        ],
      },
      ...(modelId === 'model-a'
        ? [
            {
              suiteId: 'suite-b',
              datasets: [
                {
                  datasetName: 'suite-b',
                  evaluators: [{ evaluatorName: 'correctness', mean: 0.9, count: 5 }],
                },
              ],
            },
          ]
        : []),
    ],
  })) as unknown as AggregatedModelScores[];

  it('warns that a column covering a minority of models cannot rank', () => {
    const log = { warning: jest.fn() };
    buildMatrix(sparseScores, sparseConfig, log);

    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining('"Attack Discovery" has scores for only 1 of 4 models')
    );
  });

  it('stays quiet about a column every model ran', () => {
    const log = { warning: jest.fn() };
    buildMatrix(sparseScores, sparseConfig, log);

    expect(log.warning).not.toHaveBeenCalledWith(expect.stringContaining('"Dense"'));
  });
});

describe('buildMatrix total-score-loss guard', () => {
  // Regression guard for the failure mode that inflated the published board:
  // the per-prefix score fetch returned nothing usable, cells fell back to a
  // coarser source, and the matrix rendered normally while every Overall was
  // wrong. Root cause was `evaluator.metadata` being stripped server-side
  // (#286691), which left the verdict ladder with nothing to map.
  const lossConfig: MatrixConfig = parseMatrixConfig({
    minCoverage: 1,
    columns: [{ id: 'only', label: 'Only', suites: ['suite-a'], weight: 1 }],
    models: [
      { id: 'model-a', label: 'A' },
      { id: 'model-b', label: 'B' },
    ],
  });

  it('warns loudly when not a single cell scored', () => {
    // Models present, but no suite produced any usable evaluator score.
    const empty = [
      { modelId: 'model-a', suites: [] },
      { modelId: 'model-b', suites: [] },
    ] as unknown as AggregatedModelScores[];

    const log = { warning: jest.fn() };
    buildMatrix(empty, lossConfig, log);

    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining('No column produced a single scored cell')
    );
    expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('do NOT publish this run'));
  });

  it('stays quiet when cells actually scored', () => {
    const scored = ['model-a', 'model-b'].map((modelId) => ({
      modelId,
      suites: [
        {
          suiteId: 'suite-a',
          datasets: [
            {
              datasetName: 'suite-a',
              evaluators: [{ evaluatorName: 'correctness', mean: 0.8, count: 5 }],
            },
          ],
        },
      ],
    })) as unknown as AggregatedModelScores[];

    const log = { warning: jest.fn() };
    buildMatrix(scored, lossConfig, log);

    expect(log.warning).not.toHaveBeenCalledWith(
      expect.stringContaining('No column produced a single scored cell')
    );
  });
});

describe('per-row commit provenance', () => {
  const scores = (suites: Array<{ sha?: string; ts?: string }>): AggregatedModelScores => ({
    modelId: 'model-good',
    suites: suites.map((s, i) => ({
      suiteId: `suite-${i}`,
      experimentId: `run-${i}`,
      timestamp: s.ts,
      commitSha: s.sha,
      datasets: [{ datasetId: 'd', datasetName: 'D', evaluators: [evaluator(0.9)] }],
    })),
  });

  it('reports the commits a row was graded against, newest run first', () => {
    expect(
      rowCommitShas(
        scores([
          { sha: 'oldsha0000000', ts: '2026-08-01T00:00:00.000Z' },
          { sha: 'newsha1111111', ts: '2026-09-01T00:00:00.000Z' },
        ])
      )
    ).toEqual(['newsha1111111', 'oldsha0000000']);
  });

  it('collapses repeats so one codebase reads as one commit', () => {
    expect(rowCommitShas(scores([{ sha: 'same111' }, { sha: 'same111' }]))).toEqual(['same111']);
  });

  it('stays undefined when the experiment summary carried no commit', () => {
    expect(rowCommitShas(scores([{}]))).toBeUndefined();
    expect(rowCommitShas(undefined)).toBeUndefined();
  });

  it('warns when rows were graded against different codebases', () => {
    const log = { warning: jest.fn() };
    buildMatrix(
      [
        { ...scores([{ sha: 'aaaaaaaaaaaa1' }]), modelId: 'model-good' },
        { ...scores([{ sha: 'bbbbbbbbbbbb2' }]), modelId: 'model-oss' },
      ],
      config,
      log
    );

    expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('spans 2 commits'));
  });

  it('stays quiet when every row came from one codebase', () => {
    const log = { warning: jest.fn() };
    buildMatrix(
      [
        { ...scores([{ sha: 'aaaaaaaaaaaa1' }]), modelId: 'model-good' },
        { ...scores([{ sha: 'aaaaaaaaaaaa1' }]), modelId: 'model-oss' },
      ],
      config,
      log
    );

    expect(log.warning).not.toHaveBeenCalledWith(expect.stringContaining('spans'));
  });
});

describe('buildMatrix self-judged disclosure', () => {
  // gemini-3.1-pro judges the attack-discovery suite AND is ranked in it.
  // The column opts into `allowSelfJudged` because an audit found no
  // self-preference, so the score is publishable -- but it must not look
  // like an independently-judged one. A bare {kind:'score'} is
  // indistinguishable from an arm's-length score, which is what the
  // reporting rule forbids.
  const discloseConfig: MatrixConfig = parseMatrixConfig({
    minCoverage: 1,
    columns: [
      {
        id: 'kill-chain',
        label: 'Kill-Chain',
        suites: ['suite-a'],
        weight: 1,
        allowSelfJudged: true,
      },
      { id: 'triage', label: 'Triage', suites: ['suite-b'], weight: 1 },
    ],
    models: [{ id: 'model-a', label: 'A' }],
  });

  it('marks a score from an allowSelfJudged column as self-judged', () => {
    const matrix = buildMatrix(
      [
        {
          modelId: 'model-a',
          provider: 'p',
          suites: [
            {
              suiteId: 'suite-a',
              experimentId: 'e1',
              selfJudged: true,
              datasets: [{ datasetId: 'd', datasetName: 'd', evaluators: [evaluator(0.762)] }],
            },
            {
              suiteId: 'suite-b',
              experimentId: 'e2',
              datasets: [{ datasetId: 'd', datasetName: 'd', evaluators: [evaluator(0.8)] }],
            },
          ],
        },
      ],
      discloseConfig
    );

    const row = matrix.proprietary[0];
    const kc = row.cells['kill-chain'];
    const triage = row.cells.triage;

    // The opted-in column carries the disclosure...
    expect(kc).toMatchObject({ kind: 'score', selfJudged: true });
    // ...and a normally-judged column is NOT falsely flagged.
    expect(triage).toMatchObject({ kind: 'score' });
    expect((triage as { selfJudged?: boolean }).selfJudged).toBeUndefined();
  });

  // The opt-out is a COLUMN setting, but only some rows in that column are
  // actually self-judged: gemini judges attack-discovery, so gpt-5.4's cell in
  // that same column was graded at arm's length. Flagging the whole column
  // libels five models to disclose one, and a reader who spots one bogus flag
  // has no reason to trust the real one.
  it('flags only the rows whose judge is the graded model', () => {
    const suite = (judgedSelf: boolean) => ({
      suiteId: 'suite-a',
      experimentId: 'e1',
      selfJudged: judgedSelf,
      datasets: [{ datasetId: 'd', datasetName: 'd', evaluators: [evaluator(0.762)] }],
    });

    const own = buildMatrix(
      [{ modelId: 'model-a', provider: 'p', suites: [suite(true)] }],
      discloseConfig
    );
    const other = buildMatrix(
      [{ modelId: 'model-a', provider: 'p', suites: [suite(false)] }],
      discloseConfig
    );

    expect(own.proprietary[0].cells['kill-chain']).toMatchObject({ selfJudged: true });
    expect(
      (other.proprietary[0].cells['kill-chain'] as { selfJudged?: boolean }).selfJudged
    ).toBeUndefined();
  });
});

describe('buildMatrix withheld-vs-never-ran', () => {
  // gemini-3.1-pro self-judges the migrations suites with ~4,794 documents
  // and shows a measurable self-preference gap there (2nd under its own
  // judgement, 5th under the deterministic control), so those scores are
  // correctly withheld. Rendering the withheld cell as {kind:'missing'}
  // makes it identical to a model that never ran the suite at all, which
  // reads as a coverage gap instead of a judge-policy decision.
  const cfg: MatrixConfig = parseMatrixConfig({
    minCoverage: 1,
    columns: [{ id: 'migrations', label: 'Migrations', suites: ['suite-a'], weight: 1 }],
    models: [
      { id: 'model-a', label: 'A' },
      { id: 'model-b', label: 'B' },
    ],
  });

  it('distinguishes a withheld self-judged cell from one that never ran', () => {
    const matrix = buildMatrix(
      [
        {
          modelId: 'model-a',
          provider: 'p',
          suites: [
            {
              suiteId: 'suite-a',
              experimentId: 'e1',
              // Every score was rejected as self-judged: no datasets survive,
              // but the run exists and its size is known.
              excludedSelfJudged: 4794,
              datasets: [],
            },
          ],
        },
        // model-b never ran the suite at all.
        { modelId: 'model-b', provider: 'p', suites: [] },
      ],
      cfg
    );

    const withheld = matrix.proprietary.find((r) => r.modelId === 'model-a')!.cells.migrations;
    const neverRan = matrix.proprietary.find((r) => r.modelId === 'model-b')!.cells.migrations;

    expect(withheld).toEqual({ kind: 'excluded', reason: 'self-judged', docs: 4794 });
    expect(neverRan).toEqual({ kind: 'missing' });
  });

  it('does not claim exclusion when the suite simply produced no scores', () => {
    // A run that exists but yielded nothing for other reasons must not be
    // dressed up as a judge-policy exclusion.
    const matrix = buildMatrix(
      [
        {
          modelId: 'model-a',
          provider: 'p',
          suites: [{ suiteId: 'suite-a', experimentId: 'e1', datasets: [] }],
        },
      ],
      cfg
    );

    expect(matrix.proprietary[0].cells.migrations).toEqual({ kind: 'missing' });
  });
});

describe('errored-evaluator guard', () => {
  // A judge/quality evaluator that ERRORS is absent from the aggregate rather
  // than scored, narrowing the mean to the survivors. When the survivors are
  // the saturated contract checks (all 1.0), the cell is INFLATED. A
  // trace-cluster permission fault nulled Trajectory + SkillInvoked for
  // DeepSeek and lifted alert-analysis-a to 8.89 against 6.86 for models
  // graded on the full set -- a 2pt "win" that was pure instrument failure.
  //
  // A raw evaluator-count floor cannot catch this: a healthy frontier cell
  // legitimately has 4 scored evaluators, same as the broken row. The signal
  // that separates them is the errored-out evaluator NAME.
  const guardConfig: MatrixConfig = parseMatrixConfig({
    columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 }],
    models: [{ id: 'model-partial', label: 'Partial Model' }],
  });

  const withDatasets = (
    evaluators: Array<{ evaluatorName: string; mean: number; count: number }>,
    erroredOutEvaluators?: string[]
  ): AggregatedModelScores[] => [
    {
      modelId: 'model-partial',
      provider: 'openrouter',
      suites: [
        {
          suiteId: 'suite-a',
          experimentId: 'run-partial',
          datasets: [
            {
              datasetId: 'd1',
              datasetName: 'D1',
              evaluators,
              ...(erroredOutEvaluators ? { erroredOutEvaluators } : {}),
            },
          ],
        },
      ],
    },
  ];

  // The exact shape of the DeepSeek bug: the discriminating judged evaluators
  // errored away, leaving only saturated 1.0 contract checks behind.
  const survivingSaturatedOnly = [
    { evaluatorName: 'MinExpectedSteps', mean: 1, count: 3 },
    { evaluatorName: 'FinalAnswerPresent', mean: 1, count: 3 },
  ];

  it('refuses to publish a score when a cell-relevant evaluator errored out', () => {
    const matrix = buildMatrix(
      withDatasets(survivingSaturatedOnly, ['Trajectory', 'SkillInvoked']),
      guardConfig
    );
    const cell = matrix.proprietary[0].cells.triage;

    expect(cell.kind).toBe('insufficient-evaluators');
    expect(cell).toEqual({
      kind: 'insufficient-evaluators',
      evaluators: ['Trajectory', 'SkillInvoked'],
    });
  });

  it('publishes the score when no cell-relevant evaluator errored out', () => {
    const matrix = buildMatrix(withDatasets(survivingSaturatedOnly), guardConfig);
    expect(matrix.proprietary[0].cells.triage.kind).toBe('score');
  });

  // Without the guard the broken row scores HIGHER than a fully-measured one.
  // This is the regression that let 8.89 outrank 6.86.
  it('is what stops a partial instrument from outranking a full measurement', () => {
    const fullSet = [
      { evaluatorName: 'Factuality', mean: 0.75, count: 3 },
      { evaluatorName: 'Groundedness', mean: 0.85, count: 3 },
      { evaluatorName: 'Relevance', mean: 0.66, count: 3 },
      { evaluatorName: 'MinExpectedSteps', mean: 1, count: 3 },
      { evaluatorName: 'FinalAnswerPresent', mean: 1, count: 3 },
    ];
    const partial = buildMatrix(withDatasets(survivingSaturatedOnly), guardConfig).proprietary[0]
      .cells.triage;
    const complete = buildMatrix(withDatasets(fullSet), guardConfig).proprietary[0].cells.triage;

    // Demonstrate the inflation is real before asserting the fix suppresses it.
    expect(partial.kind).toBe('score');
    expect(complete.kind).toBe('score');
    if (partial.kind === 'score' && complete.kind === 'score') {
      expect(partial.value).toBeGreaterThan(complete.value);
    }

    // With the errored-out evaluators named, the inflated cell no longer publishes.
    const guarded = buildMatrix(withDatasets(survivingSaturatedOnly, ['Trajectory']), guardConfig)
      .proprietary[0].cells.triage;
    expect(guarded.kind).toBe('insufficient-evaluators');
  });

  // Latency racing span ingestion is the norm, not a fault: it must never flag
  // a cell. The guard keys only on evaluators that reach the cell (excluded
  // trace metrics are filtered out before the check).
  it('ignores errors on excluded trace-metric evaluators', () => {
    const matrix = buildMatrix(withDatasets(survivingSaturatedOnly, ['Latency']), guardConfig);
    expect(matrix.proprietary[0].cells.triage.kind).toBe('score');
  });

  it('does not let an unmeasured cell contribute to Overall', () => {
    const matrix = buildMatrix(withDatasets(survivingSaturatedOnly, ['Trajectory']), guardConfig);
    const overall = matrix.proprietary[0].overall;

    expect(overall.kind).not.toBe('score');
  });
});
