/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';

import {
  getCodeOwnersEntries,
  getOwningTeamsForPath,
  type CodeOwnersEntry,
} from '@kbn/code-owners';
import { ToolingLog } from '@kbn/tooling-log';
import stripANSI from 'strip-ansi';
import path from 'node:path';
import {
  BROWSER_CONSOLE_ERRORS_ATTACHMENT,
  SCOUT_REPORT_OUTPUT_ROOT,
  ScoutTestTarget,
} from '@kbn/scout-info';
import {
  excapeHtmlCharacters,
  generateTestRunId,
  getKibanaModuleData,
  getRunCommand,
  getTestTargetFromProcessArguments,
  parseStdout,
  stripFilePath,
} from '../../../helpers';
import type { TestFailure } from '../../report';
import { ScoutFailureReport } from '../../report';
import type { ScoutPlaywrightReporterOptions } from '../scout_playwright_reporter';
import { getTestIdentity } from '../test_identity';
import { ScoutFailureTracker } from './failure_tracking';

/**
 * Scout Failed Test reporter
 */
export class ScoutFailedTestReporter implements Reporter {
  private readonly log: ToolingLog;
  private readonly runId: string;
  private readonly codeOwnersEntries: CodeOwnersEntry[];
  private readonly report: ScoutFailureReport;
  private readonly command: string;
  private readonly testTarget: string;
  private failureTracker?: ScoutFailureTracker;
  private kibanaModule: TestFailure['kibanaModule'];
  /** Root suite captured in `onBegin`; walked in `onEnd` to identify tests that ended up flaky. */
  private suite?: Suite;
  /** Errors reported outside any test (global setup/teardown, config, worker crashes). */
  private readonly runnerErrors: string[] = [];

  constructor(private readonly reporterOptions: ScoutPlaywrightReporterOptions = {}) {
    this.log = new ToolingLog({
      level: 'info',
      writeTo: process.stdout,
    });

    this.report = new ScoutFailureReport(this.log);
    this.codeOwnersEntries = getCodeOwnersEntries();
    this.runId = this.reporterOptions.runId || generateTestRunId();
    this.command = getRunCommand();
    this.testTarget =
      (ScoutTestTarget.tryFromEnv() || getTestTargetFromProcessArguments())?.tag || 'unknown';
  }

  private getFileOwners(filePath: string): string[] {
    return getOwningTeamsForPath(filePath, this.codeOwnersEntries);
  }

  private formatTestError(result: TestResult): TestFailure['error'] {
    return {
      message: result.error?.message ? stripFilePath(result.error.message) : undefined,
      stack_trace: result.error?.stack
        ? excapeHtmlCharacters(stripFilePath(result.error.stack))
        : undefined,
    };
  }

  public get reportRootPath(): string {
    const outputPath = this.reporterOptions.outputPath || SCOUT_REPORT_OUTPUT_ROOT;
    return path.join(outputPath, `scout-playwright-test-failures-${this.runId}`);
  }

  printsToStdio(): boolean {
    return false; // Avoid taking over console output
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.suite = suite;

    // Get plugin or package metadata from kibana.jsonc. Playwright 1.62+ fails the
    // whole run if a reporter throws, so a missing/unresolvable manifest must not
    // abort onBegin — leave kibanaModule unset and keep reporting failures.
    if (config.configFile) {
      try {
        const metadata = getKibanaModuleData(config.configFile);
        this.kibanaModule = {
          id: metadata.id,
          type: metadata.type,
          visibility: metadata.visibility,
          group: metadata.group,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log.warning(
          `Unable to resolve kibana.jsonc for Scout config ${config.configFile}: ${message}. Failure reports will omit kibanaModule metadata.`
        );
      }
    }

    // Initialize failure tracker for GitHub issue integration
    const reportRootPath = path.join(
      SCOUT_REPORT_OUTPUT_ROOT,
      `scout-playwright-test-failures-${this.runId}`
    );
    this.failureTracker = new ScoutFailureTracker(this.log, reportRootPath, this.runId);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // Playwright marks timeouts and interruptions as separate statuses, but we still
    // want to generate a Scout failure report artifact for them (e.g. global.setup.ts timeouts).
    if (
      result.status !== 'failed' &&
      result.status !== 'timedOut' &&
      result.status !== 'interrupted'
    ) {
      return;
    }

    const { id, filePath } = getTestIdentity(test);

    const consoleErrorsAttachment = result.attachments.find(
      (a) => a.name === BROWSER_CONSOLE_ERRORS_ATTACHMENT
    );
    const consoleErrors = consoleErrorsAttachment?.body?.toString('utf-8');

    const testFailure: TestFailure = {
      id,
      suite: test.parent.title,
      title: test.title,
      target: this.testTarget,
      command: this.command,
      location: stripFilePath(test.location.file),
      owner: this.getFileOwners(filePath),
      kibanaModule: this.kibanaModule,
      duration: result.duration,
      error: this.formatTestError(result),
      stdout: result.stdout ? parseStdout(result.stdout) : undefined,
      consoleErrors,
      attachments: result.attachments
        .filter((a) => a.name !== BROWSER_CONSOLE_ERRORS_ATTACHMENT)
        .map((attachment) => ({
          name: attachment.name,
          path: attachment.path,
          contentType: attachment.contentType,
        })),
      // Zero-based attempt index; 0 is the first run, 1 the first retry.
      attempt: result.retry,
    };

    this.report.logEvent(testFailure);

    // Also track failure for GitHub issue integration
    this.failureTracker?.addFailure(testFailure);
  }

  onError(error: TestError) {
    // Playwright colors some of these (e.g. the --max-failures cutoff notice).
    const message =
      error.message ?? (error.value !== undefined ? String(error.value) : 'unknown error');
    this.runnerErrors.push(stripFilePath(stripANSI(message)));
  }

  onEnd(result: FullResult) {
    const allTests = this.suite?.allTests() ?? [];

    // A test's outcome is only knowable once every attempt has run, so flaky tests are excluded
    // here rather than in onTestEnd. Their failing attempt still stays in the report artifact
    // above (useful debugging material); only the GitHub-issue tracker excludes them, since it
    // shouldn't open issues for tests that ultimately passed.
    const flakyTestIds = new Set(
      allTests.filter((test) => test.outcome() === 'flaky').map((test) => getTestIdentity(test).id)
    );

    // 'failed' is explained by the per-test failures; a global timeout or interruption is not.
    if (result.status === 'timedout' || result.status === 'interrupted') {
      this.runnerErrors.push(`Playwright run ${result.status}`);
    }

    // Tests Playwright never ran (e.g. cut off by --max-failures) are neither failures nor
    // intentional skips; same classification as Playwright's own "did not run" summary line.
    const didNotRun = allTests.filter(
      (test) =>
        test.outcome() === 'skipped' &&
        !test.results.some((attempt) => attempt.status === 'interrupted') &&
        (test.results.length === 0 || test.expectedStatus !== 'skipped')
    ).length;
    if (didNotRun > 0) {
      this.runnerErrors.push(`${didNotRun} test(s) did not run`);
    }

    // Save & conclude the report
    try {
      this.report.save(this.reportRootPath);
      // Save failure tracking file for GitHub issue integration
      this.failureTracker?.save({ excludeTestIds: flakyTestIds });
      this.failureTracker?.saveRunnerErrors({ status: result.status, errors: this.runnerErrors });
    } finally {
      this.report.conclude();
    }
  }
}
