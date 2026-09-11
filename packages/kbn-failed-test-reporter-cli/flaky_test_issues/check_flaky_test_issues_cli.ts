/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Fs from 'fs';
import Path from 'path';

import { createFlagError } from '@kbn/dev-cli-errors';
import { run } from '@kbn/dev-cli-runner';
import { REPO_ROOT } from '@kbn/repo-info';
import { ScoutFlakyTests } from '@kbn/scout-reporting';

import { DEFAULT_GITHUB_REPO, GithubApi } from '../failed_tests_reporter/github_api';
import { checkFlakySuiteIssues } from './checker';

const DEFAULT_INPUT = 'target/flaky_tests/flaky_tests.json';
const DEFAULT_SUMMARY_PATH = 'target/flaky_tests/github_issues.json';
/**
 * A year covers the closed issues that could still be about a test in today's report; older ones
 * are mostly about tests since fixed, moved or removed, and fetching all of them would double the
 * requests.
 */
const DEFAULT_CLOSED_SINCE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function runCheckFlakyTestIssuesCli() {
  run(
    async ({ log, flagsReader }) => {
      const startedAt = performance.now();
      const inputPath = Path.resolve(REPO_ROOT, flagsReader.requiredString('input'));
      const summaryPath = Path.resolve(REPO_ROOT, flagsReader.requiredString('summary-path'));
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        throw createFlagError('GITHUB_TOKEN must be set to list GitHub issues');
      }
      const repo = flagsReader.requiredString('github-repo');
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        throw createFlagError('--github-repo must be of the form owner/name');
      }
      const closedSinceDays = flagsReader.requiredNumber('closed-since-days');
      if (!Number.isInteger(closedSinceDays) || closedSinceDays < 1) {
        throw createFlagError('--closed-since-days must be a positive integer');
      }
      const closedSince = new Date(Date.now() - closedSinceDays * MS_PER_DAY);

      log.info(`Reading flaky test report from ${inputPath}`);
      const { data: report } = ScoutFlakyTests.fromFile(inputPath);
      log.info(
        `Checking open failed-test issues and those closed in the last ${closedSinceDays} days in ${repo}`
      );

      const summary = await checkFlakySuiteIssues({
        report,
        github: new GithubApi({ log, token, dryRun: false, repo }),
        log,
        closedSince,
      });

      Fs.mkdirSync(Path.dirname(summaryPath), { recursive: true });
      Fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

      const { tracked, untracked } = summary.counts;
      const withOpenIssue = summary.results.filter(
        (result) =>
          result.status === 'tracked' && result.issues.some(({ state }) => state === 'open')
      ).length;
      log.info(
        `${summary.suites} flaky suites: ${tracked} tracked by existing issues ` +
          `(${withOpenIssue} by an open one), ${untracked} without any issue ` +
          `(summary in ${summaryPath})`
      );
      log.success(`Finished in ${((performance.now() - startedAt) / 1000).toFixed(2)}s`);
    },
    {
      description: `
        Tell, for every flaky test suite in a report written by
        \`node scripts/scout discover-flaky-tests\`, which GitHub failed-test issues are about it,
        open or closed: a suite issue, per-test issues, or none. Read-only: nothing is filed or edited.
        Lists every open failed-test issue and the recently closed ones, then matches locally.

        Examples:
          GITHUB_TOKEN=... node scripts/check_flaky_test_issues --input .scout/flaky_tests.json
      `,
      flags: {
        string: ['input', 'summary-path', 'github-repo', 'closed-since-days'],
        default: {
          input: DEFAULT_INPUT,
          'summary-path': DEFAULT_SUMMARY_PATH,
          'github-repo': DEFAULT_GITHUB_REPO,
          'closed-since-days': String(DEFAULT_CLOSED_SINCE_DAYS),
        },
        help: `
          --input               Flaky test report to read [default: ${DEFAULT_INPUT}]
          --summary-path        Where to write the JSON summary [default: ${DEFAULT_SUMMARY_PATH}]
          --github-repo         owner/name of the repository whose issues are checked [default: ${DEFAULT_GITHUB_REPO}]
          --closed-since-days   Only closed issues updated within this many days count as tracking a suite [default: ${DEFAULT_CLOSED_SINCE_DAYS}]
        `,
      },
    }
  );
}
