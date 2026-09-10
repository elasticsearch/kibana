/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import stripAnsi from 'strip-ansi';
import { getCodeOwnersEntries, getOwningTeamsForPath } from '@kbn/code-owners';
import type { CodeOwnersEntry } from '@kbn/code-owners';

import { toRepoRelativePaths } from './failure_text';
import type { FailedTestCase, TestReport } from './test_report';
import { makeFailedTestCaseWithSuiteIter } from './test_report';

export type JUnitTestType = 'ftr' | 'jest' | 'cypress';

export type TestFailure = FailedTestCase['$'] & {
  failure: string;
  likelyIrrelevant: boolean;
  'system-out'?: string;
  githubIssue?: string;
  failureCount?: number;
  commandLine?: string;
  owners?: string;
  testType?: JUnitTestType;
  location?: string;
  /**
   * Set when the failure only happened because an earlier Mocha timeout aborted the run. These are
   * kept for the record but never reported to GitHub and get no artifacts of their own.
   */
  cascading?: boolean;
};

const getText = (node?: Array<string | { _: string }>) => {
  if (!node) {
    return '';
  }

  const [nodeWrapped] = node;

  const text =
    nodeWrapped && typeof nodeWrapped === 'object' && typeof nodeWrapped._ === 'string'
      ? nodeWrapped._
      : String(nodeWrapped);

  return toRepoRelativePaths(stripAnsi(text));
};

/**
 * The report name is the human readable prefix of a `classname` attribute, e.g.
 * "Chrome X-Pack UI Functional Tests" in
 * "Chrome X-Pack UI Functional Tests.x-pack/.../sample_data·js".
 */
export function getReportNameFromClassname(classname: string): string {
  const idx = classname.indexOf('.');
  return idx === -1 ? classname : classname.slice(0, idx);
}

/**
 * The source location is encoded in the `classname` attribute as
 * `${reportName}.${path}` where the path has its `.` characters replaced by the
 * `·` character (see the JUnit reporters and the Cypress junit_transformer).
 * This decodes the path back into a repo relative location.
 */
export function getLocationFromClassname(classname: string): string {
  const idx = classname.indexOf('.');
  if (idx === -1) {
    return '';
  }
  return classname.slice(idx + 1).replace(/·/g, '.');
}

/**
 * Best-effort detection of the test framework that produced a failure so it can
 * be surfaced in the issue metadata. Scout failures are handled separately.
 */
function getTestType(rootName: string | undefined, classname: string): JUnitTestType | undefined {
  if (/cypress/i.test(getReportNameFromClassname(classname))) {
    return 'cypress';
  }
  if (rootName === 'jest' || rootName === 'ftr') {
    return rootName;
  }
  return undefined;
}

function getRootSuiteName(report: TestReport): string | undefined {
  return 'testsuites' in report ? report.testsuites?.$?.name : undefined;
}

/**
 * Resolve code owners from a repository-relative location. JUnit reporters only stamp the
 * `owners` attribute on FTR failures, so this fills the gap for Jest and Cypress.
 */
function getOwnersFromLocation(
  location: string,
  codeOwnersEntries: CodeOwnersEntry[]
): string | undefined {
  if (!location || location === 'unknown') {
    return undefined;
  }

  try {
    const teams = getOwningTeamsForPath(location, codeOwnersEntries);
    return teams.length > 0 ? teams.join(',') : undefined;
  } catch {
    return undefined;
  }
}

const isLikelyIrrelevant = (name: string, failure: string) => {
  if (
    failure.includes('NoSuchSessionError: This driver instance does not have a valid session ID') ||
    failure.includes(
      'NoSuchSessionError: Tried to run command without establishing a connection'
    ) ||
    failure.includes('NoSuchSessionError: invalid session id')
  ) {
    return true;
  }

  if (failure.includes('Error: No Living connections')) {
    return true;
  }

  if (
    name.includes('"after all" hook') &&
    failure.includes(`Cannot read property 'shutdown' of undefined`)
  ) {
    return true;
  }

  if (
    failure.includes('Unable to read artifact info') &&
    failure.includes('Service Temporarily Unavailable')
  ) {
    return true;
  }

  if (failure.includes('Unable to fetch Kibana status API response from Kibana')) {
    return true;
  }

  if (failure.includes('Unable to read snapshot manifest: Internal Server Error')) {
    return true;
  }

  return false;
};

export function getFailures(report: TestReport) {
  const failures: TestFailure[] = [];

  const commandLine = getCommandLineFromReport(report);
  const rootName = getRootSuiteName(report);

  // Cache code owner entries once per report for the owners fallback lookup.
  let codeOwnersEntries: CodeOwnersEntry[] = [];
  try {
    codeOwnersEntries = getCodeOwnersEntries();
  } catch {
    codeOwnersEntries = [];
  }

  for (const { testCase, testSuite } of makeFailedTestCaseWithSuiteIter(report)) {
    const failure = getText(testCase.failure);
    const likelyIrrelevant = isLikelyIrrelevant(testCase.$.name, failure);
    const testType = getTestType(rootName, testCase.$.classname);
    // Jest classnames contain only the test directory, while the enclosing suite
    // name contains the repository-relative test file path.
    const location =
      testType === 'jest' && testSuite.$.name
        ? testSuite.$.name
        : getLocationFromClassname(testCase.$.classname);
    // FTR stamps `owners` in the JUnit report, but Jest and Cypress do not, so
    // fall back to resolving them from the source location.
    const owners = testCase.$.owners || getOwnersFromLocation(location, codeOwnersEntries);

    const failureObj: TestFailure = {
      // unwrap xml weirdness
      ...testCase.$,
      // Strip ANSI color characters
      failure,
      likelyIrrelevant,
      'system-out': getText(testCase['system-out']),
      commandLine,
      owners,
      testType,
      location,
    };

    if (testCase.$['cascading-failure'] === 'true') {
      failureObj.cascading = true;
    }

    // cleaning up duplicates
    delete failureObj['command-line'];
    delete failureObj['cascading-failure'];

    failures.push(failureObj);
  }

  return failures;
}

function getCommandLineFromReport(report: TestReport) {
  if ('testsuites' in report) {
    return report.testsuites?.testsuite?.[0]?.$['command-line'] || '';
  } else {
    return report.testsuite?.$['command-line'] || '';
  }
}
