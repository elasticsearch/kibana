/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import fs from 'fs';
import os from 'os';
import { test } from '../../fixtures';
import { SavedObjectsTracker, cleanupDownloadedFile } from '../../helpers';

const tracker = new SavedObjectsTracker();
let downloadedFilePath: string | null = null;

test.describe('Dashboard app', { tag: tags.stateful.classic }, () => {
  test.beforeEach(async ({ browserAuth, pageObjects, uiSettings }) => {
    await browserAuth.loginAsAdmin();
    await uiSettings.set({
      'timepicker:timeDefaults': '{ "from": "now-1h", "to": "now"}',
    });
    await pageObjects.dashboard.goto();
  });

  test.afterEach(async ({ kbnClient }) => {
    downloadedFilePath = cleanupDownloadedFile(downloadedFilePath);
    await tracker.cleanup(kbnClient);
  });

  test('should create dashboard with ES|QL, Lens, and Vega panels', async ({
    page,
    pageObjects,
  }) => {
    const dashboardName = 'Test Dashboard with Multiple Panels';
    tracker.track({ type: 'dashboard', title: dashboardName });

    await pageObjects.dashboard.openNewDashboard();

    await test.step('add ES|QL panel', async () => {
      await pageObjects.dashboard.addNewESQLPanel();
      await pageObjects.dashboard.applyAndCloseESQLPanel();
      await expect(page.testSubj.locator('lnsVisualizationContainer')).toBeVisible();
    });

    await test.step('add Lens panel', async () => {
      await pageObjects.dashboard.addNewLensPanel();
      await pageObjects.lens.dragFieldToWorkspace('records');
      await pageObjects.lens.saveAndReturn();
      await expect(page.testSubj.locator('xyVisChart')).toBeVisible();
    });

    await test.step('add Vega panel', async () => {
      await pageObjects.dashboard.addNewPanel('Vega');
      await pageObjects.dashboard.clickVisualizeSaveAndReturn();
      await pageObjects.dashboard.expectPanelCount(3);
    });

    await pageObjects.dashboard.saveDashboard(dashboardName);
    const heading = page.testSubj.locator('breadcrumb last');
    await expect(heading).toHaveText('Editing ' + dashboardName);
  });

  test('should edit existing dashboard and add map and Vega panels', async ({ pageObjects }) => {
    const logsDashboardTitle = '[Logs] Web Traffic';

    await pageObjects.dashboard.clickDashboardTitleLink(logsDashboardTitle);
    await pageObjects.dashboard.expectPanelCount(12);

    await pageObjects.dashboard.switchToEditMode();

    await test.step('add a Map panel', async () => {
      await pageObjects.dashboard.addNewPanel('Maps');
      await pageObjects.maps.addDocumentsLayer('Kibana Sample Data Logs');
      await pageObjects.dashboard.expectPanelCount(13);
    });

    await test.step('add a Vega panel', async () => {
      await pageObjects.dashboard.addNewPanel('Vega');
      await pageObjects.dashboard.clickVisualizeSaveAndReturn();
      await pageObjects.dashboard.expectPanelCount(14);
    });

    await pageObjects.dashboard.saveChangesToExistingDashboard();
  });

  test('should duplicate an existing dashboard and preserve panels', async ({ pageObjects }) => {
    const logsDashboardTitle = '[Logs] Web Traffic';
    const duplicatedDashboardTitle = `${logsDashboardTitle} (1)`;
    tracker.track({ type: 'dashboard', title: duplicatedDashboardTitle });

    await pageObjects.dashboard.clickDashboardTitleLink(logsDashboardTitle);
    await pageObjects.dashboard.ensureViewMode();

    const originalPanelCount = await pageObjects.dashboard.getPanelCount();

    await pageObjects.dashboard.saveDashboard(duplicatedDashboardTitle);

    await pageObjects.dashboard.goto();

    await test.step('verify both dashboards exist in listing', async () => {
      await expect(pageObjects.dashboard.getDashboardListingLink(logsDashboardTitle)).toBeVisible();
      await expect(
        pageObjects.dashboard.getDashboardListingLink(duplicatedDashboardTitle)
      ).toBeVisible();
    });

    await test.step('verify duplicated dashboard has same panels', async () => {
      await pageObjects.dashboard.clickDashboardTitleLink(duplicatedDashboardTitle);
      await pageObjects.dashboard.expectPanelCount(originalPanelCount);
    });
  });

  test('should save a copy of a dashboard from edit mode', async ({ pageObjects }) => {
    const logsDashboardTitle = '[Logs] Web Traffic';
    const copiedDashboardTitle = '[Logs] Web Traffic Copy';
    tracker.track({ type: 'dashboard', title: copiedDashboardTitle });

    await pageObjects.dashboard.clickDashboardTitleLink(logsDashboardTitle);
    await pageObjects.dashboard.switchToEditMode();

    const originalPanelCount = await pageObjects.dashboard.getPanelCount();

    await pageObjects.dashboard.saveDashboardAsCopy(copiedDashboardTitle);

    await pageObjects.dashboard.goto();

    await test.step('verify both original and copy exist in listing', async () => {
      await expect(pageObjects.dashboard.getDashboardListingLink(logsDashboardTitle)).toBeVisible();
      await expect(
        pageObjects.dashboard.getDashboardListingLink(copiedDashboardTitle)
      ).toBeVisible();
    });

    await test.step('verify copy has same panel count', async () => {
      await pageObjects.dashboard.clickDashboardTitleLink(copiedDashboardTitle);
      await pageObjects.dashboard.expectPanelCount(originalPanelCount);
    });
  });

  test('should add dashboard and URL link types to a dashboard', async ({ page, pageObjects }) => {
    const dashboardName = 'Test Dashboard with Links';
    tracker.track({ type: 'dashboard', title: dashboardName });

    await pageObjects.dashboard.openNewDashboard();

    await test.step('add a Links panel with dashboard and URL links', async () => {
      await pageObjects.dashboard.addNewPanel('Links');
      await pageObjects.dashboardLinks.expectPanelEditorFlyoutIsOpen();
      await pageObjects.dashboardLinks.addDashboardLink('[Logs] Web Traffic');
      await pageObjects.dashboardLinks.addExternalLink('https://www.elastic.co', {
        linkLabel: 'Elastic Website',
      });
      await pageObjects.dashboardLinks.clickPanelEditorSaveButton();
      await expect
        .poll(async () => await pageObjects.dashboardLinks.getNumberOfLinksInPanel())
        .toBe(2);
    });

    await pageObjects.dashboard.saveDashboard(dashboardName);
    const heading = page.testSubj.locator('breadcrumb last');
    await expect(heading).toHaveText('Editing ' + dashboardName);
  });

  test('should perform lens panel custom actions - explore in Discover', async ({
    page,
    pageObjects,
  }) => {
    const panelTitle = 'Test Lens Panel';
    const dashboardName = 'Test Dashboard Lens Panel Actions';
    tracker.track({ type: 'dashboard', title: dashboardName });
    tracker.track({ type: 'lens', title: 'Saved Lens Panel' });

    await pageObjects.dashboard.openNewDashboard();

    await test.step('add a Lens panel with a title', async () => {
      await pageObjects.dashboard.addNewLensPanel();
      await pageObjects.lens.dragFieldToWorkspace('records');
      await pageObjects.lens.saveAndReturn();

      await pageObjects.dashboard.openCustomizePanel();
      await pageObjects.dashboard.setCustomPanelTitle(panelTitle);
      await pageObjects.dashboard.saveCustomizePanel();
    });

    await pageObjects.dashboard.saveDashboard(dashboardName);

    await test.step('click Explore in Discover and validate navigation', async () => {
      const newPagePromise = page.context().waitForEvent('page');
      await pageObjects.dashboard.clickPanelAction(
        'embeddablePanelAction-ACTION_OPEN_IN_DISCOVER',
        panelTitle
      );
      const discoverPage = await newPagePromise;
      await discoverPage.waitForLoadState();
      await expect(discoverPage.locator('[data-test-subj="unifiedHistogramChart"]')).toBeVisible();
      await discoverPage.close();
    });

    await test.step('save panel to library', async () => {
      await pageObjects.dashboard.saveToLibrary('Saved Lens Panel', panelTitle);
    });
  });

  test('should enter and exit fullscreen mode', async ({ page, pageObjects }) => {
    const logsDashboardTitle = '[Logs] Web Traffic';

    await pageObjects.dashboard.clickDashboardTitleLink(logsDashboardTitle);
    await pageObjects.dashboard.ensureViewMode();

    await test.step('enter fullscreen', async () => {
      await pageObjects.dashboard.enterFullscreen();
    });

    await test.step('exit fullscreen via Escape', async () => {
      await pageObjects.dashboard.exitFullscreen();
    });

    await page.testSubj.click('app-menu-overflow-button');
    await expect(page.testSubj.locator('dashboardFullScreenMode')).toBeVisible();
  });

  test('should update dashboard settings', async ({ page, pageObjects }) => {
    const logsDashboardTitle = '[Logs] Web Traffic';

    await pageObjects.dashboard.clickDashboardTitleLink(logsDashboardTitle);
    await pageObjects.dashboard.switchToEditMode();

    await pageObjects.dashboard.openSettingsFlyout();
    await expect(page.testSubj.locator('dashboardSettingsFlyout')).toBeVisible();

    const updatedTitle = '[Logs] Web Traffic Updated';

    await test.step('update title', async () => {
      await pageObjects.dashboard.setDashboardTitle(updatedTitle);
      await expect(page.testSubj.locator('dashboardTitleInput')).toHaveValue(updatedTitle);
    });

    await test.step('update description', async () => {
      await pageObjects.dashboard.setDashboardDescription('Updated description for testing');
      await expect(page.testSubj.locator('dashboardDescriptionInput')).toHaveValue(
        'Updated description for testing'
      );
    });

    await test.step('toggle store time with dashboard', async () => {
      const storeTimeSwitch = page.testSubj.locator('storeTimeWithDashboard');
      const wasChecked = (await storeTimeSwitch.getAttribute('aria-checked')) === 'true';
      await storeTimeSwitch.click();
      const expectedState = wasChecked ? 'false' : 'true';
      await expect(storeTimeSwitch).toHaveAttribute('aria-checked', expectedState);
    });

    await test.step('enable sync cursor and toggle sync tooltips', async () => {
      const syncCursorSwitch = page.testSubj.locator('dashboardSyncCursorCheckbox');
      const syncTooltipsSwitch = page.testSubj.locator('dashboardSyncTooltipsCheckbox');

      const cursorWasChecked = (await syncCursorSwitch.getAttribute('aria-checked')) === 'true';
      if (!cursorWasChecked) {
        await syncCursorSwitch.click();
      }
      await expect(syncCursorSwitch).toHaveAttribute('aria-checked', 'true');

      await expect(syncTooltipsSwitch).toBeEnabled();
      const tooltipsWasChecked = (await syncTooltipsSwitch.getAttribute('aria-checked')) === 'true';
      await syncTooltipsSwitch.click();
      const expectedTooltipsState = tooltipsWasChecked ? 'false' : 'true';
      await expect(syncTooltipsSwitch).toHaveAttribute('aria-checked', expectedTooltipsState);
    });

    await pageObjects.dashboard.applyDashboardSettings();
    await expect(page.testSubj.locator('dashboardSettingsFlyout')).toBeHidden();

    await test.step('verify title updated in dashboard heading', async () => {
      const heading = page.locator('#dashboardTitle');
      await expect(heading).toContainText(updatedTitle);
    });
  });

  test('should export dashboard as PDF and download the report', async ({ page, pageObjects }) => {
    const logsDashboardTitle = '[Logs] Web Traffic';

    await pageObjects.dashboard.clickDashboardTitleLink(logsDashboardTitle);
    await pageObjects.dashboard.ensureViewMode();

    await test.step('trigger PDF export from share menu', async () => {
      await page.testSubj.click('exportTopNavButton');
      await expect(page.testSubj.locator('exportMenuItem-PDF')).toBeVisible();
      await page.testSubj.click('exportMenuItem-PDF');
      await expect(page.testSubj.locator('exportItemDetailsFlyout')).toBeVisible();
      await page.testSubj.click('generateReportButton');
    });

    await test.step('wait for report to be queued', async () => {
      await expect(page.testSubj.locator('queueReportSuccess')).toBeVisible({
        timeout: 60_000,
      });
    });

    await test.step('wait for report completion and download', async () => {
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

  test('should export dashboard as PNG and download the report', async ({ page, pageObjects }) => {
    const logsDashboardTitle = '[Logs] Web Traffic';

    await pageObjects.dashboard.clickDashboardTitleLink(logsDashboardTitle);
    await pageObjects.dashboard.ensureViewMode();

    await test.step('trigger PNG export from share menu', async () => {
      await page.testSubj.click('exportTopNavButton');
      await expect(page.testSubj.locator('exportMenuItem-PNG')).toBeVisible();
      await page.testSubj.click('exportMenuItem-PNG');
      await expect(page.testSubj.locator('exportItemDetailsFlyout')).toBeVisible();
      await page.testSubj.click('generateReportButton');
    });

    await test.step('wait for report to be queued', async () => {
      await expect(page.testSubj.locator('queueReportSuccess')).toBeVisible({
        timeout: 60_000,
      });
    });

    await test.step('wait for report completion and download', async () => {
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

  test('should maximize a panel', async ({ page, pageObjects }) => {
    const logsDashboardTitle = '[Logs] Web Traffic';

    await pageObjects.dashboard.clickDashboardTitleLink(logsDashboardTitle);
    await pageObjects.dashboard.ensureViewMode();

    await test.step('maximize a panel', async () => {
      await pageObjects.dashboard.maximizePanel();
    });

    await expect(page.locator('.dshLayout-isMaximizedPanel')).toBeVisible();
  });

  test('should display created by for a newly created dashboard', async ({ page, pageObjects }) => {
    const dashboardName = 'Created By Test Dashboard';
    tracker.track({ type: 'dashboard', title: dashboardName });

    await test.step('create and save a new dashboard', async () => {
      await pageObjects.dashboard.openNewDashboard();
      await pageObjects.dashboard.saveDashboard(dashboardName);
    });

    await test.step('navigate back to dashboard listing', async () => {
      await pageObjects.dashboard.goto();
    });

    await test.step('verify created by column is visible', async () => {
      const createdByHeader = page.testSubj
        .locator('userFilterPopoverButton')
        .filter({ hasText: 'Created by' });
      await expect(createdByHeader).toBeVisible();
    });

    await test.step('verify the new dashboard row shows the creator avatar', async () => {
      const dashboardRow = pageObjects.dashboard
        .getDashboardListingLink(dashboardName)
        .locator('xpath=ancestor::tr');
      await expect(dashboardRow).toBeVisible();

      const creatorAvatar = dashboardRow.locator('[data-test-subj="userAvatarTip-elastic_admin"]');
      await expect(creatorAvatar).toBeVisible();
    });
  });

  test('should add panels from library to dashboard', async ({ pageObjects }) => {
    tracker.track({ type: 'lens', title: 'Lib Lens Panel' });
    tracker.track({ type: 'dashboard', title: 'Dashboard with Library Panels' });
    tracker.track({ type: 'dashboard', title: 'Dashboard from Library' });

    await test.step('save a lens panel to the library', async () => {
      await pageObjects.dashboard.openNewDashboard();
      await pageObjects.dashboard.addNewLensPanel();
      await pageObjects.lens.dragFieldToWorkspace('records');
      await pageObjects.lens.saveAndReturn();

      await pageObjects.dashboard.openCustomizePanel();
      await pageObjects.dashboard.setCustomPanelTitle('Lib Lens Panel');
      await pageObjects.dashboard.saveCustomizePanel();
      await pageObjects.dashboard.saveToLibrary('Lib Lens Panel', 'Lib Lens Panel');
      await pageObjects.dashboard.saveDashboard('Dashboard with Library Panels');
    });

    await test.step('add the library panel to a new dashboard', async () => {
      await pageObjects.dashboard.goto();
      await pageObjects.dashboard.openNewDashboard();
      await pageObjects.dashboard.addPanelFromLibrary('Lib Lens Panel');
      await pageObjects.dashboard.expectPanelCount(1);
    });

    await test.step('verify the panel is linked to the library', async () => {
      await pageObjects.dashboard.expectLinkedToLibrary('Lib Lens Panel');
    });

    await pageObjects.dashboard.saveDashboard('Dashboard from Library');
  });

  test('should add a URL drilldown to a lens panel', async ({ page, pageObjects }) => {
    const panelTitle = 'Drilldown Test Panel';
    const dashboardName = 'Test Dashboard Drilldown';
    tracker.track({ type: 'dashboard', title: dashboardName });

    await pageObjects.dashboard.openNewDashboard();

    await test.step('create a Lens panel with a title', async () => {
      await pageObjects.dashboard.addNewLensPanel();
      await pageObjects.lens.dragFieldToWorkspace('records');
      await pageObjects.lens.saveAndReturn();

      await pageObjects.dashboard.openCustomizePanel();
      await pageObjects.dashboard.setCustomPanelTitle(panelTitle);
      await pageObjects.dashboard.saveCustomizePanel();
    });

    await pageObjects.dashboard.saveDashboard(dashboardName);
    await pageObjects.toasts.closeAll();

    await test.step('open drilldown creation flyout', async () => {
      await pageObjects.dashboard.clickPanelAction(
        'embeddablePanelAction-OPEN_FLYOUT_ADD_DRILLDOWN',
        panelTitle
      );
      await expect(page.testSubj.locator('createDrilldownFlyout')).toBeVisible();
    });

    await test.step('create a URL drilldown', async () => {
      await pageObjects.dashboard.createUrlDrilldown('Go to Elastic', 'https://www.elastic.co');
      await expect(page.testSubj.locator('createDrilldownFlyout')).toBeHidden();
    });
  });
});
