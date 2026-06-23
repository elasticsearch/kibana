/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { test, tags } from '@kbn/scout';
import fs from 'fs';
import os from 'os';
import { SavedObjectsTracker, cleanupDownloadedFile } from '../../helpers';

const SAMPLE_DASHBOARD = '[Logs] Web Traffic';
const SAMPLE_DASHBOARD_PANEL_COUNT = 12;

const tracker = new SavedObjectsTracker();
let downloadedFilePath: string | null = null;

test.describe('Visualize app', { tag: tags.stateful.classic }, () => {
  test.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsAdmin();
  });

  test.afterEach(async ({ kbnClient }) => {
    downloadedFilePath = cleanupDownloadedFile(downloadedFilePath);
    await tracker.cleanup(kbnClient);
  });

  test('should create and save an aggregation-based visualization', async ({ pageObjects }) => {
    tracker.track({ type: 'visualization', title: 'Test Agg-Based Metric Vis' });

    await test.step('create aggregation-based metric visualization', async () => {
      await pageObjects.visualize.createAggBasedVisualization('metric', 'kibana_sample_data_logs');
    });

    await test.step('save visualization to existing dashboard', async () => {
      await pageObjects.visualize.saveToExistingDashboard(
        'Test Agg-Based Metric Vis',
        SAMPLE_DASHBOARD
      );
    });

    await test.step('verify panel added to dashboard', async () => {
      await pageObjects.dashboard.waitForRenderComplete();
      expect(await pageObjects.dashboard.getPanelCount()).toBe(SAMPLE_DASHBOARD_PANEL_COUNT + 1);
    });
  });

  test('should create and save a Lens visualization', async ({ page, pageObjects }) => {
    tracker.track({ type: 'lens', title: 'Test Lens Visualization' });

    await test.step('create Lens visualization', async () => {
      await pageObjects.visualize.goto();
      await pageObjects.visualize.openNewVisualizationWizard();
      await pageObjects.visualize.clickVisType('lens');
      await expect(page.testSubj.locator('lnsApp')).toBeVisible();
      await pageObjects.lens.dragFieldToWorkspace('records');
    });

    await test.step('save Lens visualization to existing dashboard', async () => {
      await pageObjects.lens.save('Test Lens Visualization', {
        addToDashboard: 'existing',
        dashboardTitle: SAMPLE_DASHBOARD,
      });
    });

    await test.step('verify panel added to dashboard', async () => {
      await pageObjects.dashboard.waitForRenderComplete();
      expect(await pageObjects.dashboard.getPanelCount()).toBe(SAMPLE_DASHBOARD_PANEL_COUNT + 1);
    });
  });

  test('should create and save a custom visualization (Vega)', async ({ pageObjects }) => {
    tracker.track({ type: 'visualization', title: 'Test Vega Visualization' });

    await test.step('create Vega visualization', async () => {
      await pageObjects.visualize.createVegaVisualization();
    });

    await test.step('save visualization to existing dashboard', async () => {
      await pageObjects.visualize.saveToExistingDashboard(
        'Test Vega Visualization',
        SAMPLE_DASHBOARD
      );
    });

    await test.step('verify panel added to dashboard', async () => {
      await pageObjects.dashboard.waitForRenderComplete();
      expect(await pageObjects.dashboard.getPanelCount()).toBe(SAMPLE_DASHBOARD_PANEL_COUNT + 1);
    });
  });

  test('should create and save a TSVB visualization', async ({ pageObjects }) => {
    tracker.track({ type: 'visualization', title: 'Test TSVB Visualization' });

    await test.step('create TSVB visualization', async () => {
      await pageObjects.visualize.createTSVBVisualization();
    });

    await test.step('save visualization to existing dashboard', async () => {
      await pageObjects.visualize.saveToExistingDashboard(
        'Test TSVB Visualization',
        SAMPLE_DASHBOARD
      );
    });

    await test.step('verify panel added to dashboard', async () => {
      await pageObjects.dashboard.waitForRenderComplete();
      expect(await pageObjects.dashboard.getPanelCount()).toBe(SAMPLE_DASHBOARD_PANEL_COUNT + 1);
    });
  });

  test('should create a TSVB visualization and save it to a new dashboard', async ({
    page,
    pageObjects,
  }) => {
    const dashboardName = 'TSVB New Dashboard';
    tracker.track({ type: 'visualization', title: 'Test TSVB New Dashboard Vis' });
    tracker.track({ type: 'dashboard', title: dashboardName });

    await test.step('create TSVB visualization', async () => {
      await pageObjects.visualize.createTSVBVisualization();
    });

    await test.step('save visualization to a new dashboard', async () => {
      await pageObjects.visualize.saveToNewDashboard('Test TSVB New Dashboard Vis');
    });

    await test.step('verify redirected to new dashboard with the panel', async () => {
      await pageObjects.dashboard.waitForRenderComplete();
      expect(await pageObjects.dashboard.getPanelCount()).toBe(1);
    });

    await test.step('save the new dashboard', async () => {
      await pageObjects.dashboard.saveDashboard(dashboardName);
      const heading = page.testSubj.locator('breadcrumb last');
      await expect(heading).toHaveText('Editing ' + dashboardName);
    });
  });

  test('should export a visualization as PDF and download the report', async ({
    page,
    pageObjects,
  }) => {
    await test.step('open a sample data visualization', async () => {
      await pageObjects.visualize.goto();
      await pageObjects.visualize.openSavedVisualization('[Logs] Visitors Map');
    });

    await test.step('trigger PDF export', async () => {
      await page.testSubj.click('exportTopNavButton');
      await expect(page.testSubj.locator('exportMenuItem-PDF')).toBeVisible();
      await page.testSubj.click('exportMenuItem-PDF');
      await expect(page.testSubj.locator('exportItemDetailsFlyout')).toBeVisible();
      await page.testSubj.click('generateReportButton');
    });

    await test.step('wait for report to be queued', async () => {
      await expect(page.testSubj.locator('queueReportSuccess')).toBeVisible({ timeout: 60_000 });
    });

    await test.step('download and verify PDF report', async () => {
      const downloadButton = page.testSubj.locator('downloadCompletedReportButton');
      await expect(downloadButton).toBeVisible({ timeout: 120_000 });
      const downloadPromise = page.waitForEvent('download');
      await downloadButton.click();
      const download = await downloadPromise;

      downloadedFilePath = `${os.tmpdir()}/${download.suggestedFilename()}`;
      await download.saveAs(downloadedFilePath);

      expect(fs.existsSync(downloadedFilePath)).toBe(true);
      const stats = fs.statSync(downloadedFilePath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  test('should save a map visualization to library', async ({ page, pageObjects }) => {
    const visName = 'Library Map Vis';
    tracker.track({ type: 'map', title: visName });

    await test.step('create a new map visualization', async () => {
      await pageObjects.visualize.createMapVisualization();
    });

    await test.step('save map to library', async () => {
      await pageObjects.maps.saveButton.click();
      await pageObjects.visualize.saveToLibrary(visName);
      await expect(page.testSubj.locator('breadcrumb last')).toHaveText(visName);
    });
  });
});
