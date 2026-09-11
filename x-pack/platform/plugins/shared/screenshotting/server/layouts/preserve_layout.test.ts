/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PreserveLayout } from './preserve_layout';

it('preserve layout uses default layout selectors', () => {
  const testPreserveLayout = new PreserveLayout({ width: 16, height: 16 });

  testPreserveLayout.setPdfImageSize({ height: 16, width: 16 });

  expect(testPreserveLayout.getCssOverridesPath()).toMatch(`layouts/preserve_layout.css`);
  expect(testPreserveLayout.getBrowserViewport()).toMatchObject({ height: 32, width: 32 });
  expect(testPreserveLayout.getBrowserZoom()).toBe(2);
  expect(testPreserveLayout.getPdfImageSize()).toMatchObject({ height: 16, width: 16 });
  expect(testPreserveLayout.getPdfPageOrientation()).toBe(undefined);
  expect(
    testPreserveLayout.getPdfPageSize({
      pageMarginTop: 27,
      pageMarginBottom: 27,
      pageMarginWidth: 13,
      tableBorderWidth: 67,
      headingHeight: 82,
      subheadingHeight: 96,
    })
  ).toMatchObject({ height: 382, width: 176 });
  expect(testPreserveLayout.selectors).toMatchInlineSnapshot(`
    Object {
      "itemsCountAttribute": "data-shared-items-count",
      "renderComplete": "[data-shared-item]",
      "renderError": "[data-render-error]",
      "renderErrorAttribute": "data-render-error",
      "screenshot": "[data-shared-items-container]",
      "timefilterDurationAttribute": "data-shared-timefilter-duration",
    }
  `);
  expect(testPreserveLayout.height).toBe(16);
  expect(testPreserveLayout.width).toBe(16);
});

it('preserve layout allows customizable selectors', () => {
  const testPreserveLayout = new PreserveLayout(
    { width: 16, height: 16 },
    { renderComplete: '[great-test-selectors]' }
  );

  expect(testPreserveLayout.selectors).toMatchInlineSnapshot(`
    Object {
      "itemsCountAttribute": "data-shared-items-count",
      "renderComplete": "[great-test-selectors]",
      "renderError": "[data-render-error]",
      "renderErrorAttribute": "data-render-error",
      "screenshot": "[data-shared-items-container]",
      "timefilterDurationAttribute": "data-shared-timefilter-duration",
    }
  `);
});

it('preserve layout use a default zoom of 2', () => {
  const testPreserveLayout = new PreserveLayout({ width: 1000, height: 2000 });
  expect(testPreserveLayout.getBrowserZoom()).toBe(2);
  expect(testPreserveLayout.getBrowserViewport().height).toBe(4000);
});

it('preserve layout caps browser zoom for extremely large screenshots to avoid Chromium artifacts', () => {
  // A very tall layout would exceed Chrome limits at zoom=2.
  const testPreserveLayout = new PreserveLayout({ width: 1727, height: 15000 });

  // The zoom should be reduced so that output height stays <= 16000 pixels.
  expect(testPreserveLayout.getBrowserZoom()).toBe(1);
  expect(testPreserveLayout.getBrowserViewport().height).toBeLessThanOrEqual(16000);
});

it('preserve layout steps zoom down for wide reports to bound the raster surface', () => {
  // Within the height limit, so the previous height-only check kept zoom at 2 and
  // Chromium had to raster 6880x6256. See https://github.com/elastic/kibana/issues/271230.
  const testPreserveLayout = new PreserveLayout({ width: 3440, height: 3128 });

  expect(testPreserveLayout.getBrowserZoom()).toBe(1);
  expect(testPreserveLayout.getBrowserViewport()).toMatchObject({ height: 3128, width: 3440 });
});
