/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Fs from 'fs';
import Os from 'os';
import Path from 'path';

import type { EvaluableFailure, RefFileReader } from './evaluate';
import { collectJUnitFailures, collectScoutFailures, evaluateFailures } from './evaluate';

const fixture = (name: string) =>
  Fs.readFileSync(Path.resolve(__dirname, '__fixtures__', `${name}.ts.txt`), 'utf8');

const CASES_FILE =
  'x-pack/platform/test/functional_with_es_ssl/apps/cases/group2/configure_legacy.ts';
const SCOUT_FILE =
  'x-pack/platform/plugins/shared/context_engine/test/scout/api/tests/ai_indices.spec.ts';

const casesFailure: EvaluableFailure = {
  kind: 'ftr',
  file: CASES_FILE,
  fullTitle:
    'Cases Configure - legacy custom fields and templates Custom fields adds a custom field',
};
const scoutFailure: EvaluableFailure = {
  kind: 'scout',
  file: SCOUT_FILE,
  suite: 'context engine AI indices API',
  title: 'manages an AI index through its full lifecycle',
};

const readerFor = (files: Record<string, string | undefined>): RefFileReader => {
  return (ref, file) => files[`${ref}:${file}`];
};

describe('evaluateFailures', () => {
  it('marks failures as known skipped when the skip exists on main but not at the merge base', () => {
    const readFile = readerFor({
      [`main:${CASES_FILE}`]: fixture('ftr_cases_configure_legacy.after'),
      [`base:${CASES_FILE}`]: fixture('ftr_cases_configure_legacy.before'),
      [`main:${SCOUT_FILE}`]: fixture('scout_ai_indices.after'),
      [`base:${SCOUT_FILE}`]: fixture('scout_ai_indices.before'),
    });

    const result = evaluateFailures([casesFailure, scoutFailure], {
      mainRef: 'main',
      baseRef: 'base',
      readFile,
    });

    expect(result.real).toEqual([]);
    expect(result.knownSkipped).toEqual([
      { failure: casesFailure, issue: 'https://github.com/elastic/kibana/issues/280016' },
      { failure: scoutFailure, issue: 'https://github.com/elastic/kibana/issues/280639' },
    ]);
  });

  it('keeps the failure when the skip is already present at the merge base (PR un-skips it)', () => {
    const readFile = readerFor({
      [`main:${CASES_FILE}`]: fixture('ftr_cases_configure_legacy.after'),
      [`base:${CASES_FILE}`]: fixture('ftr_cases_configure_legacy.after'),
    });

    const result = evaluateFailures([casesFailure], { mainRef: 'main', baseRef: 'base', readFile });

    expect(result.knownSkipped).toEqual([]);
    expect(result.real).toEqual([casesFailure]);
  });

  it('keeps the failure when the file is gone on main or the test is not skipped there', () => {
    const readFile = readerFor({
      [`main:${CASES_FILE}`]: fixture('ftr_cases_configure_legacy.before'),
      [`base:${CASES_FILE}`]: fixture('ftr_cases_configure_legacy.before'),
    });

    const notSkipped = evaluateFailures([casesFailure], {
      mainRef: 'main',
      baseRef: 'base',
      readFile,
    });
    expect(notSkipped.real).toEqual([casesFailure]);

    const missing = evaluateFailures([scoutFailure], {
      mainRef: 'main',
      baseRef: 'base',
      readFile,
    });
    expect(missing.real).toEqual([scoutFailure]);
  });

  it('keeps the failure when the file is absent at the merge base (PR and main both added it)', () => {
    const readFile = readerFor({ [`main:${SCOUT_FILE}`]: fixture('scout_ai_indices.after') });

    const result = evaluateFailures([scoutFailure], { mainRef: 'main', baseRef: 'base', readFile });

    expect(result.knownSkipped).toHaveLength(0);
    expect(result.real).toEqual([scoutFailure]);
  });

  it('keeps failures without a file location', () => {
    const failure: EvaluableFailure = { kind: 'ftr', file: '', fullTitle: 'something' };
    const result = evaluateFailures([failure], {
      mainRef: 'main',
      baseRef: 'base',
      readFile: () => {
        throw new Error('should not be called');
      },
    });
    expect(result.real).toEqual([failure]);
  });

  it('reads each ref:file pair only once', () => {
    const readFile = jest.fn(
      readerFor({ [`main:${CASES_FILE}`]: fixture('ftr_cases_configure_legacy.after') })
    );
    evaluateFailures([casesFailure, { ...casesFailure, fullTitle: 'Cases other test' }], {
      mainRef: 'main',
      baseRef: 'base',
      readFile,
    });
    expect(readFile).toHaveBeenCalledTimes(2);
  });
});

describe('failure adapters', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'skipped-on-main-'));
  });

  afterEach(() => {
    Fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('collects FTR failures from JUnit with the decoded file path', async () => {
    const xmlPath = Path.join(tmpDir, 'report.xml');
    Fs.writeFileSync(
      xmlPath,
      `<?xml version="1.0" encoding="utf-8"?>
<testsuites name="ftr">
  <testsuite>
    <testcase name="Cases suite passes" classname="Chrome X-Pack UI Functional Tests.${CASES_FILE.replace(
      /\./g,
      '·'
    )}" time="1"></testcase>
    <testcase name="Cases suite fails" classname="Chrome X-Pack UI Functional Tests.${CASES_FILE.replace(
      /\./g,
      '·'
    )}" time="1"><failure>boom</failure></testcase>
    <testcase name="Cases suite skipped" classname="x.y" time="1"><skipped/></testcase>
  </testsuite>
</testsuites>`
    );

    expect(await collectJUnitFailures([xmlPath])).toEqual([
      { kind: 'ftr', file: CASES_FILE, fullTitle: 'Cases suite fails' },
    ]);
  });

  it('collects Scout failures from ndjson', () => {
    const ndjsonPath = Path.join(tmpDir, 'scout-failures-1.ndjson');
    Fs.writeFileSync(
      ndjsonPath,
      [
        JSON.stringify({ suite: 'suite a', title: 'test a', location: SCOUT_FILE, target: 'x' }),
        '',
        JSON.stringify({ suite: 'suite b', title: 'test b', location: 'other.spec.ts' }),
      ].join('\n')
    );

    expect(collectScoutFailures([ndjsonPath])).toEqual([
      { kind: 'scout', file: SCOUT_FILE, suite: 'suite a', title: 'test a' },
      { kind: 'scout', file: 'other.spec.ts', suite: 'suite b', title: 'test b' },
    ]);
  });

  it('turns Scout runner errors into failures that are never forgiven', () => {
    const ndjsonPath = Path.join(tmpDir, 'scout-failures-run1.ndjson');
    Fs.writeFileSync(
      ndjsonPath,
      JSON.stringify({ suite: 'suite a', title: 'test a', location: SCOUT_FILE }) + '\n'
    );
    Fs.writeFileSync(
      Path.join(tmpDir, 'scout-runner-errors-run1.json'),
      JSON.stringify({ status: 'failed', errors: ['global teardown threw'] })
    );

    const failures = collectScoutFailures([ndjsonPath]);
    const evaluation = evaluateFailures(failures, {
      mainRef: 'main',
      baseRef: 'base',
      readFile: (ref) =>
        ref === 'main'
          ? 'test.describe.skip("suite a", () => { test("test a", () => {}) })'
          : 'test.describe("suite a", () => { test("test a", () => {}) })',
    });

    expect(evaluation.real).toEqual([
      { kind: 'scout', file: '', suite: 'Scout runner', title: 'global teardown threw' },
    ]);
  });
});
