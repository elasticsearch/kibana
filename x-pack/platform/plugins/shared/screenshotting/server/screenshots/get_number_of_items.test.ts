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
import { getNumberOfItems } from './get_number_of_items';

describe('getNumberOfItems', () => {
  const timeout = 10;
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

  it('should determine the number of items by attribute', async () => {
    document.body.innerHTML = `
      <div itemsSelector="10" />
    `;

    await expect(getNumberOfItems(browser, eventLogger, timeout, layout)).resolves.toBe(10);
  });

  it('should determine the number of items by selector ', async () => {
    document.body.innerHTML = `
      <renderedSelector />
      <renderedSelector />
      <renderedSelector />
    `;

    await expect(getNumberOfItems(browser, eventLogger, timeout, layout)).resolves.toBe(3);
  });

  it('should fall back to the selector when the attribute is empty', async () => {
    document.body.innerHTML = `
      <div itemsSelector />
      <renderedSelector />
      <renderedSelector />
    `;

    await expect(getNumberOfItems(browser, eventLogger, timeout, layout)).resolves.toBe(2);
  });
});
