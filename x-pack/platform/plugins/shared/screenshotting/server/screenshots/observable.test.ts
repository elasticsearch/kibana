/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { ConfigType } from '@kbn/screenshotting-server';
import { interval, lastValueFrom, map, of, throwError } from 'rxjs';
import { createMockBrowserDriver } from '../browsers/mock';
import { createMockLayout } from '../layouts/mock';
import { EventLogger } from './event_logger';
import type { ScreenshotObservableOptions } from './observable';
import { ScreenshotObservableHandler } from './observable';

describe('ScreenshotObservableHandler', () => {
  let browser: ReturnType<typeof createMockBrowserDriver>;
  let config: ConfigType;
  let layout: ReturnType<typeof createMockLayout>;
  let eventLogger: EventLogger;
  let options: ScreenshotObservableOptions;

  beforeEach(async () => {
    browser = createMockBrowserDriver();
    config = {
      capture: {
        timeouts: { openUrl: 30000, waitForElements: 30000, renderComplete: 30000 },
        zoom: 13,
      },
    } as ConfigType;
    layout = createMockLayout();
    eventLogger = new EventLogger(loggingSystemMock.createLogger());
    options = {
      headers: { testHeader: 'testHeadValue' },
      urls: [],
    };

    browser.isPageOpen.mockReturnValue(true);
  });

  describe('waitUntil', () => {
    let screenshots: ScreenshotObservableHandler;
    beforeEach(() => {
      screenshots = new ScreenshotObservableHandler(browser, config, eventLogger, layout, options);
    });

    it('catches TimeoutError and references the timeout config in a custom message', async () => {
      const test$ = interval(1000).pipe(
        screenshots.waitUntil({
          timeoutValue: 200,
          label: 'Test Config',
          configValue: 'xpack.screenshotting.testConfig',
        })
      );

      const testPipeline = () => lastValueFrom(test$);
      await expect(testPipeline).rejects.toMatchInlineSnapshot(
        `[Error: Screenshotting encountered a timeout error: "Test Config" took longer than 0.2 seconds. You may need to increase "xpack.screenshotting.testConfig" in kibana.yml.]`
      );
    });

    it('catches other Errors', async () => {
      const test$ = throwError(() => new Error(`Test Error to Throw`)).pipe(
        screenshots.waitUntil({
          timeoutValue: 200,
          label: 'Test Config',
          configValue: 'xpack.screenshotting.testConfig',
        })
      );

      const testPipeline = () => lastValueFrom(test$);
      await expect(testPipeline).rejects.toMatchInlineSnapshot(
        `[Error: The "Test Config" phase encountered an error: Error: Test Error to Throw]`
      );
    });

    it('is a pass-through if there is no Error', async () => {
      const test$ = of('nice to see you').pipe(
        screenshots.waitUntil({
          timeoutValue: 20,
          label: 'xxxxxxxxxxx',
          configValue: 'xpack.screenshotting.testConfig',
        })
      );

      await expect(lastValueFrom(test$)).resolves.toBe(`nice to see you`);
    });
  });

  describe('checkPageIsOpen', () => {
    let screenshots: ScreenshotObservableHandler;
    beforeEach(() => {
      screenshots = new ScreenshotObservableHandler(browser, config, eventLogger, layout, options);
    });

    it('throws a decorated Error when page is not open', async () => {
      browser.isPageOpen.mockReturnValue(false);
      const test$ = of(234455).pipe(
        map((input) => {
          screenshots.checkPageIsOpen();
          return input;
        })
      );

      await expect(lastValueFrom(test$)).rejects.toMatchInlineSnapshot(
        `[Error: Browser was closed unexpectedly! Check the server logs for more info.]`
      );
    });

    it('is a pass-through when the page is open', async () => {
      const test$ = of(234455).pipe(
        map((input) => {
          screenshots.checkPageIsOpen();
          return input;
        })
      );

      await expect(lastValueFrom(test$)).resolves.toBe(234455);
    });
  });
});
