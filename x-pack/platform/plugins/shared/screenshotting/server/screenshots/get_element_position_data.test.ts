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
import { getElementPositionAndAttributes } from './get_element_position_data';

describe('getElementPositionAndAttributes', () => {
  let browser: ReturnType<typeof createMockBrowserDriver>;
  let layout: ReturnType<typeof createMockLayout>;
  let eventLogger: EventLogger;

  beforeEach(async () => {
    browser = createMockBrowserDriver();
    layout = createMockLayout();
    eventLogger = new EventLogger(loggingSystemMock.createLogger());
    browser.evaluate.mockImplementation(({ fn, args }) => (fn as Function)(...args));

    // @see https://github.com/jsdom/jsdom/issues/653
    const querySelectorAll = document.querySelectorAll.bind(document);
    jest.spyOn(document, 'querySelectorAll').mockImplementation((selector) => {
      const elements = querySelectorAll<HTMLDivElement>(selector);

      elements.forEach((element) =>
        Object.assign(element, {
          scrollIntoView: () => {},
          getBoundingClientRect: () => ({
            width: parseFloat(element.style.width),
            height: parseFloat(element.style.height),
            y: parseFloat(element.style.top),
            x: parseFloat(element.style.left),
          }),
        })
      );

      return elements;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should return elements positions', async () => {
    document.body.innerHTML = `
      <screenshotSelector
        style="display: block; position: absolute; top: 100px; left: 100px; width: 200px; height: 200px;"
        data-title="element1"
        data-description="some description 1"
      />
      <screenshotSelector
        style="position: absolute; top: 150px; left: 150px; width: 250px; height: 250px;"
        data-title="element1"
        data-description="some description 1"
      />
    `;

    await expect(getElementPositionAndAttributes(browser, eventLogger, layout)).resolves
      .toMatchInlineSnapshot(`
            Array [
              Object {
                "attributes": Object {
                  "description": "some description 1",
                  "title": "element1",
                },
                "position": Object {
                  "boundingClientRect": Object {
                    "height": 200,
                    "left": 100,
                    "top": 100,
                    "width": 200,
                  },
                  "scroll": Object {
                    "x": 0,
                    "y": 0,
                  },
                },
              },
              Object {
                "attributes": Object {
                  "description": "some description 1",
                  "title": "element1",
                },
                "position": Object {
                  "boundingClientRect": Object {
                    "height": 250,
                    "left": 150,
                    "top": 150,
                    "width": 250,
                  },
                  "scroll": Object {
                    "x": 0,
                    "y": 0,
                  },
                },
              },
            ]
          `);
  });

  it('should return null when there are no elements matching', async () => {
    await expect(getElementPositionAndAttributes(browser, eventLogger, layout)).resolves.toBeNull();
  });
});
