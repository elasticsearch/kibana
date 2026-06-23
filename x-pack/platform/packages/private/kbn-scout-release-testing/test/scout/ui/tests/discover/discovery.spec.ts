/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { test, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import fs from 'fs';
import os from 'os';
import Papa from 'papaparse';
import { cleanupDownloadedFile } from '../../helpers';

const defaultSettings = {
  defaultIndex: 'kibana_sample_data_logs',
  'dateFormat:tz': 'UTC',
};

// Sample data for `kibana_sample_data_logs` is generated relative to the install
// time and spans roughly three weeks in the past and one week in the future, so
// a wide default time range guarantees the histogram and aggregations have data
// to render against.
const TIME_DEFAULTS = '{ "from": "now-3w", "to": "now+1w"}';
const TIME_RANGE = JSON.parse(TIME_DEFAULTS) as { from: string; to: string };
const normalizeDateMath = (value: string) => value.replace(/\/d$/, '');
const EMPTY_TIME_RANGE_START = 'Jun 11, 1999 @ 09:22:11.000';
const EMPTY_TIME_RANGE_END = 'Jun 12, 1999 @ 11:21:04.000';
const queryName1 = 'Query # 1';
const queryName2 = 'Query # 2';
const queryName3 = 'CSV Export Test';
let downloadedFilePath: string | null = null;

test.describe('Discover app', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ kbnClient }) => {
    await kbnClient.uiSettings.update(defaultSettings);
  });

  test.beforeEach(async ({ browserAuth, pageObjects, uiSettings }) => {
    await browserAuth.loginAsAdmin();
    await uiSettings.set({
      'timepicker:timeDefaults': TIME_DEFAULTS,
    });
    await pageObjects.discover.goto();
  });

  test.afterEach(async () => {
    downloadedFilePath = cleanupDownloadedFile(downloadedFilePath);
  });

  test.afterAll(async ({ kbnClient }) => {
    await kbnClient.savedObjects.clean({ types: ['search'] });
  });

  test('should display selected time range in date picker and matching docs in table', async ({
    pageObjects,
  }) => {
    const time = await pageObjects.datePicker.getTimeConfig();
    expect(normalizeDateMath(time.start)).toBe(TIME_RANGE.from);
    expect(normalizeDateMath(time.end)).toBe(TIME_RANGE.to);

    const rowData = await pageObjects.discover.getDocTableIndex(1);
    expect(rowData.length).toBeGreaterThan(0);
  });

  test('save query should show toast message and display query name', async ({ pageObjects }) => {
    await pageObjects.discover.saveSearch(queryName1);
    const actualQueryNameString = await pageObjects.discover.getCurrentQueryName();
    expect(actualQueryNameString).toBe(queryName1);
  });

  test('should refetch when autofresh is enabled', async ({ page, pageObjects }) => {
    const interval = 3;
    await pageObjects.datePicker.startAutoRefresh(interval);

    // The auto-refresh button renders the live mm:ss countdown as its only
    // text content (the icon is an inline SVG), so we can prove auto-refresh
    // fired by observing the countdown tick down and then reset back to the
    // configured interval.
    const autoRefreshButton = page.testSubj.locator('dateRangePickerAutoRefreshButton');
    const getCountdownSeconds = async (): Promise<number> => {
      const [minutes, seconds] = (await autoRefreshButton.innerText())
        .trim()
        .split(':')
        .map(Number);
      return minutes * 60 + seconds;
    };

    await expect.poll(getCountdownSeconds, { timeout: 5_000 }).toBeLessThan(interval);
    await expect.poll(getCountdownSeconds, { timeout: 5_000 }).toBe(interval);
  });

  test('load query should show query name', async ({ pageObjects }) => {
    await pageObjects.discover.saveSearch(queryName2);
    await pageObjects.discover.loadSavedSearch(queryName2);
    await expect
      .poll(async () => await pageObjects.discover.getCurrentQueryName())
      .toBe(queryName2);
  });

  test('should show the correct hit count', async ({ pageObjects }) => {
    expect(await pageObjects.discover.getHitCountInt()).toBeGreaterThan(0);
  });

  test('should show correct time range string in chart', async ({ pageObjects }) => {
    const actualTimeString = await pageObjects.discover.getChartTimespan();
    expect(actualTimeString).toContain('(interval: Auto');
  });

  test('should modify the time range when a bar is clicked', async ({ pageObjects }) => {
    const timeBefore = await pageObjects.datePicker.getTimeConfig();
    await pageObjects.discover.clickHistogramBar();
    await pageObjects.discover.waitUntilSearchingHasFinished();

    const timeAfter = await pageObjects.datePicker.getTimeConfig();
    expect(timeAfter.start).not.toBe(timeBefore.start);
    expect(timeAfter.end).not.toBe(timeBefore.end);

    await expect
      .poll(async () => await pageObjects.discover.getHitCountInt(), { timeout: 3000 })
      .toBeGreaterThan(0);
  });

  test('should show correct initial chart interval of Auto', async ({ page, pageObjects }) => {
    await page.testSubj.click('discoverQueryHits'); // cancel out tooltips
    const actualInterval = await pageObjects.discover.getChartInterval();
    const expectedInterval = 'auto';
    expect(actualInterval).toBe(expectedInterval);
  });

  test('should show "no results"', async ({ page, pageObjects }) => {
    await pageObjects.datePicker.setAbsoluteRange({
      from: EMPTY_TIME_RANGE_START,
      to: EMPTY_TIME_RANGE_END,
    });
    await expect(page.testSubj.locator('discoverNoResults')).toBeVisible();
  });

  test('should suggest a new time range is picked', async ({ page, pageObjects, uiSettings }) => {
    await uiSettings.setDefaultTime({
      from: EMPTY_TIME_RANGE_START,
      to: EMPTY_TIME_RANGE_END,
    });
    await pageObjects.discover.goto();
    await expect(page.testSubj.locator('discoverNoResultsTimefilter')).toBeVisible();
  });

  test('should show matches when time range is expanded', async ({
    page,
    pageObjects,
    uiSettings,
  }) => {
    await uiSettings.setDefaultTime({
      from: EMPTY_TIME_RANGE_START,
      to: EMPTY_TIME_RANGE_END,
    });
    await pageObjects.discover.goto();
    await pageObjects.discover.expandTimeRangeAsSuggestedInNoResultsMessage();

    await expect(page.testSubj.locator('discoverNoResultsTimefilter')).toBeHidden();
    await expect.poll(async () => await pageObjects.discover.getHitCountInt()).toBeGreaterThan(0);
  });

  test('should hide and show the histogram chart when toggle is clicked', async ({
    page,
    pageObjects,
  }) => {
    // Verify chart is initially visible
    await expect(page.testSubj.locator('xyVisChart')).toBeVisible();
    // Hide the chart
    await pageObjects.discover.hideChart();
    // Verify chart is now hidden
    await expect(page.testSubj.locator('xyVisChart')).toBeHidden();
    // Show the chart again for other tests
    await pageObjects.discover.showChart();
    await expect(page.testSubj.locator('xyVisChart')).toBeVisible();
  });

  test('should navigate to Lens editor when edit visualization is clicked', async ({
    page,
    pageObjects,
  }) => {
    await pageObjects.discover.navigateToLensEditor();
    // Verify we're now on the Lens page
    expect(page.url()).toContain('/app/lens');
    await expect(page.testSubj.locator('lnsApp')).toBeVisible();
  });

  test('drag and drop fields to grid', async ({ page, pageObjects }) => {
    // Verify chart is initially visible
    await expect(page.testSubj.locator('xyVisChart')).toBeVisible();
    const fields = ['tags', 'url'];
    await pageObjects.discover.dragFieldToGrid(fields);
    const columnTextArray = await pageObjects.discover.getTheColumnFromGrid();
    expect(columnTextArray).toStrictEqual(fields);
    // Move the left column right (url is already rightmost when only two columns are added)
    await pageObjects.discover.moveColumn('tags', 'right');
    const updatedColumnTextArray = await pageObjects.discover.getTheColumnFromGrid();
    expect(updatedColumnTextArray).toStrictEqual(['url', 'tags']);
  });

  test('type a search query and execute a search', async ({ pageObjects }) => {
    const totalHitCount = await pageObjects.discover.getHitCountInt();
    await pageObjects.discover.writeAndSubmitKqlQuery('response:200');
    await expect
      .poll(async () => {
        const count = await pageObjects.discover.getHitCountInt();
        return count > 0 && count < totalHitCount;
      })
      .toBe(true);
  });

  test('click Field Stats button and validate Document Stats is present', async ({ page }) => {
    await page.testSubj.click('dscViewModeFieldStatsButton');
    await expect(page.testSubj.locator('dataVisualizerTable-loaded')).toBeVisible();
    await page.testSubj.click('dataVisualizerDetailsToggle-bytes-chevronSingleRight');
    await expect(page.testSubj.locator('dataVisualizerDocumentStatsContent')).toBeVisible();
  });

  test('navigate to Lens from field statistics', async ({ page, pageObjects }) => {
    await page.testSubj.click('dscViewModeFieldStatsButton');
    await expect(page.testSubj.locator('dataVisualizerTable-loaded')).toBeVisible();
    const viewLensButton = await pageObjects.discover.getFirstViewLensButtonFromFieldStatistics();
    await viewLensButton.click();
    // Verify we're now on the Lens page
    expect(page.url()).toContain('/app/lens');
    await expect(page.testSubj.locator('lnsApp')).toBeVisible();
  });

  test('download CSV report and validate row length', async ({ pageObjects }) => {
    const hitCount = await pageObjects.discover.getHitCountInt();
    // Can download saved searches only, so save first
    await pageObjects.discover.saveSearch(queryName3);
    await pageObjects.toasts.closeAll(); // close toast to avoid obstruction
    await pageObjects.discover.waitUntilSearchingHasFinished();
    // Wait for download
    const download = await pageObjects.discover.exportAsCsv();
    downloadedFilePath = `${os.tmpdir()}/${download.suggestedFilename()}`;
    await download.saveAs(downloadedFilePath);

    // Validate
    const content = fs.readFileSync(downloadedFilePath, 'utf-8');
    // Parse CSV using papaparse
    const parseResult = Papa.parse(content, {
      header: false,
      skipEmptyLines: true,
    });
    const rows = parseResult.data as string[][];
    expect(rows).toHaveLength(hitCount + 1); // +1 for header row
  });
  // Click on Patterns works with sample data, tbd once pipeline is in place
});
