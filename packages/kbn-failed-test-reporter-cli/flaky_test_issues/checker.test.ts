/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ToolingLog } from '@kbn/tooling-log';
import type { GithubIssue, ListIssuesOptions } from '../failed_tests_reporter/github_api';
import { updateIssueMetadata } from '../failed_tests_reporter/issue_metadata';
import { checkFlakySuiteIssues } from './checker';
import { flakyReport, flakyTest, githubIssue, SUITE_PATH } from './test_fixtures';

jest.mock('../failed_tests_reporter/github_api');
const { GithubApi } = jest.requireMock('../failed_tests_reporter/github_api');

const log = new ToolingLog();
const CLOSED_SINCE = new Date('2025-09-09T09:04:41.000Z');

/** Serves the listings from one set of issues, open and closed ones by their state. */
const createGithubApi = (issues: GithubIssue[] = []) => {
  const api = new GithubApi();
  api.getRequestCount.mockReturnValue(0);
  api.listIssues.mockImplementation(async ({ state }: ListIssuesOptions) =>
    issues.filter((issue) => state === 'all' || issue.state === state)
  );
  return api;
};

const suiteIssue = (number: number, filePath = SUITE_PATH, state: GithubIssue['state'] = 'open') =>
  githubIssue({ number, title: `Flaky Scout test suite: ${filePath}`, state });

const scoutTestIssue = (number: number, testId: string, filePath = SUITE_PATH) =>
  githubIssue({
    number,
    title: `Failing test: Suite - test ${testId}`,
    body: updateIssueMetadata(`| Test ID | ${testId} |\n| Location | ${filePath} |`, {
      'test.class': 'Suite',
      'test.name': `test ${testId}`,
      'test.type': 'scout',
    }),
  });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkFlakySuiteIssues', () => {
  it('lists every open failed-test issue and the closed ones updated since the horizon', async () => {
    const github = createGithubApi([
      githubIssue({ number: 1, state: 'open' }),
      githubIssue({ number: 2, state: 'closed' }),
      githubIssue({ number: 3, state: 'closed' }),
    ]);

    const summary = await checkFlakySuiteIssues({
      report: flakyReport([flakyTest()]),
      github,
      log,
      closedSince: CLOSED_SINCE,
    });

    expect(github.listIssues).toHaveBeenCalledTimes(2);
    expect(github.listIssues).toHaveBeenNthCalledWith(1, {
      state: 'open',
      labels: ['failed-test'],
    });
    expect(github.listIssues).toHaveBeenNthCalledWith(2, {
      state: 'closed',
      labels: ['failed-test'],
      since: CLOSED_SINCE,
      sort: 'updated',
      direction: 'asc',
    });
    expect(summary.issues).toEqual({ open: 1, closed: 2, closedSince: CLOSED_SINCE });
  });

  it('lists every issue about a suite, open or closed, and tells untracked suites apart', async () => {
    const github = createGithubApi([
      suiteIssue(42, 'tracked.spec.ts', 'closed'),
      scoutTestIssue(43, 'tracked-1', 'tracked.spec.ts'),
      scoutTestIssue(44, 'mid-1', 'mid.spec.ts'),
      scoutTestIssue(45, 'unrelated', 'elsewhere.spec.ts'),
    ]);
    const report = flakyReport([
      flakyTest({ filePath: 'low.spec.ts', testId: 'low-1', failedBuilds: 2 }),
      flakyTest({ filePath: 'tracked.spec.ts', testId: 'tracked-1', failedBuilds: 20 }),
      flakyTest({ filePath: 'mid.spec.ts', testId: 'mid-1', failedBuilds: 10 }),
      flakyTest({ filePath: 'mid.spec.ts', testId: 'mid-2', failedBuilds: 3 }),
    ]);

    const summary = await checkFlakySuiteIssues({
      report,
      github,
      log,
      closedSince: CLOSED_SINCE,
    });

    expect(summary.suites).toBe(3);
    expect(summary.issues).toEqual({ open: 3, closed: 1, closedSince: CLOSED_SINCE });
    expect(summary.counts).toEqual({ tracked: 2, untracked: 1 });
    expect(summary.results).toEqual([
      {
        status: 'tracked',
        filePath: 'tracked.spec.ts',
        issues: [
          {
            number: 42,
            url: 'https://github.com/elastic/kibana/issues/42',
            title: 'Flaky Scout test suite: tracked.spec.ts',
            state: 'closed',
            match: 'suite',
          },
          {
            number: 43,
            url: 'https://github.com/elastic/kibana/issues/43',
            title: 'Failing test: Suite - test tracked-1',
            state: 'open',
            match: 'test',
          },
        ],
      },
      {
        status: 'tracked',
        filePath: 'mid.spec.ts',
        issues: [
          {
            number: 44,
            url: 'https://github.com/elastic/kibana/issues/44',
            title: 'Failing test: Suite - test mid-1',
            state: 'open',
            match: 'test',
          },
        ],
      },
      { status: 'untracked', filePath: 'low.spec.ts' },
    ]);
  });

  it('keeps the closed version of an issue closed while the listings ran', async () => {
    const github = createGithubApi();
    // The same issue comes back from both listings: open first, closed a moment later
    github.listIssues.mockImplementation(async ({ state }: ListIssuesOptions) => [
      githubIssue({ number: 7, state: state === 'open' ? 'open' : 'closed', body: 'x.spec.ts' }),
    ]);
    const report = flakyReport([flakyTest({ filePath: 'x.spec.ts', testId: 'x-1' })]);

    const summary = await checkFlakySuiteIssues({ report, github, log, closedSince: CLOSED_SINCE });

    expect(summary.results).toEqual([
      {
        status: 'tracked',
        filePath: 'x.spec.ts',
        issues: [
          {
            number: 7,
            url: 'https://github.com/elastic/kibana/issues/7',
            title: 'Issue #7',
            state: 'closed',
            match: 'file',
          },
        ],
      },
    ]);
  });

  it('never writes to GitHub', async () => {
    const github = createGithubApi();
    await checkFlakySuiteIssues({
      report: flakyReport([flakyTest()]),
      github,
      log,
      closedSince: CLOSED_SINCE,
    });

    expect(github.createIssue).not.toHaveBeenCalled();
    expect(github.editIssueBodyAndEnsureOpen).not.toHaveBeenCalled();
    expect(github.addIssueComment).not.toHaveBeenCalled();
  });
});
