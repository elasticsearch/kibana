/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import config from '../persona_matrix.config.json';
import suitesMetadata from '../../../../../../.buildkite/pipelines/evals/evals.suites.json';

/**
 * The shipped persona matrix config, not a fixture.
 *
 * The scoring policy decides whether a published cell can be reproduced, so a
 * silent drop of this block during an edit has to fail the build rather than
 * quietly restore the old scoring basis.
 */
describe('persona_matrix.config.json scoring policy', () => {
  it('scores judged evaluators by verdict and admits only reproducible judges', () => {
    expect(config.scoring).toEqual({
      useVerdictLadder: true,
      requireEisJudge: true,
      excludeSelfJudged: true,
    });
  });

  it('warns that these numbers are not comparable to older matrices', () => {
    const notes: string[] = config.provenance?.methodologyNotes ?? [];

    expect(notes.some((note) => note.includes('NOT comparable'))).toBe(true);
    expect(notes.some((note) => note.includes('verdict'))).toBe(true);
  });
});

/**
 * A column whose `suites` entry does not match a registered eval suite id still
 * renders — it just comes back permanently blank, because the matrix queries
 * `listExperiments({ suiteId })` and silently gets nothing. That failure is
 * invisible in a generated matrix (an empty cell looks like "not run yet"), so
 * the wiring is asserted here instead.
 */
describe('persona_matrix.config.json column wiring', () => {
  const registeredSuiteIds: string[] = suitesMetadata.suites.map((suite) => suite.id);

  it('references only suite ids that are registered in evals.suites.json', () => {
    const referenced = [...new Set(config.columns.flatMap((column) => column.suites))];
    const unknown = referenced.filter((suiteId) => !registeredSuiteIds.includes(suiteId));

    expect(unknown).toEqual([]);
  });

  it('covers attack discovery and automatic migrations alongside the persona prompts', () => {
    const suitesByColumn = new Map(config.columns.map((column) => [column.id, column.suites]));

    // The live suite is attack-discovery-agent-builder: the legacy attack-discovery
    // id still has docs but only ~2 per evaluator, which published a near-zero
    // score for models that actually pass it 1.0 on the real suite.
    expect(suitesByColumn.get('attack-discovery')).toEqual(['attack-discovery-agent-builder']);
    expect(suitesByColumn.get('migrations-rules')).toEqual(['security-automatic-migrations']);
    expect(suitesByColumn.get('migrations-dashboards')).toEqual(['security-automatic-migrations']);
  });

  it('gives every column a unique id so cells cannot overwrite each other', () => {
    const ids = config.columns.map((column) => column.id);

    expect(ids).toHaveLength(new Set(ids).size);
  });
});

/**
 * The extra suites do not run on the same branch as the persona prompts: attack
 * discovery's weekly job lives on its feature branch and automatic migrations on
 * the weekly-evals-matrix branch. Reading them from the global `branch` (main)
 * returns nothing, which renders as an empty column rather than an error — the
 * exact failure that published a matrix with 0/21 translation cells while ~2,500
 * scored documents sat in the golden cluster.
 */
describe('persona_matrix.config.json extra-suite branch pins', () => {
  const branchByColumn = new Map(config.columns.map((column) => [column.id, column.branch]));

  it('unions main with the branch attack discovery runs were first exported on', () => {
    // Sweep runs export on main; the historical rows live on the feature
    // branch. Pinning only the feature branch filters every new run out, so
    // the column reads the union.
    expect(branchByColumn.get('attack-discovery')).toStrictEqual([
      'main',
      'patrykkopycinski:feat/attack-discovery-agent-builder-evals',
      'feat/evals-extensions-matrix-v3',
    ]);
  });

  it('unions every branch that holds migrations runs for a distinct model', () => {
    // Golden migrations data is split across branches by model: the weekly
    // branch holds six models, 4.6-sonnet has a newer run on the endpoint
    // branch, and 4.5-sonnet only ever ran here. Sweep runs add main. Pinning
    // one branch blanks the others' cells, so the column reads the union.
    const expected = [
      'main',
      'elastic:fix/weekly-evals-matrix',
      'elastic:feat/siem-migrations-invoke-endpoint',
      'feat/evals-extensions-matrix-v3',
    ];

    expect(branchByColumn.get('migrations-rules')).toStrictEqual(expected);
    expect(branchByColumn.get('migrations-dashboards')).toStrictEqual(expected);
  });

  it('keeps both migration columns on one branch set so the suite is queried once', () => {
    // branchBySuiteFromColumns throws on disagreement; asserting equality here
    // names the constraint at the config instead of at a generator stack trace.
    expect(branchByColumn.get('migrations-rules')).toStrictEqual(
      branchByColumn.get('migrations-dashboards')
    );
  });

  it('keeps a lookback window wide enough to reach those runs', () => {
    // The pinned branches last exported 2026-07-30 and 2026-08-11; a 14-day
    // window silently drops them even with the branch pinned correctly.
    expect(config.lookbackDays).toBeGreaterThanOrEqual(45);
  });
});
