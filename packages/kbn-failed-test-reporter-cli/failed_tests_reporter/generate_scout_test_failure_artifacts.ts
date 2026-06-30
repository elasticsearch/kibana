/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';

import type { ToolingLog } from '@kbn/tooling-log';
import { createHash } from 'crypto';
import fs from 'fs';
import globby from 'globby';
import type { BuildkiteMetadata } from './buildkite_metadata';
import {
  SCOUT_GITHUB_ISSUES_FILENAME,
  type ScoutGithubIssueDetails,
} from './process_scout_reports';

const SCOUT_TEST_FAILURE_DIR_PATTERN = '.scout/reports/scout-playwright-test-failures-*';
const SUMMARY_REPORT_FILENAME = 'test-failures-summary.json';

// `processScoutReports` persists the GitHub issue link and failure count per failure id in
// `SCOUT_GITHUB_ISSUES_FILENAME`. Load it so the Buildkite/Slack failure summary can render
// the `[N failures]` link the same way it does for FTR failures.
const loadGithubIssues = (dirPath: string): Record<string, ScoutGithubIssueDetails> => {
  const filePath = Path.join(dirPath, SCOUT_GITHUB_ISSUES_FILENAME);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

export async function generateScoutTestFailureArtifacts({
  log,
  bkMeta,
}: {
  log: ToolingLog;
  bkMeta: BuildkiteMetadata;
}) {
  log.info('Searching for Scout test failure reports');

  const dirs = await globby(SCOUT_TEST_FAILURE_DIR_PATTERN, {
    onlyDirectories: true,
  });

  if (dirs.length === 0) {
    log.info(`No directories found matching pattern: ${SCOUT_TEST_FAILURE_DIR_PATTERN}`);
    return;
  }

  log.info(`Found ${dirs.length} directories matching pattern: ${SCOUT_TEST_FAILURE_DIR_PATTERN}`);
  for (const dirPath of dirs) {
    const summaryFilePath = Path.join(dirPath, SUMMARY_REPORT_FILENAME);
    // Check if summary JSON exists
    if (!fs.existsSync(summaryFilePath)) {
      log.info(`Summary file not found in: ${dirPath}, skipping artifact generation`);
      continue;
    }

    const summaryData: Array<{ name: string; htmlReportFilename: string }> = JSON.parse(
      fs.readFileSync(summaryFilePath, 'utf-8')
    );
    const githubIssues = loadGithubIssues(dirPath);

    log.info(`Creating failure artifacts for report in ${dirPath}`);
    for (const { name, htmlReportFilename } of summaryData) {
      const htmlFilePath = Path.join(dirPath, htmlReportFilename);
      const failureHTML = fs.readFileSync(htmlFilePath, 'utf-8');
      const failureId = Path.basename(htmlReportFilename, '.html');
      const { githubIssue, failureCount } = githubIssues[failureId] ?? {};

      const hash = createHash('sha256').update(name).digest('hex');
      const filenameBase = `${
        process.env.BUILDKITE_JOB_ID ? process.env.BUILDKITE_JOB_ID + '_' : ''
      }${hash}`;
      const dir = Path.join('target', 'test_failures');
      const failureJSON = JSON.stringify(
        {
          name,
          hash,
          buildId: bkMeta.buildId,
          jobId: bkMeta.jobId,
          url: bkMeta.url,
          jobUrl: bkMeta.jobUrl,
          jobName: bkMeta.jobName,
          ...(githubIssue ? { githubIssue } : {}),
          ...(failureCount !== undefined ? { failureCount } : {}),
        },
        null,
        2
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(Path.join(dir, `${filenameBase}.html`), failureHTML, 'utf8');
      fs.writeFileSync(Path.join(dir, `${filenameBase}.json`), failureJSON, 'utf8');
    }
  }
}
