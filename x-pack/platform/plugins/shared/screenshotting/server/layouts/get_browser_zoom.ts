/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Size } from '../../common/layout';

/**
 * We default to a zoom of two to bump up the resolution of the screenshot a bit.
 */
export const DEFAULT_ZOOM = 2;

/**
 * Chromium/Skia cannot allocate a surface taller than 16384px, so a zoom of two is
 * only safe up to half of that.
 * https://github.com/puppeteer/puppeteer/issues/359
 */
export const MAX_HEIGHT_PX = 8000;

/**
 * Budget for the post-zoom raster surface that Chromium has to allocate.
 *
 * Peak Chromium memory scales linearly with this area, measured at roughly
 * `345MB + 21.6MB per megapixel`. Previously only the height was bounded, so a
 * report requested from a 3440px-wide browser window allocated ~43Mpx and peaked
 * around 1.3GB — fatal on a 2GB Kibana instance. Bounding the area covers both
 * axes at once: a wide-but-short report is just as expensive as a tall one.
 *
 * 24Mpx keeps the default zoom for the built-in sample-data dashboards (Logs,
 * eCommerce, Flights) on a normal single monitor, and steps larger reports down
 * to a zoom of one rather than failing. It caps the peak at roughly 850MB.
 * See https://github.com/elastic/kibana/issues/271230.
 */
export const MAX_SCALED_AREA_PX = 24_000_000;

/**
 * Returns the highest zoom factor that keeps the raster surface Chromium must
 * allocate for the given layout within both the Skia height limit and the
 * pixel-area budget.
 */
export const getBrowserZoom = ({ width, height }: Size): number => {
  const withinHeightLimit = height <= MAX_HEIGHT_PX;
  const withinAreaBudget = width * DEFAULT_ZOOM * (height * DEFAULT_ZOOM) <= MAX_SCALED_AREA_PX;

  return withinHeightLimit && withinAreaBudget ? DEFAULT_ZOOM : 1;
};
