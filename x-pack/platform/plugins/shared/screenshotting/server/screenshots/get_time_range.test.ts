/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { createMockBrowserDriver } from '../browsers/mock';
import { createMockLayout } from '../layouts/mock';
import { EventLogger } from './event_logger';
import { getTimeRange } from './get_time_range';

describe('getTimeRange', () => {
  let browser: ReturnType<typeof createMockBrowserDriver>;
  let layout: ReturnType<typeof createMockLayout>;
  let eventLogger: EventLogger;

  beforeEach(async () => {
    browser = createMockBrowserDriver();
    layout = createMockLayout();
    eventLogger = new EventLogger(loggingSystemMock.createLogger());
    browser.evaluate.mockImplementation(({ fn, args }) => (fn as Function)(...args));
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should return null when there is no duration element', async () => {
    await expect(getTimeRange(browser, eventLogger, layout)).resolves.toBeNull();
  });

  it('should return null when duration attrbute is empty', async () => {
    document.body.innerHTML = `
      <div timefilterDurationSelector />
    `;

    await expect(getTimeRange(browser, eventLogger, layout)).resolves.toBeNull();
  });

  it('should return duration', async () => {
    document.body.innerHTML = `
      <div timefilterDurationSelector="10" />
    `;

    await expect(getTimeRange(browser, eventLogger, layout)).resolves.toBe('10');
  });
});
