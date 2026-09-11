/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { buildMatrix } from '../../matrix/build_matrix';
import { renderMatrix } from '../../matrix/render_matrix';
import { branchBySuiteFromColumns } from './matrix';
import { parseMatrixConfig } from '../../matrix/load_matrix_config';
import type { AggregatedModelScores } from '../../matrix/query_matrix_scores';
import { matrixScoreQuery } from './matrix';

describe('matrixScoreQuery', () => {
  const query = (overrides = {}) =>
    matrixScoreQuery(
      parseMatrixConfig({
        columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], examplePrefixes: ['a'] }],
        models: [{ id: 'model-a', label: 'Model A' }],
        ...overrides,
      }),
      { suiteIds: ['suite-a'], modelIds: ['model-a'], asOf: undefined }
    );

  it('forwards asOf to the score query', () => {
    // The CLI parses --as-of, but selection happens in queryMatrixScores. If
    // this object drops the value the flag is accepted and silently ignored,
    // and the matrix publishes the runs it was told to exclude.
    const asOf = Date.parse('2026-09-01T00:00:00.000Z');
    const q = matrixScoreQuery(
      parseMatrixConfig({
        columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'] }],
        models: [{ id: 'model-a', label: 'Model A' }],
      }),
      { suiteIds: ['suite-a'], modelIds: ['model-a'], asOf }
    );

    expect(q.asOf).toBe(asOf);
  });

  it('lets a column opt out of the global self-judge exclusion', () => {
    // gemini-3.1-pro judges the attack-discovery suite and is also ranked in
    // it. The global policy blanks its cell; measured self-preference on that
    // suite is absent (it ranks itself 4th of 6), so the column opts out
    // without relaxing the policy for suites that were never audited.
    const q = query({
      scoring: { excludeSelfJudged: true },
      columns: [
        { id: 'triage', label: 'Triage', suites: ['suite-a'] },
        {
          id: 'kill-chain',
          label: 'Kill-Chain Discovery',
          suites: ['attack-discovery-agent-builder'],
          allowSelfJudged: true,
        },
      ],
    });

    // The audited suite opts out...
    expect(q.scoringBySuite?.['attack-discovery-agent-builder']?.excludeSelfJudged).toBe(false);
    // ...while every other suite is left out of the map entirely and falls
    // back to the strict global policy at the suite loop.
    expect(q.scoringBySuite?.['suite-a']).toBeUndefined();
    expect(q.scoring?.excludeSelfJudged).toBe(true);
  });

  it('forwards the opted-in scoring policy to the aggregator', () => {
    expect(query({ scoring: { useVerdictLadder: true, requireEisJudge: true } }).scoring).toEqual({
      useVerdictLadder: true,
      requireEisJudge: true,
      excludeSelfJudged: false,
    });
  });

  it('forwards no policy when the config does not opt in', () => {
    expect(query().scoring).toBeUndefined();
  });

  it('de-duplicates example prefixes across columns', () => {
    const options = query({
      columns: [
        { id: 'a', label: 'A', suites: ['s'], examplePrefixes: ['dup'] },
        { id: 'b', label: 'B', suites: ['s'], examplePrefixes: ['dup', 'other'] },
      ],
    });

    expect(options.prefixesBySuite).toEqual({ s: ['dup', 'other'] });
  });

  // Suite histories are not co-located: the migrations suite publishes on a
  // feature branch while every persona column lives on `main`. A single global
  // branch can only satisfy one of them, so the other renders blank.
  it('maps per-column branch overrides onto their suites', () => {
    const options = query({
      columns: [
        { id: 'persona', label: 'Persona', suites: ['persona-suite'] },
        {
          id: 'migrations',
          label: 'Migrations',
          suites: ['migrations-suite'],
          branch: 'feat/matrix-v3',
        },
      ],
    });

    expect(options.branchBySuite).toEqual({ 'migrations-suite': 'feat/matrix-v3' });
  });

  it('omits suites that do not override the branch', () => {
    expect(query().branchBySuite).toEqual({});
  });

  it('rejects conflicting branch overrides for a shared suite', () => {
    expect(() =>
      query({
        columns: [
          { id: 'a', label: 'A', suites: ['shared'], branch: 'branch-one' },
          { id: 'b', label: 'B', suites: ['shared'], branch: 'branch-two' },
        ],
      })
    ).toThrow(/Conflicting branch overrides for suite "shared"/);
  });

  it('accepts agreeing branch overrides for a shared suite', () => {
    const options = query({
      columns: [
        { id: 'a', label: 'A', suites: ['shared'], branch: 'same-branch' },
        { id: 'b', label: 'B', suites: ['shared'], branch: 'same-branch' },
      ],
    });

    expect(options.branchBySuite).toEqual({ shared: 'same-branch' });
  });
});

describe('matrix command empty-result guard', () => {
  const config = parseMatrixConfig({
    columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 }],
    models: [{ id: 'model-a', label: 'Model A' }],
  });

  it('renders header-only CSVs when no experiments match', () => {
    const rendered = renderMatrix(buildMatrix([], config), config);

    expect(rendered.proprietaryCsv.trim().split('\n')).toHaveLength(1);
    expect(rendered.openSourceCsv.trim().split('\n')).toHaveLength(1);
  });

  it('renders populated CSVs when experiments do match', () => {
    const aggregated: AggregatedModelScores[] = [
      {
        modelId: 'model-a',
        provider: 'anthropic',
        suites: [
          {
            suiteId: 'suite-a',
            experimentId: 'experiment-a',
            datasets: [
              {
                datasetId: 'dataset-a-id',
                datasetName: 'dataset-a',
                evaluators: [{ evaluatorName: 'correctness', mean: 0.9, count: 10 }],
              },
            ],
          },
        ],
      },
    ];

    const rendered = renderMatrix(buildMatrix(aggregated, config), config);

    expect(rendered.proprietaryCsv.trim().split('\n').length).toBeGreaterThan(1);
  });

  it('projects a branch LIST onto every suite the column reads', () => {
    // Golden migrations data is split across branches by model, so a column
    // may need several branches unioned rather than one pinned branch.
    const withList = {
      ...config,
      columns: [
        {
          ...config.columns[0],
          suites: ['migrations-suite'],
          branch: ['elastic:fix/weekly-evals-matrix', 'feat/evals-extensions-matrix-v3'],
        },
      ],
    } as unknown as typeof config;

    expect(branchBySuiteFromColumns(withList)).toEqual({
      'migrations-suite': ['elastic:fix/weekly-evals-matrix', 'feat/evals-extensions-matrix-v3'],
    });
  });

  it('treats two columns declaring the same branch list as agreeing', () => {
    // The conflict guard compares by value: two columns sharing a suite and
    // declaring an equal list must not throw just because the arrays are
    // distinct objects.
    const shared = {
      ...config,
      columns: [
        { ...config.columns[0], suites: ['migrations-suite'], branch: ['a', 'b'] },
        { ...config.columns[0], suites: ['migrations-suite'], branch: ['a', 'b'] },
      ],
    } as unknown as typeof config;

    expect(() => branchBySuiteFromColumns(shared)).not.toThrow();
  });

  it('still rejects columns that disagree on a suite branch list', () => {
    const conflicting = {
      ...config,
      columns: [
        { ...config.columns[0], suites: ['migrations-suite'], branch: ['a', 'b'] },
        { ...config.columns[0], suites: ['migrations-suite'], branch: ['a', 'c'] },
      ],
    } as unknown as typeof config;

    expect(() => branchBySuiteFromColumns(conflicting)).toThrow(/Conflicting branch overrides/);
  });

  it('produces no model rows when no experiments match', () => {
    const matrix = buildMatrix([], config);

    expect(matrix.proprietary).toHaveLength(0);
    expect(matrix.openSource).toHaveLength(0);
  });

  // Deleting either preflight call from the command is invisible to every
  // other test -- the warnings simply stop appearing, and a silently unhooked
  // warning is worse than no warning because the artifact looks checked.
  it('wires both data preflights into the matrix command', () => {
    const source = readFileSync(join(__dirname, 'matrix.ts'), 'utf8');

    expect(source).toContain('warnOnConfiguredNamesMissingFromData(config, aggregated, log)');
    expect(source).toContain('warnOnDataAboutToLeaveLookback(config, aggregated, log)');
  });
});
