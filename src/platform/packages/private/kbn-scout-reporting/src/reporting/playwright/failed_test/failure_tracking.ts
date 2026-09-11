/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import fs from 'fs';
import path from 'path';
import type { TestFailure } from '../../report/failed_test/test_failure';

export interface ScoutFailureTrackingEntry {
  id: string;
  suite: string;
  title: string;
  target: string;
  command: string;
  location: string;
  owner: string[];
  kibanaModule?: {
    id: string;
    type: string;
    visibility: string;
    group: string;
  };
  duration: number;
  error: {
    message?: string;
    stack_trace?: string;
  };
  stdout?: string;
  consoleErrors?: string;
  attachments: Array<{
    name: string;
    path?: string;
    contentType: string;
  }>;
  timestamp: string;
  buildkite?: {
    buildId?: string;
    jobId?: string;
    pipeline?: string;
    branch?: string;
  };
}

/** Errors that fail the Playwright run without belonging to any test (global errors, run timeout). */
export interface ScoutRunnerErrors {
  status: string;
  errors: string[];
}

export class ScoutFailureTracker {
  private readonly log: ToolingLog;
  private readonly trackingFilePath: string;
  private readonly runnerErrorsFilePath: string;
  // Keyed by test ID, not a plain array: a test that fails on every retry calls `addFailure`
  // more than once, and this keeps only the last attempt so its GitHub issue is updated once
  // per run rather than once per attempt.
  private readonly failures = new Map<string, ScoutFailureTrackingEntry>();

  constructor(log: ToolingLog, reportRootPath: string, runId: string) {
    this.log = log;
    // Use the same runId as the main Scout reporting system for consistency
    this.trackingFilePath = path.join(reportRootPath, `scout-failures-${runId}.ndjson`);
    this.runnerErrorsFilePath = path.join(reportRootPath, `scout-runner-errors-${runId}.json`);
  }

  /**
   * Add a test failure to the tracking file
   */
  addFailure(failure: TestFailure) {
    this.failures.set(failure.id, {
      id: failure.id,
      suite: failure.suite,
      title: failure.title,
      target: failure.target,
      command: failure.command,
      location: failure.location,
      owner: failure.owner,
      kibanaModule: failure.kibanaModule,
      duration: failure.duration,
      error: failure.error,
      stdout: failure.stdout,
      consoleErrors: failure.consoleErrors,
      attachments: failure.attachments,
      timestamp: new Date().toISOString(),
      buildkite: {
        buildId: process.env.BUILDKITE_BUILD_ID,
        jobId: process.env.BUILDKITE_JOB_ID,
        pipeline: process.env.BUILDKITE_PIPELINE_SLUG,
        branch: process.env.BUILDKITE_BRANCH,
      },
    });
  }

  /**
   * Save all tracked failures to the tracking file.
   *
   * @param excludeTestIds - IDs of tests to drop before writing, e.g. flaky tests that passed
   * on retry and so should not open/update a GitHub issue.
   */
  save({ excludeTestIds }: { excludeTestIds?: Set<string> } = {}) {
    const allFailures = [...this.failures.values()];
    const failuresToSave = excludeTestIds
      ? allFailures.filter((failure) => !excludeTestIds.has(failure.id))
      : allFailures;

    if (failuresToSave.length === 0) {
      this.log.info('No Scout failures to track');
      return;
    }

    // Ensure directory exists
    const dir = path.dirname(this.trackingFilePath);
    fs.mkdirSync(dir, { recursive: true });

    // Write failures as NDJSON
    const content = failuresToSave.map((failure) => JSON.stringify(failure)).join('\n') + '\n';

    fs.writeFileSync(this.trackingFilePath, content, 'utf-8');

    this.log.info(
      `Saved ${failuresToSave.length} Scout failures to tracking file: ${this.trackingFilePath}`
    );
  }

  /**
   * Save runner-level errors to a sidecar file next to the tracking file. Kept out of the NDJSON
   * so the GitHub issue reporter does not open issues for them; `check_skipped_on_main` reads it
   * to refuse forgiving a run whose exit code is not explained by the tracked test failures.
   */
  saveRunnerErrors(runnerErrors: ScoutRunnerErrors) {
    if (runnerErrors.errors.length === 0) {
      return;
    }

    fs.mkdirSync(path.dirname(this.runnerErrorsFilePath), { recursive: true });
    fs.writeFileSync(this.runnerErrorsFilePath, JSON.stringify(runnerErrors, null, 2), 'utf-8');

    this.log.info(
      `Saved ${runnerErrors.errors.length} Scout runner error(s) to: ${this.runnerErrorsFilePath}`
    );
  }

  /**
   * Get the path to the tracking file
   */
  getTrackingFilePath(): string {
    return this.trackingFilePath;
  }
}
