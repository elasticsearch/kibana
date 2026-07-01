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
  TestStep,
} from '@playwright/test/reporter';

import path from 'node:path';
import { ToolingLog } from '@kbn/tooling-log';
import {
  BROWSER_CONSOLE_ERRORS_ATTACHMENT,
  SCOUT_REPORT_OUTPUT_ROOT,
  SCOUT_UNIFIED_CONFIG_PATH_REGEX,
  ScoutTestRunConfigCategory,
  ScoutTestTarget,
} from '@kbn/scout-info';
import stripANSI from 'strip-ansi';
import { REPO_ROOT } from '@kbn/repo-info';
import {
  type CodeOwnersEntry,
  type CodeOwnerArea,
  getCodeOwnersEntries,
  getOwningTeamsForPath,
  findAreaForCodeOwner,
} from '@kbn/code-owners';
import {
  ScoutEventsReport,
  ScoutReportEventAction,
  type ScoutTestRunInfo,
  type ScoutFileInfo,
  type ScoutReportEvent,
} from '../../report';
import { environmentMetadata } from '../../../datasources';
import type { ScoutPlaywrightReporterOptions } from '../scout_playwright_reporter';
import { generateTestRunId, computeTestID } from '../../../helpers';

/**
 * Scout Playwright reporter
 */
export class ScoutPlaywrightReporter implements Reporter {
  readonly log: ToolingLog;
  readonly name: string;
  readonly runId: string;
  private readonly captureSteps: boolean;
  private report: ScoutEventsReport;
  private baseTestRunInfo: ScoutTestRunInfo;
  private readonly codeOwnersEntries: CodeOwnersEntry[];

  private readonly testStats: {
    passes: number;
    failures: number;
    pending: number;
  } = {
    passes: 0,
    failures: 0,
    pending: 0,
  };

  constructor(private reporterOptions: ScoutPlaywrightReporterOptions = {}) {
    this.log = new ToolingLog({
      level: 'info',
      writeTo: process.stdout,
    });

    this.name = this.reporterOptions.name || 'unknown';
    this.runId = this.reporterOptions.runId || generateTestRunId();
    this.captureSteps = this.reporterOptions.captureSteps || false;
    this.log.info(`Scout test run ID: ${this.runId}`);

    this.report = new ScoutEventsReport(this.log);

    const testTarget = ScoutTestTarget.tryFromEnv();

    this.baseTestRunInfo = {
      id: this.runId,
      target: {
        type: testTarget?.location || 'unknown',
        mode: testTarget?.tagWithoutLocation || 'unknown',
      },
    };
    this.codeOwnersEntries = getCodeOwnersEntries();
  }

  private getFileOwners(filePath: string): string[] {
    return getOwningTeamsForPath(filePath, this.codeOwnersEntries);
  }

  private getOwnerAreas(owners: string[]): CodeOwnerArea[] {
    return owners
      .map((owner) => findAreaForCodeOwner(owner))
      .filter((area): area is CodeOwnerArea => area !== undefined);
  }

  private getScoutFileInfoForPath(filePath: string): ScoutFileInfo {
    const fileOwners = this.getFileOwners(filePath);
    const areas = this.getOwnerAreas(fileOwners);

    return {
      path: filePath,
      owner: fileOwners.length > 0 ? fileOwners : 'unknown',
      area: areas.length > 0 ? areas : 'unknown',
    };
  }

  private getScoutConfigInfo(absoluteConfigPath: string): {
    category: ScoutTestRunConfigCategory;
    namespace: string | undefined;
  } {
    const relativePath = path.relative(REPO_ROOT, absoluteConfigPath);
    const groups = SCOUT_UNIFIED_CONFIG_PATH_REGEX.exec(relativePath)?.groups;

    if (!groups) {
      return { category: ScoutTestRunConfigCategory.UNKNOWN, namespace: undefined };
    }

    const category =
      groups.testCategory === 'api'
        ? ScoutTestRunConfigCategory.API_TEST
        : ScoutTestRunConfigCategory.UI_TEST;

    return { category, namespace: groups.namespace };
  }

  private getSuitePropsFromTest(test: TestCase): ScoutReportEvent['suite'] {
    return {
      title: test.parent.titlePath().slice(3).join(' '),
      type: test.parent.type,
    };
  }

  private getTestPropsFromTest(
    test: TestCase,
    step?: TestStep,
    result?: TestResult
  ): ScoutReportEvent['test'] {
    const fullTestTitle = test.titlePath().slice(3).join(' ');
    const testFilePath = path.relative(REPO_ROOT, test.location.file);
    const testProps: ScoutReportEvent['test'] = {
      id: computeTestID(testFilePath, fullTestTitle),
      title: test.title,
      tags: test.tags,
      annotations: test.annotations,
      expected_status: test.expectedStatus,
      file: this.getScoutFileInfoForPath(testFilePath),
    };

    if (step) {
      testProps.step = {
        title: testProps.title,
        category: step.category,
      };
    }

    if (result) {
      testProps.status = result.status;
      testProps.duration = result.duration;
      const consoleErrors = result.attachments
        .find((a) => a.name === BROWSER_CONSOLE_ERRORS_ATTACHMENT)
        ?.body?.toString('utf-8');
      if (consoleErrors) {
        testProps.console_errors = consoleErrors;
      }
    }

    return testProps;
  }

  /**
   * Root path of this reporter's output
   */
  public get reportRootPath(): string {
    const outputPath = this.reporterOptions.outputPath || SCOUT_REPORT_OUTPUT_ROOT;
    return path.join(outputPath, `scout-playwright-${this.runId}`);
  }

  printsToStdio(): boolean {
    // Don't take over console output
    return false;
  }

  onBegin(config: FullConfig, _: Suite) {
    // Enrich base test run info with config file info
    let configInfo: ScoutTestRunInfo['config'];

    if (config.configFile !== undefined) {
      const { category, namespace } = this.getScoutConfigInfo(config.configFile);
      configInfo = {
        file: this.getScoutFileInfoForPath(path.relative(REPO_ROOT, config.configFile)),
        category,
        ...(namespace !== undefined && { namespace }),
      };
    }

    this.baseTestRunInfo = {
      ...this.baseTestRunInfo,
      fully_parallel: config.fullyParallel,
      config: configInfo,
    };

    // Log event
    this.report.logEvent({
      ...environmentMetadata,
      reporter: {
        name: this.name,
        type: 'playwright',
      },
      test_run: this.baseTestRunInfo,
      event: {
        action: ScoutReportEventAction.RUN_BEGIN,
      },
    });
  }

  onTestBegin(test: TestCase, result: TestResult) {
    this.report.logEvent({
      '@timestamp': result.startTime,
      ...environmentMetadata,
      reporter: {
        name: this.name,
        type: 'playwright',
      },
      test_run: this.baseTestRunInfo,
      suite: this.getSuitePropsFromTest(test),
      test: this.getTestPropsFromTest(test),
      event: {
        action: ScoutReportEventAction.TEST_BEGIN,
      },
    });
  }

  onStepBegin(test: TestCase, _: TestResult, step: TestStep) {
    if (!this.captureSteps) return;

    this.report.logEvent({
      '@timestamp': step.startTime,
      ...environmentMetadata,
      reporter: {
        name: this.name,
        type: 'playwright',
      },
      test_run: this.baseTestRunInfo,
      suite: this.getSuitePropsFromTest(test),
      test: this.getTestPropsFromTest(test, step),
      event: {
        action: ScoutReportEventAction.TEST_STEP_BEGIN,
      },
    });
  }

  onStepEnd(test: TestCase, _: TestResult, step: TestStep) {
    if (!this.captureSteps) return;

    this.report.logEvent({
      ...environmentMetadata,
      reporter: {
        name: this.name,
        type: 'playwright',
      },
      test_run: this.baseTestRunInfo,
      suite: this.getSuitePropsFromTest(test),
      test: this.getTestPropsFromTest(test, step),
      event: {
        action: ScoutReportEventAction.TEST_STEP_END,
        error: {
          message: step.error?.message ? stripANSI(step.error.message) : undefined,
          stack_trace: step.error?.stack ? stripANSI(step.error.stack) : undefined,
        },
      },
    });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    switch (result.status) {
      case 'failed':
        this.testStats.failures++;
        break;
      case 'interrupted':
        this.testStats.failures++;
        break;
      case 'timedOut':
        this.testStats.failures++;
        break;

      case 'passed':
        this.testStats.passes++;
        break;

      case 'skipped':
        this.testStats.pending++;
        break;
    }

    this.report.logEvent({
      ...environmentMetadata,
      reporter: {
        name: this.name,
        type: 'playwright',
      },
      test_run: this.baseTestRunInfo,
      suite: this.getSuitePropsFromTest(test),
      test: this.getTestPropsFromTest(test, undefined, result),
      event: {
        action: ScoutReportEventAction.TEST_END,
        error: {
          message: result.error?.message ? stripANSI(result.error.message) : undefined,
          stack_trace: result.error?.stack ? stripANSI(result.error.stack) : undefined,
        },
      },
    });
  }

  async onEnd(result: FullResult) {
    this.report.logEvent({
      ...environmentMetadata,
      reporter: {
        name: this.name,
        type: 'playwright',
      },
      test_run: {
        ...this.baseTestRunInfo,
        status: result.status,
        duration: result.duration,
        tests: {
          failures: this.testStats.failures,
          passes: this.testStats.passes,
          pending: this.testStats.pending,
          total: this.testStats.failures + this.testStats.passes + this.testStats.pending,
        },
      },
      event: {
        action: ScoutReportEventAction.RUN_END,
      },
      process: {
        uptime: Math.floor(process.uptime() * 1000),
      },
    });

    // Save, upload events & conclude the report
    try {
      this.report.save(this.reportRootPath);
    } catch (e) {
      // Log the error but don't propagate it
      this.log.error(e);
    } finally {
      this.report.conclude();
    }
  }

  async onExit() {
    // noop
  }

  onError(error: TestError) {
    this.report.logEvent({
      ...environmentMetadata,
      reporter: {
        name: this.name,
        type: 'playwright',
      },
      test_run: this.baseTestRunInfo,
      event: {
        action: ScoutReportEventAction.ERROR,
        error: {
          message: error.message ? stripANSI(error.message) : undefined,
          stack_trace: error.stack ? stripANSI(error.stack) : undefined,
        },
      },
    });
  }
}
