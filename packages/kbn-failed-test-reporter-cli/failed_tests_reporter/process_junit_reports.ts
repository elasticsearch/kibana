/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { addMessagesToReport } from './add_messages_to_report';
import { getFailures } from './get_failures';
import type { ProcessReportsParams } from './process_reports_types';
import { createFailureIssue, updateFailureIssue } from './report_failure';
import { reportFailuresToEs } from './report_failures_to_es';
import { reportFailuresToFile } from './report_failures_to_file';
import { getReportMessageIter } from './report_metadata';
import { getRootMetadata, readTestReport } from './test_report';

// At most one NEW GitHub issue is opened per report. `--bail` used to stop a config at its first
// failure, so at most one new failure per run reached the reporter; removing it (behind
// FTR_SMART_RETRY_ENABLED) let a broken config open an issue per test. Multiple distinct new
// failures in one run usually indicate a systemic/environmental failure (e.g. out of disk space),
// so we cap new issue creation at one per report. Existing tracked issues are always updated
// regardless (cheap: just a counter bump and a build link, and they carry real signal). Duplicate
// classname+name entries (e.g. retry artifacts) are deduplicated and do not consume the slot.
// See https://github.com/elastic/kibana/issues/278308.
//
// Failures the FTR marked as cascading are excluded from all of this: they are the hooks that a
// Mocha timeout forced to fail on its way out, so they all describe the same event. Only the
// failure that caused the abort reaches GitHub, the rest are listed on its report.

export async function processJUnitReports(
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
    bkMeta,
  } = params;

  for (const reportPath of reportPaths) {
    const report = await readTestReport(reportPath);
    const messages = Array.from(getReportMessageIter(report));
    const failures = getFailures(report);

    await existingIssues.loadForFailures(failures);

    if (indexInEs) {
      await reportFailuresToEs(log, failures);
    }

    const seenNewIssueKeys = new Set<string>();
    const newIssueCreated = false;
    const skippedNewFailures = 0;
    let cascadingFailures = 0;

    for (const failure of failures) {
      const pushMessage = (msg: string) => {
        messages.push({
          classname: failure.classname,
          name: failure.name,
          message: msg,
        });
      };

      if (failure.likelyIrrelevant) {
        pushMessage(
          'Failure is likely irrelevant' +
            (updateGithub ? ', so an issue was not created or updated' : '')
        );
        continue;
      }

      if (failure.cascading) {
        cascadingFailures += 1;
        pushMessage(
          'Failure is a consequence of an earlier Mocha timeout that aborted the config run, so an ' +
            'issue was not created or updated. See the failure that caused the abort.'
        );
        failure.failureCount = 0;
        continue;
      }

      // Deduplicate by classname+name: retry artifacts can emit the same test twice in one XML.
      const key = `${failure.classname}\n${failure.name}`;
      if (seenNewIssueKeys.has(key)) {
        failure.failureCount = 0;
        continue;
      }
      seenNewIssueKeys.add(key);

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
        pushMessage(`Test has failed ${newCount - 1} times on tracked branches: ${url}`);
        if (updateGithub) {
          pushMessage(`Updated existing issue: ${url} (fail count: ${newCount})`);
        }
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
      pushMessage('Test has not failed recently on tracked branches');
      if (updateGithub) {
        pushMessage(`Created new issue: ${newIssue.html_url}`);
        failure.githubIssue = newIssue.html_url;
      }
      failure.failureCount = updateGithub ? 1 : 0;
    }

    if (cascadingFailures > 0) {
      log.info(
        `Ignored ${cascadingFailures} failure(s) in ${reportPath} that cascaded from an earlier ` +
          `Mocha timeout aborting the config run. They are listed on the report of the failure ` +
          `that caused the abort.`
      );
    }

    if (skippedNewFailures > 0) {
      log.warning(
        `Opened one new issue for the first new failure and skipped ${skippedNewFailures} ` +
          `additional new failure(s) for ${reportPath}, likely a systemic failure. Existing ` +
          `tracked issues were updated normally. All failures are still indexed to ES and ` +
          `written to the failure report.`
      );
    }

    // mutates report to include messages and writes updated report to disk
    await addMessagesToReport({
      report,
      messages,
      log,
      reportPath,
      dryRun: !reportUpdate,
    });

    await reportFailuresToFile(log, failures, bkMeta, getRootMetadata(report));
  }
}
