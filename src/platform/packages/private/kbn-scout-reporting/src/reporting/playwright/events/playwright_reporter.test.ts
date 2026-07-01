/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FullConfig, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { BROWSER_CONSOLE_ERRORS_ATTACHMENT } from '@kbn/scout-info';
import { ScoutReportEventAction } from '../../report';
import { ScoutPlaywrightReporter } from './playwright_reporter';

jest.mock('@kbn/code-owners', () => ({
  getCodeOwnersEntries: jest.fn(() => []),
  getOwningTeamsForPath: jest.fn(() => []),
  findAreaForCodeOwner: jest.fn(() => undefined),
}));

const createMockConfig = (): FullConfig =>
  ({ configFile: undefined, fullyParallel: false } as unknown as FullConfig);

const createMockSuite = (): Suite => ({} as Suite);

const createMockTest = (): TestCase =>
  ({
    titlePath: () => ['', 'local', 'path/to/file.spec.ts', 'My Suite', 'should work'],
    title: 'should work',
    tags: [],
    annotations: [],
    expectedStatus: 'passed',
    location: { file: '/repo-root/path/to/file.spec.ts', line: 42, column: 0 },
    parent: {
      title: 'My Suite',
      type: 'describe',
      titlePath: () => ['', 'local', 'path/to/file.spec.ts', 'My Suite'],
    },
  } as unknown as TestCase);

const createMockResult = (
  overrides: { attachments?: TestResult['attachments'] } = {}
): TestResult =>
  ({
    status: 'failed',
    startTime: new Date(),
    duration: 1000,
    attachments: overrides.attachments ?? [],
    error: undefined,
    stdout: [],
    stderr: [],
  } as unknown as TestResult);

describe('ScoutPlaywrightReporter', () => {
  let reporter: ScoutPlaywrightReporter;
  let logEventSpy: jest.SpyInstance;

  beforeEach(() => {
    reporter = new ScoutPlaywrightReporter({ runId: 'test-run-id' });
    logEventSpy = jest.spyOn((reporter as any).report, 'logEvent').mockImplementation(() => {});
    reporter.onBegin(createMockConfig(), createMockSuite());
  });

  const getTestEndEvent = () =>
    logEventSpy.mock.calls
      .map(([event]) => event)
      .find((event) => event.event?.action === ScoutReportEventAction.TEST_END);

  describe('getScoutConfigInfo', () => {
    const getInfo = (configPath: string) => (reporter as any).getScoutConfigInfo(configPath);

    it('returns ui-test category for root-level ui config', () => {
      expect(getInfo('src/platform/plugins/shared/foo/test/scout/ui/playwright.config.ts')).toEqual(
        { category: 'ui-test', namespace: undefined }
      );
    });

    it('returns api-test category for root-level api config', () => {
      expect(
        getInfo('src/platform/plugins/shared/foo/test/scout/api/playwright.config.ts')
      ).toEqual({ category: 'api-test', namespace: undefined });
    });

    it('returns ui-test category for scout_* root ui config', () => {
      expect(
        getInfo('src/platform/plugins/shared/foo/test/scout_custom/ui/playwright.config.ts')
      ).toEqual({ category: 'ui-test', namespace: undefined });
    });

    it('returns ui-test category and namespace for namespace-based ui config', () => {
      expect(
        getInfo(
          'x-pack/solutions/security/plugins/security_solution/test/scout/entity_analytics/ui/parallel.playwright.config.ts'
        )
      ).toEqual({ category: 'ui-test', namespace: 'entity_analytics' });
    });

    it('returns api-test category and namespace for namespace-based api config', () => {
      expect(
        getInfo(
          'x-pack/solutions/security/plugins/security_solution/test/scout/entity_analytics/api/playwright.config.ts'
        )
      ).toEqual({ category: 'api-test', namespace: 'entity_analytics' });
    });

    it('returns UNKNOWN category and no namespace for unrecognised path', () => {
      expect(getInfo('some/other/path/config.ts')).toEqual({
        category: 'unknown',
        namespace: undefined,
      });
    });
  });

  describe('onTestEnd', () => {
    it('sets console_errors on the test-end event when the attachment is present', () => {
      const consoleErrorText = 'Error: React state update on unmounted component';

      reporter.onTestEnd(
        createMockTest(),
        createMockResult({
          attachments: [
            {
              name: BROWSER_CONSOLE_ERRORS_ATTACHMENT,
              body: Buffer.from(consoleErrorText),
              contentType: 'text/plain',
            },
          ],
        })
      );

      expect(getTestEndEvent()?.test?.console_errors).toBe(consoleErrorText);
    });

    it('omits console_errors from the test-end event when no attachment is present', () => {
      reporter.onTestEnd(createMockTest(), createMockResult());

      expect(getTestEndEvent()?.test?.console_errors).toBeUndefined();
    });
  });
});
