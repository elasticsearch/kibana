/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';
import { escape } from 'he';
import Path from 'path';
import { getScoutFailures, type ScoutTestFailureExtended } from './get_scout_failures';
import type { ProcessReportsParams } from './process_reports_types';
import { createFailureIssue, updateFailureIssue } from './report_failure';
import { reportFailuresToEs } from './report_failures_to_es';

// Sidecar file written next to the Scout HTML reports so `generateScoutTestFailureArtifacts`
// can pick up the GitHub issue link and failure count without re-parsing the HTML report.
export const SCOUT_GITHUB_ISSUES_FILENAME = 'github-issues.json';

export interface ScoutGithubIssueDetails {
  githubIssue: string;
  failureCount: number;
}

export const updateScoutHtmlReport = ({
  log,
  reportDir,
  failure,
  reportUpdate,
}: {
  log: ProcessReportsParams['log'];
  reportDir: string;
  failure: ScoutTestFailureExtended;
  reportUpdate: boolean;
}) => {
  const htmlReportPath = Path.join(reportDir, `${failure.id}.html`);
  if (!fs.existsSync(htmlReportPath)) {
    log.warning(`Scout HTML report not found: ${htmlReportPath}`);
    return;
  }

  const fileContent = fs.readFileSync(htmlReportPath, 'utf-8');
  const failureCount = failure.failureCount ?? 0;
  const githubIssue = failure.githubIssue ? escape(failure.githubIssue) : undefined;

  let updatedContent = fileContent;
  if (githubIssue) {
    const badgeHtml = `<span class="badge rounded-pill bg-danger" id="failure-count">${failureCount}</span>`;
    const issueLinkHtml = `<a id="github-issue-link" href="${githubIssue}" target="_blank">${githubIssue}</a>`;
    const trackedBranchesLine = `<strong>Failures in tracked branches</strong>: ${badgeHtml} ${issueLinkHtml}`;

    updatedContent = updatedContent.replace(
      /<div[^>]*id="tracked-branches-status"[^>]*>[\s\S]*?<\/div>/,
      `<div class="section" id="tracked-branches-status">${trackedBranchesLine}</div>`
    );
  }

  if (updatedContent === fileContent) {
    return;
  }

  if (!reportUpdate) {
    log.info(`Report update disabled, skipping HTML update for ${htmlReportPath}`);
    return;
  }

  fs.writeFileSync(htmlReportPath, updatedContent, 'utf-8');
};

export async function processScoutReports(
  reportPaths: string[],
  params: ProcessReportsParams
): Promise<void> {
  const {
    log,
    existingIssues,
    buildUrl,
    githubApi,
    branch,
    pipeline,
    prependTitle,
    updateGithub,
    indexInEs,
    reportUpdate,
  } = params;

  for (const reportPath of reportPaths) {
    log.info('Processing Scout report:', reportPath);
    const failures: ScoutTestFailureExtended[] = await getScoutFailures(reportPath);

    if (failures.length === 0) {
      log.info('No Scout failures found in:', reportPath);
      continue;
    }

    log.info('Found', failures.length, 'Scout failures in:', reportPath);

    await existingIssues.loadForFailures(failures);

    if (indexInEs) {
      await reportFailuresToEs(log, failures);
    }

    const reportDir = Path.dirname(reportPath);
    const githubIssues: Record<string, ScoutGithubIssueDetails> = {};

    const recordGithubIssue = (failure: ScoutTestFailureExtended) => {
      if (failure.githubIssue) {
        githubIssues[failure.id] = {
          githubIssue: failure.githubIssue,
          failureCount: failure.failureCount ?? 0,
        };
      }
    };

    for (const failure of failures) {
      if (failure.likelyIrrelevant) {
        log.info(`Scout failure is likely irrelevant: ${failure.classname} - ${failure.name}`);
        continue;
      }

      const existingIssue = existingIssues.getForFailure(failure);
      if (existingIssue) {
        const { newBody, newCount } = await updateFailureIssue(
          buildUrl,
          existingIssue,
          githubApi,
          branch,
          pipeline,
          failure
        );
        const url = existingIssue.github.htmlUrl;
        existingIssue.github.body = newBody;
        failure.githubIssue = url;
        failure.failureCount = updateGithub ? newCount : newCount - 1;
        if (updateGithub) {
          log.info(`Updated existing Scout issue: ${url} (fail count: ${newCount})`);
        }
        updateScoutHtmlReport({ log, reportDir, failure, reportUpdate });
        recordGithubIssue(failure);
        continue;
      }

      const newIssue = await createFailureIssue(
        buildUrl,
        failure,
        githubApi,
        branch,
        pipeline,
        prependTitle
      );
      existingIssues.addNewlyCreated(failure, newIssue);
      if (updateGithub) {
        log.info(`Created new Scout issue: ${newIssue.html_url}`);
        failure.githubIssue = newIssue.html_url;
      }
      failure.failureCount = updateGithub ? 1 : 0;
      updateScoutHtmlReport({ log, reportDir, failure, reportUpdate });
      recordGithubIssue(failure);
    }

    if (Object.keys(githubIssues).length > 0) {
      fs.writeFileSync(
        Path.join(reportDir, SCOUT_GITHUB_ISSUES_FILENAME),
        JSON.stringify(githubIssues, null, 2),
        'utf-8'
      );
    }
  }
}
