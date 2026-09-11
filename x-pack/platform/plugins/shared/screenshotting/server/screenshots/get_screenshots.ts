/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { HeadlessChromiumDriver } from '../browsers';
import type { Layout } from '../layouts';
import type { EventLogger } from './event_logger';
import { Actions } from './event_logger';
import type { ElementsPositionAndAttribute } from './get_element_position_data';
import type { Screenshot } from './types';

/**
 * Resize the viewport to contain the element to capture.
 *
 * @async
 * @param {HeadlessChromiumDriver} browser - used for its methods to control the page
 * @param {ElementsPositionAndAttribute['position']} position - position data for the element to capture
 * @param {Layout} layout - used for client-side layout data from the job params
 * @param {Logger} logger
 */
const resizeViewport = async (
  browser: HeadlessChromiumDriver,
  position: ElementsPositionAndAttribute['position'],
  layout: Layout,
  logger: Logger
) => {
  const { boundingClientRect, scroll } = position;

  // Using width from the layout is preferred, it avoids the elements moving around horizontally,
  // which would invalidate the position data that was passed in.
  const width = layout.width || boundingClientRect.left + scroll.x + boundingClientRect.width;

  await browser.setViewport(
    {
      width,
      height: boundingClientRect.top + scroll.y + boundingClientRect.height,
      zoom: layout.getBrowserZoom(),
    },
    logger
  );
};

/**
 * Get screenshots of multiple areas of the page
 */
export const getScreenshots = async (
  browser: HeadlessChromiumDriver,
  eventLogger: EventLogger,
  options: {
    elements: ElementsPositionAndAttribute[];
    layout: Layout;
    error?: Error;
  }
): Promise<Screenshot[]> => {
  const { kbnLogger } = eventLogger;
  const { elements, layout } = options;
  kbnLogger.info(`taking screenshots`);

  const screenshots: Screenshot[] = [];

  try {
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const { position, attributes } = element;

      await resizeViewport(browser, position, layout, eventLogger.kbnLogger);

      const endScreenshot = eventLogger.logScreenshottingEvent(
        'screenshot capture',
        Actions.GET_SCREENSHOT,
        'read',
        eventLogger.getPixelsFromElementPosition(position, layout.getBrowserZoom())
      );

      const data = await browser.screenshot({
        elementPosition: position,
        layout: options.layout,
        error: options.error,
      });

      if (!data?.byteLength) {
        throw new Error(`Failure in getScreenshots! Screenshot data is void`);
      }

      screenshots.push({
        data,
        title: attributes.title,
        description: attributes.description,
      });

      endScreenshot({ byte_length: data.byteLength });
    }
  } catch (error) {
    kbnLogger.error(error);
    eventLogger.error(error, Actions.GET_SCREENSHOT);
    throw error;
  }

  kbnLogger.info(`screenshots taken: ${screenshots.length}`);

  return screenshots;
};
