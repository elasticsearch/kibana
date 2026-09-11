/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DEFAULT_ZOOM,
  MAX_HEIGHT_PX,
  MAX_SCALED_AREA_PX,
  getBrowserZoom,
} from './get_browser_zoom';

describe('getBrowserZoom', () => {
  const scaledArea = (width: number, height: number, zoom: number) =>
    width * zoom * (height * zoom);

  it('uses the default zoom for a typical dashboard', () => {
    expect(getBrowserZoom({ width: 1200, height: 900 })).toBe(DEFAULT_ZOOM);
  });

  it('steps down to a zoom of one when the report is taller than Skia can raster', () => {
    expect(getBrowserZoom({ width: 1727, height: MAX_HEIGHT_PX + 1 })).toBe(1);
  });

  it('steps down to a zoom of one when the scaled area exceeds the budget', () => {
    // A wide-but-short report: within the height limit, but over the area budget.
    const size = { width: 3440, height: 3128 };

    expect(size.height).toBeLessThanOrEqual(MAX_HEIGHT_PX);
    expect(scaledArea(size.width, size.height, DEFAULT_ZOOM)).toBeGreaterThan(MAX_SCALED_AREA_PX);
    expect(getBrowserZoom(size)).toBe(1);
  });

  it('keeps the resulting raster surface within the budget after stepping down', () => {
    const size = { width: 3440, height: 3128 };
    const zoom = getBrowserZoom(size);

    expect(scaledArea(size.width, size.height, zoom)).toBeLessThanOrEqual(MAX_SCALED_AREA_PX);
  });

  it('bounds width as well as height', () => {
    // Previously only height was considered, so an unbounded width kept the default
    // zoom. See https://github.com/elastic/kibana/issues/271230.
    expect(getBrowserZoom({ width: 14400, height: 1000 })).toBe(1);
  });

  it('does not step down for a report exactly at the area budget', () => {
    // Derived from the budget so this stays exact if the budget is retuned.
    const height = 2000;
    const size = {
      width: MAX_SCALED_AREA_PX / (DEFAULT_ZOOM * DEFAULT_ZOOM * height),
      height,
    };

    expect(scaledArea(size.width, size.height, DEFAULT_ZOOM)).toBe(MAX_SCALED_AREA_PX);
    expect(getBrowserZoom(size)).toBe(DEFAULT_ZOOM);
  });

  it('steps down one pixel over the area budget', () => {
    const height = 2000;
    const width = MAX_SCALED_AREA_PX / (DEFAULT_ZOOM * DEFAULT_ZOOM * height) + 1;

    expect(getBrowserZoom({ width, height })).toBe(1);
  });
});
