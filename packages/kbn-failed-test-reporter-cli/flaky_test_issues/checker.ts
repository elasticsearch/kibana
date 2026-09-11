/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FlakyTestReport } from '@kbn/scout-reporting';
import type { ToolingLog } from '@kbn/tooling-log';
import type { GithubApi, GithubIssue, GithubIssueState } from '../failed_tests_reporter/github_api';
import {
  candidateIssues,
  describeIssue,
  findMatchingIssues,
  indexIssues,
  type IssueMatch,
} from './match_issues';
import { groupIntoSuites } from './suites';

/**
 * Label shared with the issues `report_failed_tests` files for individual failures, so flaky
 * suites flow through the same triage: team labelling, `/skip` and the stale sweep.
 */
export const FAILED_TEST_LABEL = 'failed-test';

export interface CheckFlakySuiteIssuesOptions {
  report: FlakyTestReport;
  github: GithubApi;
  log: ToolingLog;
  /**
   * Closed issues updated before this time are not fetched and so never count as tracking a
   * suite; every open issue does, however old.
   */
  closedSince: Date;
}

export interface MatchedIssueRef {
  number: number;
  url: string;
  title: string;
  state: GithubIssueState;
  match: IssueMatch;
}

export type FlakySuiteIssueStatus =
  /** Issues about the suite exist, open or closed; strongest match first. */
  | { status: 'tracked'; filePath: string; issues: MatchedIssueRef[] }
  /** No issue mentions the suite at all. */
  | { status: 'untracked'; filePath: string };

export interface FlakySuiteIssuesSummary {
  generatedAt: Date;
  suites: number;
  /** `failed-test` issues checked: every open one and the closed ones updated since `closedSince`. */
  issues: { open: number; closed: number; closedSince: Date };
  counts: Record<FlakySuiteIssueStatus['status'], number>;
  results: FlakySuiteIssueStatus[];
}

/**
 * Every open `failed-test` issue plus the closed ones updated since `closedSince`, via the issue
 * listing rather than the search API: no result cap, no query length limit and only the core
 * rate limit, so a few thousand issues cost under a hundred requests. Matching happens locally.
 */
const fetchFailedTestIssues = async (
  github: GithubApi,
  closedSince: Date,
  log: ToolingLog
): Promise<{ issues: GithubIssue[]; open: number; closed: number }> => {
  const requestsBefore = github.getRequestCount();
  const open = await github.listIssues({ state: 'open', labels: [FAILED_TEST_LABEL] });
  log.info(`Fetched ${open.length} open ${FAILED_TEST_LABEL} issues`);

  // Ascending by update time so issues updated while paging land on later pages, not earlier ones
  const closed = await github.listIssues({
    state: 'closed',
    labels: [FAILED_TEST_LABEL],
    since: closedSince,
    sort: 'updated',
    direction: 'asc',
  });
  log.info(
    `Fetched ${closed.length} ${FAILED_TEST_LABEL} issues closed and updated since ` +
      `${closedSince.toISOString()} (${
        github.getRequestCount() - requestsBefore
      } requests in total)`
  );

  // An issue closed between the two listings is in both; keep the later, closed, version
  const byNumber = new Map<number, GithubIssue>();
  for (const issue of [...open, ...closed]) {
    byNumber.set(issue.number, issue);
  }
  return { issues: [...byNumber.values()], open: open.length, closed: closed.length };
};

/**
 * Tells, for every flaky suite in the report, which GitHub `failed-test` issues are about it,
 * open or closed: a suite issue or per-test issues. Read-only: nothing is filed, edited or
 * commented on.
 */
export const checkFlakySuiteIssues = async ({
  report,
  github,
  log,
  closedSince,
}: CheckFlakySuiteIssuesOptions): Promise<FlakySuiteIssuesSummary> => {
  const suites = groupIntoSuites(report.flaky);
  log.info(`${report.flaky.length} flaky tests in ${suites.length} suites`);

  const { issues, open, closed } = await fetchFailedTestIssues(github, closedSince, log);
  const index = indexIssues(issues.map(describeIssue));

  const results: FlakySuiteIssueStatus[] = [];
  const counts: FlakySuiteIssuesSummary['counts'] = { tracked: 0, untracked: 0 };

  for (const suite of suites) {
    const { filePath } = suite;
    const matches = findMatchingIssues(suite, candidateIssues(suite, index));
    if (matches.length === 0) {
      log.info(`no issue: ${filePath}`);
      results.push({ status: 'untracked', filePath });
      counts.untracked += 1;
      continue;
    }

    const refs = matches.map(({ issue, match }) => `#${issue.number} (${match}, ${issue.state})`);
    log.info(`tracked by ${refs.join(', ')}: ${filePath}`);
    results.push({
      status: 'tracked',
      filePath,
      issues: matches.map(({ issue: { number, html_url: url, title, state }, match }) => ({
        number,
        url,
        title,
        state,
        match,
      })),
    });
    counts.tracked += 1;
  }

  return {
    generatedAt: report.generatedAt,
    suites: suites.length,
    issues: { open, closed, closedSince },
    counts,
    results,
  };
};
