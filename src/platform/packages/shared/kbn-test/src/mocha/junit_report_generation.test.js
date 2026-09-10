/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolve } from 'path';
import { readFile } from 'fs/promises';
import { promisify } from 'util';

import { parseString } from 'xml2js';
import del from 'del';
import Mocha from 'mocha';
import { getUniqueJunitReportPath } from '../report_path';

import { setupJUnitReportGeneration } from './junit_report_generation';

const PROJECT_DIR = resolve(__dirname, '__fixtures__/project');
const DURATION_REGEX = /^\d+\.\d{3}$/;
const ISO_DATE_SEC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const XML_PATH = getUniqueJunitReportPath(PROJECT_DIR, 'test');

const parseStringAsync = promisify(parseString);

describe('dev/mocha/junit report generation', () => {
  afterEach(() => {
    del.sync(resolve(PROJECT_DIR, 'target'));
  });

  it('reports on failed setup hooks', async () => {
    const mocha = new Mocha({
      reporter: function Runner(runner) {
        setupJUnitReportGeneration(runner, {
          reportName: 'test',
          rootDirectory: PROJECT_DIR,
        });
      },
    });

    mocha.addFile(resolve(PROJECT_DIR, 'test.js'));
    await new Promise((resolve) => mocha.run(resolve));
    const report = await parseStringAsync(await readFile(XML_PATH));

    // test case results are wrapped in <testsuites></testsuites>
    expect(report).toEqual({
      testsuites: expect.objectContaining({
        testsuite: [report.testsuites.testsuite[0]],
      }),
    });

    // the single <testsuite> element at the root contains summary data for all tests results
    const [testsuite] = report.testsuites.testsuite;
    expect(testsuite.$.time).toMatch(DURATION_REGEX);
    expect(testsuite.$.timestamp).toMatch(ISO_DATE_SEC_REGEX);
    const expectedCommandLineMultiple =
      'node scripts/jest --config src/platform/packages/shared/kbn-test/jest.config.js --runInBand --coverage=false --passWithNoTests';
    const expectedMoonCommandLine =
      'node scripts/jest.js --passWithNoTests --config src/platform/packages/shared/kbn-test/jest.config.js --maxWorkers=2 --json --passWithNoTests';
    const expectedCommandLineSingle = 'node node_modules/jest-worker/build/workers/processChild.js';

    expect(testsuite.$).toMatchObject({
      'command-line': expect.stringMatching(
        new RegExp(
          `(${expectedCommandLineMultiple}|${expectedMoonCommandLine}|${expectedCommandLineSingle})`
        )
      ),
      failures: '2',
      name: 'test',
      skipped: '1',
      tests: '4',
      'metadata-json': '{}',
      time: testsuite.$.time,
      timestamp: testsuite.$.timestamp,
    });

    // there are actually only three tests, but since the hook failed
    // it is reported as a test failure
    expect(testsuite.testcase).toHaveLength(4);
    const [testPass, testFail, beforeEachFail, testSkipped] = testsuite.testcase;

    const sharedClassname = testPass.$.classname;
    expect(sharedClassname).toMatch(/^test\.test[^\.]js$/);
    expect(testPass.$.time).toMatch(DURATION_REGEX);
    expect(testPass).toEqual({
      $: {
        classname: sharedClassname,
        name: 'SUITE works',
        time: testPass.$.time,
        'metadata-json': '{}',
      },
      'system-out': testPass['system-out'],
    });

    expect(testFail.$.time).toMatch(DURATION_REGEX);

    expect(testFail.failure[0]).toMatch(/Error: FORCE_TEST_FAIL/);
    expect(testFail).toEqual({
      $: {
        classname: sharedClassname,
        name: 'SUITE fails',
        time: testFail.$.time,
        'metadata-json': '{}',
        owners: '',
      },
      'system-out': testFail['system-out'],
      failure: [testFail.failure[0]],
    });

    expect(beforeEachFail.$.time).toMatch(DURATION_REGEX);
    expect(beforeEachFail.failure).toHaveLength(1);
    expect(beforeEachFail.failure[0]).toMatch(/Error: FORCE_HOOK_FAIL/);
    expect(beforeEachFail).toEqual({
      $: {
        classname: sharedClassname,
        name: 'SUITE SUB_SUITE "before each" hook: fail hook for "never runs"',
        time: beforeEachFail.$.time,
        'metadata-json': '{}',
        owners: '',
      },
      'system-out': testFail['system-out'],
      failure: [beforeEachFail.failure[0]],
    });

    expect(testSkipped).toEqual({
      $: {
        classname: sharedClassname,
        name: 'SUITE SUB_SUITE never runs',
        'metadata-json': '{}',
      },
      'system-out': ['-- logs are only reported for failed tests --'],
      skipped: [''],
    });
  });

  it('marks failures trailing a mocha timeout as cascading', async () => {
    const xmlPath = getUniqueJunitReportPath(PROJECT_DIR, 'timeout');
    const mocha = new Mocha({
      reporter: function Runner(runner) {
        setupJUnitReportGeneration(runner, {
          reportName: 'timeout',
          rootDirectory: PROJECT_DIR,
        });
      },
    });

    mocha.addFile(resolve(PROJECT_DIR, 'timeout.js'));
    await new Promise((resolve) => mocha.run(resolve));
    const report = await parseStringAsync(await readFile(xmlPath));

    const [rootCause, cascading] = report.testsuites.testsuite[0].testcase;

    expect(rootCause.failure[0]).toMatch(/Timeout of 1ms exceeded/);
    expect(rootCause.$.name).toBe('TIMEOUT_SUITE "before all" hook: root cause for "never runs"');
    expect(rootCause.$['cascading-failure']).toBeUndefined();

    expect(cascading.failure[0]).toMatch(/Timeout of 1ms exceeded/);
    expect(cascading.$.name).toBe('TIMEOUT_SUITE "after all" hook: cascading for "never runs"');
    expect(cascading.$['cascading-failure']).toBe('true');
  });
});
