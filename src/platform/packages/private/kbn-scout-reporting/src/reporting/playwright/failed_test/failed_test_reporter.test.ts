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
  Suite,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';
import { ToolingLog } from '@kbn/tooling-log';
import { getKibanaModuleData } from '../../../helpers';
import { ScoutFailedTestReporter } from './failed_test_reporter';
import { ScoutFailureTracker } from './failure_tracking';

jest.mock('@kbn/code-owners', () => ({
  getCodeOwnersEntries: jest.fn(() => []),
  getOwningTeamsForPath: jest.fn(() => []),
}));

jest.mock('../../../helpers', () => {
  const actual = jest.requireActual('../../../helpers');
  return {
    ...actual,
    getKibanaModuleData: jest.fn(),
  };
});

const mockedGetKibanaModuleData = getKibanaModuleData as jest.MockedFunction<
  typeof getKibanaModuleData
>;

const createMockConfig = (configFile?: string): FullConfig =>
  ({ configFile } as unknown as FullConfig);

const createMockSuite = (tests: TestCase[]): Suite =>
  ({ allTests: () => tests } as unknown as Suite);

const createMockTestCase = (overrides: {
  outcome: ReturnType<TestCase['outcome']>;
  title?: string;
  filePath?: string;
  expectedStatus?: TestCase['expectedStatus'];
  results?: Array<Pick<TestResult, 'status'>>;
}): TestCase => {
  const {
    outcome,
    title = 'should work',
    filePath = 'path/to/file.spec.ts',
    expectedStatus = 'passed',
    results = [{ status: 'failed' }],
  } = overrides;

  return {
    titlePath: () => ['', 'local', filePath, 'My Suite', title],
    title,
    location: { file: `/repo-root/${filePath}`, line: 1, column: 1 },
    parent: {
      title: 'My Suite',
      type: 'describe',
      titlePath: () => ['', 'local', filePath, 'My Suite'],
    },
    outcome: () => outcome,
    expectedStatus,
    results,
  } as unknown as TestCase;
};

const createMockResult = (
  overrides: { status?: TestResult['status']; retry?: number } = {}
): TestResult =>
  ({
    status: overrides.status ?? 'failed',
    retry: overrides.retry ?? 0,
    duration: 500,
    attachments: [],
    error: { message: 'boom', stack: 'stack trace' },
    stdout: [],
  } as unknown as TestResult);

const createMockFullResult = (status: FullResult['status'] = 'failed'): FullResult =>
  ({ status, duration: 1000 } as FullResult);

describe('ScoutFailedTestReporter', () => {
  let reporter: ScoutFailedTestReporter;
  let reportLogEventSpy: jest.SpyInstance;
  let trackerSaveSpy: jest.SpyInstance;
  let trackerAddFailureSpy: jest.SpyInstance;

  beforeEach(() => {
    reporter = new ScoutFailedTestReporter({ runId: 'test-run-id' });
    reportLogEventSpy = jest
      .spyOn((reporter as any).report, 'logEvent')
      .mockImplementation(() => {});
    jest.spyOn((reporter as any).report, 'save').mockImplementation(() => {});
    jest.spyOn((reporter as any).report, 'conclude').mockImplementation(() => {});
    trackerSaveSpy = jest.spyOn(ScoutFailureTracker.prototype, 'save').mockImplementation(() => {});
    trackerAddFailureSpy = jest.spyOn(ScoutFailureTracker.prototype, 'addFailure');
    mockedGetKibanaModuleData.mockReset();
  });

  afterEach(() => {
    // Spies on ScoutFailureTracker.prototype are shared across tests and must be restored.
    jest.restoreAllMocks();
  });

  it('logs a flaky test to the report artifact but excludes it from the tracker', () => {
    const flakyTest = createMockTestCase({ outcome: 'flaky', title: 'flaky test' });
    const hardFailure = createMockTestCase({ outcome: 'unexpected', title: 'hard failure' });

    reporter.onBegin(createMockConfig(), createMockSuite([flakyTest, hardFailure]));

    // Flaky test: fails once, then passes. onTestEnd only ever forwards a failing attempt.
    reporter.onTestEnd(flakyTest, createMockResult({ status: 'failed', retry: 0 }));
    reporter.onTestEnd(flakyTest, createMockResult({ status: 'passed', retry: 1 }));

    // Hard failure: fails on both attempts.
    reporter.onTestEnd(hardFailure, createMockResult({ status: 'failed', retry: 0 }));
    reporter.onTestEnd(hardFailure, createMockResult({ status: 'failed', retry: 1 }));

    reporter.onEnd(createMockFullResult());

    // Every failing attempt of both tests lands in the report artifact — including the
    // flaky test's failing first attempt, which is still useful debugging material.
    const loggedTitles = reportLogEventSpy.mock.calls.map(([failure]) => failure.title);
    expect(loggedTitles).toEqual(['flaky test', 'hard failure', 'hard failure']);

    // Only the flaky test is excluded from the GitHub-issue tracker.
    expect(trackerSaveSpy).toHaveBeenCalledTimes(1);
    const { excludeTestIds } = trackerSaveSpy.mock.calls[0][0];
    const flakyId = reportLogEventSpy.mock.calls[0][0].id;
    const hardFailureId = reportLogEventSpy.mock.calls[1][0].id;

    expect(excludeTestIds.has(flakyId)).toBe(true);
    expect(excludeTestIds.has(hardFailureId)).toBe(false);
  });

  it('records global errors and a run timeout as runner errors, not test failures', () => {
    const saveRunnerErrorsSpy = jest
      .spyOn(ScoutFailureTracker.prototype, 'saveRunnerErrors')
      .mockImplementation(() => {});
    reporter.onBegin(createMockConfig(), createMockSuite([]));

    reporter.onError({ message: 'global teardown threw' } as TestError);
    reporter.onError({ value: 'string thrown' } as TestError);
    reporter.onEnd(createMockFullResult('timedout'));

    expect(reportLogEventSpy).not.toHaveBeenCalled();
    expect(trackerAddFailureSpy).not.toHaveBeenCalled();
    expect(saveRunnerErrorsSpy).toHaveBeenCalledWith({
      status: 'timedout',
      errors: ['global teardown threw', 'string thrown', 'Playwright run timedout'],
    });
  });

  it('records the --max-failures cutoff notice and the tests it cut off as runner errors', () => {
    const saveRunnerErrorsSpy = jest
      .spyOn(ScoutFailureTracker.prototype, 'saveRunnerErrors')
      .mockImplementation(() => {});
    const failed = createMockTestCase({ outcome: 'unexpected', title: 'failed' });
    const neverStarted = createMockTestCase({ outcome: 'skipped', title: 'never', results: [] });
    const skippedAtRuntime = createMockTestCase({
      outcome: 'skipped',
      title: 'runtime skip',
      results: [{ status: 'skipped' }],
    });
    const declaredSkip = createMockTestCase({
      outcome: 'skipped',
      title: 'test.skip',
      expectedStatus: 'skipped',
      results: [{ status: 'skipped' }],
    });
    const interruptedTest = createMockTestCase({
      outcome: 'skipped',
      title: 'interrupted',
      results: [{ status: 'interrupted' }],
    });
    reporter.onBegin(
      createMockConfig(),
      createMockSuite([failed, neverStarted, skippedAtRuntime, declaredSkip, interruptedTest])
    );
    reporter.onTestEnd(failed, createMockResult({ status: 'failed' }));
    // Playwright emits this (colored) global error when the --max-failures threshold is hit.
    reporter.onError({
      message: '\u001b[31mTesting stopped early after 1 maximum allowed failures.\u001b[39m',
    } as TestError);
    reporter.onEnd(createMockFullResult('failed'));

    expect(saveRunnerErrorsSpy).toHaveBeenCalledWith({
      status: 'failed',
      errors: ['Testing stopped early after 1 maximum allowed failures.', '2 test(s) did not run'],
    });
  });

  it('does not record a runner error for a completed run with only declared skips', () => {
    const saveRunnerErrorsSpy = jest
      .spyOn(ScoutFailureTracker.prototype, 'saveRunnerErrors')
      .mockImplementation(() => {});
    const failed = createMockTestCase({ outcome: 'unexpected', title: 'failed' });
    const declaredSkip = createMockTestCase({
      outcome: 'skipped',
      title: 'test.skip',
      expectedStatus: 'skipped',
      results: [{ status: 'skipped' }],
    });
    reporter.onBegin(createMockConfig(), createMockSuite([failed, declaredSkip]));

    reporter.onTestEnd(failed, createMockResult({ status: 'failed' }));
    reporter.onEnd(createMockFullResult('failed'));

    expect(saveRunnerErrorsSpy).toHaveBeenCalledWith({ status: 'failed', errors: [] });
  });

  it('stamps distinct attempt numbers on each attempt of a repeatedly-failing test', () => {
    const hardFailure = createMockTestCase({ outcome: 'unexpected', title: 'hard failure' });
    reporter.onBegin(createMockConfig(), createMockSuite([hardFailure]));

    reporter.onTestEnd(hardFailure, createMockResult({ status: 'failed', retry: 0 }));
    reporter.onTestEnd(hardFailure, createMockResult({ status: 'failed', retry: 1 }));

    const attempts = reportLogEventSpy.mock.calls.map(([failure]) => failure.attempt);
    expect(attempts).toEqual([0, 1]);
  });

  it('tracks a repeatedly-failing test once, not once per attempt (avoids double-updating its GitHub issue)', () => {
    const hardFailure = createMockTestCase({ outcome: 'unexpected', title: 'hard failure' });
    reporter.onBegin(createMockConfig(), createMockSuite([hardFailure]));

    reporter.onTestEnd(hardFailure, createMockResult({ status: 'failed', retry: 0 }));
    reporter.onTestEnd(hardFailure, createMockResult({ status: 'failed', retry: 1 }));

    // The artifact keeps both attempts (asserted above); the tracker must not, or the test's
    // GitHub issue would get bumped twice for one CI run.
    expect(trackerAddFailureSpy).toHaveBeenCalledTimes(2);
    expect((reporter as any).failureTracker.failures.size).toBe(1);
  });

  it('ignores a passed attempt entirely: no artifact entry, no tracker entry', () => {
    const flakyTest = createMockTestCase({ outcome: 'flaky', title: 'flaky test' });
    reporter.onBegin(createMockConfig(), createMockSuite([flakyTest]));

    reporter.onTestEnd(flakyTest, createMockResult({ status: 'passed', retry: 1 }));

    expect(reportLogEventSpy).not.toHaveBeenCalled();
    expect(trackerAddFailureSpy).not.toHaveBeenCalled();
  });

  it('excludes nothing when no test in the suite ended up flaky', () => {
    const hardFailure = createMockTestCase({ outcome: 'unexpected', title: 'hard failure' });
    reporter.onBegin(createMockConfig(), createMockSuite([hardFailure]));

    expect(() => reporter.onEnd(createMockFullResult())).not.toThrow();
    expect(trackerSaveSpy).toHaveBeenCalledWith({ excludeTestIds: new Set() });
  });

  it('leaves kibanaModule unset and keeps reporting when kibana.jsonc cannot be resolved', () => {
    const configFile =
      '/repo/src/core/packages/user-storage/test/scout_user_storage/api/playwright.config.ts';
    mockedGetKibanaModuleData.mockImplementation(() => {
      throw new Error('Manifest file not found: /repo/src/core/packages/user-storage/kibana.jsonc');
    });
    const warningSpy = jest.spyOn(ToolingLog.prototype, 'warning').mockImplementation(() => {});
    const hardFailure = createMockTestCase({ outcome: 'unexpected', title: 'hard failure' });

    expect(() =>
      reporter.onBegin(createMockConfig(configFile), createMockSuite([hardFailure]))
    ).not.toThrow();

    expect(warningSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Unable to resolve kibana.jsonc for Scout config ${configFile}`)
    );
    expect(warningSpy).toHaveBeenCalledWith(expect.stringContaining('Manifest file not found'));

    reporter.onTestEnd(hardFailure, createMockResult({ status: 'failed', retry: 0 }));
    reporter.onEnd(createMockFullResult());

    expect(reportLogEventSpy.mock.calls[0][0].kibanaModule).toBeUndefined();
    expect(trackerSaveSpy).toHaveBeenCalledTimes(1);
  });

  it('stamps kibanaModule onto failures when the manifest is resolved', () => {
    mockedGetKibanaModuleData.mockReturnValue({
      id: '@kbn/my-plugin',
      type: 'plugin',
      visibility: 'shared',
      group: 'platform',
      owner: ['@elastic/kibana-qa'],
    });
    const hardFailure = createMockTestCase({ outcome: 'unexpected', title: 'hard failure' });

    reporter.onBegin(
      createMockConfig('/repo/plugins/my_plugin/test/scout/ui/playwright.config.ts'),
      createMockSuite([hardFailure])
    );
    reporter.onTestEnd(hardFailure, createMockResult({ status: 'failed', retry: 0 }));

    expect(reportLogEventSpy.mock.calls[0][0].kibanaModule).toEqual({
      id: '@kbn/my-plugin',
      type: 'plugin',
      visibility: 'shared',
      group: 'platform',
    });
  });
});
