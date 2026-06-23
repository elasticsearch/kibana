/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test, testData } from '../../fixtures';
import { EXTENDED_TIMEOUT } from '../../fixtures/constants';

const APM_DASHBOARD_DATA_VIEW_TITLE = 'traces-apm*,logs-apm*,metrics-apm*';

const { SERVICE_MAP_TEST_SERVICE, SERVICE_MAP_TEST_ENVIRONMENT_STAGING } = testData;
const SERVICE_MAP_TEST_POSTGRESQL_DEPENDENCY = 'postgresql';
const SERVICE_MAP_TEST_POSTGRESQL_EDGE = `${SERVICE_MAP_TEST_SERVICE}~>${SERVICE_MAP_TEST_POSTGRESQL_DEPENDENCY}`;

test.describe(
  'Service map embeddable',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let dataViewId: string;
    let savedDashboardId: string | undefined;

    test.beforeAll(async ({ apiServices }) => {
      const { data } = await apiServices.dataViews.create({
        title: APM_DASHBOARD_DATA_VIEW_TITLE,
        name: 'APM dashboard test data view',
        override: true,
      });
      dataViewId = data.id;
    });

    test.beforeEach(async ({ browserAuth, uiSettings }) => {
      await browserAuth.loginAsPrivilegedUser();
      await uiSettings.set({ defaultIndex: dataViewId });
    });

    test.afterAll(async ({ apiServices, uiSettings, kbnClient, log }) => {
      await uiSettings.unset('defaultIndex');
      if (dataViewId) {
        await apiServices.dataViews.delete(dataViewId);
      }
      if (savedDashboardId) {
        await kbnClient.savedObjects
          .delete({ type: 'dashboard', id: savedDashboardId })
          .catch((error) => {
            // A 404 is expected if the dashboard was never persisted; surface anything else.
            if (error?.status !== 404) {
              log.warning(`Failed to delete dashboard saved object: ${error?.message}`);
            }
          });
      }
    });

    test('adds Service map panel with service name, environment and KQL filter', async ({
      page,
      pageObjects,
    }) => {
      await test.step('open a new dashboard', async () => {
        await pageObjects.dashboard.openNewDashboard({ timeout: EXTENDED_TIMEOUT * 2 });
      });

      await test.step('set time range to last 24 hours so synth data stays in range vs globalSetup', async () => {
        await pageObjects.datePicker.setCommonlyUsedTime('Last_24_hours');
        await expect(page.getByTestId('dateRangePickerControlButton')).toContainText(
          'Last 24 hours'
        );
        await page.getByTestId('dateRangePickerControlButton').blur();
      });

      await test.step('open add panel flyout', async () => {
        await pageObjects.dashboard.openAddPanelFlyout({ timeout: EXTENDED_TIMEOUT });
      });

      await test.step('add Service map panel without filters', async () => {
        // Add the panel first with no filters. The panel inherits the dashboard's
        // global time range by default (no panel-level `time_range`), so we add it
        // first and then opt into a custom panel time range via the Customize panel
        // flow below — which also widens the suggestions window for the editor.
        await expect(page.getByRole('heading', { name: 'Add to Dashboard' })).toBeVisible();

        const serviceMapMenuItem = page.getByRole('menuitem', {
          name: 'Service map',
          exact: true,
        });
        await expect(serviceMapMenuItem).toBeVisible({ timeout: EXTENDED_TIMEOUT });
        await serviceMapMenuItem.click();

        await expect(
          page.getByRole('heading', { name: 'Create service map panel', level: 2 })
        ).toBeVisible();
        await pageObjects.serviceMapPage.serviceMapEditorSaveButton.click();
      });

      await test.step('verify panel was added and inherits the dashboard time range', async () => {
        await pageObjects.dashboard.waitForPanelsToLoad(1);
        expect(await pageObjects.dashboard.getPanelCount()).toBe(1);
        await expect(pageObjects.serviceMapPage.serviceMapEmbeddable).toBeVisible();
        // No panel-level custom time range by default → no "Customize time range" badge.
        await pageObjects.dashboard.expectTimeRangeBadgeMissing();
      });

      await test.step('set a custom panel time range of last 24 hours', async () => {
        // Opt into a panel-level custom time range (24h) so the panel — and the
        // suggestions endpoint when we re-open the editor below — covers the synth
        // window even with significant delay between global setup and this test.
        await pageObjects.dashboard.openCustomizePanel();
        await pageObjects.dashboard.enableCustomTimeRange();
        await pageObjects.dashboard.openDatePickerQuickMenu();
        await pageObjects.dashboard.clickCommonlyUsedTimeRange('Last_24 hours');
        await pageObjects.dashboard.saveCustomizePanel();
        await pageObjects.dashboard.expectTimeRangeBadgeExists();
      });

      await test.step('edit Service map panel and apply filters', async () => {
        // Re-open the editor in edit mode. The factory passes the panel's
        // current `time_range` (now 24 hours) into the suggestions endpoint
        // so the service / environment combo boxes can resolve
        // `service-map-test` reliably.
        await pageObjects.dashboard.clickPanelAction('embeddablePanelAction-editPanel');
        await expect(
          page.getByRole('heading', { name: 'Edit service map', level: 2 })
        ).toBeVisible();

        await expect
          .poll(() => pageObjects.serviceMapPage.getServiceMapEditorComboBoxLoadingCount(), {
            timeout: EXTENDED_TIMEOUT,
          })
          .toBe(0);

        // Suggestions can be empty under load on cloud/serverless, but the
        // control supports committing typed values via onCreateOption.
        await pageObjects.serviceMapPage.serviceMapEditorServiceNameComboBox.setCustomSingleOption(
          SERVICE_MAP_TEST_SERVICE,
          {
            useFill: true,
            settleTimeoutMs: EXTENDED_TIMEOUT,
          }
        );

        await expect
          .poll(() => pageObjects.serviceMapPage.getServiceMapEditorComboBoxLoadingCount(), {
            timeout: EXTENDED_TIMEOUT,
          })
          .toBe(0);

        await pageObjects.serviceMapPage.selectServiceMapEditorEnvironment(
          SERVICE_MAP_TEST_ENVIRONMENT_STAGING
        );

        // Add KQL filter matching the staging transaction
        await pageObjects.serviceMapPage.serviceMapEditorKueryInput.fill(
          'transaction.name: "GET /api/staging"'
        );

        await pageObjects.serviceMapPage.serviceMapEditorSaveButton.click();
      });

      await test.step('verify embeddable panel renders service map with connected nodes', async () => {
        await expect(
          pageObjects.serviceMapPage.getServiceMapNodeContextHighlightFrame(
            SERVICE_MAP_TEST_SERVICE
          )
        ).toBeVisible({ timeout: EXTENDED_TIMEOUT });
      });

      await test.step('verify embeddable fills the panel horizontally', async () => {
        const panel = pageObjects.serviceMapPage.dashboardEmbeddablePanel;
        const embeddable = pageObjects.serviceMapPage.serviceMapEmbeddable;

        const panelBox = await panel.boundingBox();
        const embeddableBox = await embeddable.boundingBox();

        expect(panelBox).not.toBeNull();
        expect(embeddableBox).not.toBeNull();

        const horizontalFill = embeddableBox!.width / panelBox!.width;
        expect(horizontalFill).toBeGreaterThan(0.95);
      });

      await test.step('click on a service node and verify popover contents', async () => {
        await pageObjects.serviceMapPage.openServiceNodePopover(SERVICE_MAP_TEST_SERVICE);

        await expect(pageObjects.serviceMapPage.serviceMapPopoverContent).toBeVisible({
          timeout: EXTENDED_TIMEOUT,
        });
        await expect(pageObjects.serviceMapPage.serviceMapPopoverTitle).toHaveText(
          SERVICE_MAP_TEST_SERVICE
        );
        await expect(pageObjects.serviceMapPage.serviceMapServiceDetailsButton).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(pageObjects.serviceMapPage.serviceMapPopoverTitle).toBeHidden();
      });

      await test.step('click on a service map edge and verify popover contents', async () => {
        await pageObjects.serviceMapPage.openEdgePopover(SERVICE_MAP_TEST_POSTGRESQL_EDGE);

        await expect(pageObjects.serviceMapPage.serviceMapPopoverContent).toBeVisible({
          timeout: EXTENDED_TIMEOUT,
        });
        await expect(pageObjects.serviceMapPage.serviceMapPopoverTitle).toHaveText(
          `${SERVICE_MAP_TEST_SERVICE} → ${SERVICE_MAP_TEST_POSTGRESQL_DEPENDENCY}`
        );
        await expect(pageObjects.serviceMapPage.serviceMapEdgeExploreTracesButton).toBeVisible();
        await expect(pageObjects.serviceMapPage.serviceMapEdgeExploreTracesButton).toHaveText(
          'Explore traces'
        );

        await page.keyboard.press('Escape');
        await expect(pageObjects.serviceMapPage.serviceMapPopoverTitle).toBeHidden();
      });

      await test.step('maximize the Service map panel', async () => {
        await pageObjects.dashboard.maximizePanel();
        await expect(pageObjects.serviceMapPage.serviceMapEmbeddable).toBeVisible();
      });

      await test.step('verify embeddable fills the maximized panel', async () => {
        const maximizedPanel = pageObjects.serviceMapPage.maximizedDashboardPanel;
        const embeddable = pageObjects.serviceMapPage.serviceMapEmbeddable;

        const panelBox = await maximizedPanel.boundingBox();
        const embeddableBox = await embeddable.boundingBox();

        expect(panelBox).not.toBeNull();
        expect(embeddableBox).not.toBeNull();

        const horizontalFill = embeddableBox!.width / panelBox!.width;
        const verticalFill = embeddableBox!.height / panelBox!.height;

        expect(horizontalFill).toBeGreaterThan(0.95);
        expect(verticalFill).toBeGreaterThan(0.9);
      });

      await test.step('disable custom time range and verify badge disappears', async () => {
        await pageObjects.dashboard.openCustomizePanel();
        await pageObjects.dashboard.disableCustomTimeRange();
        await pageObjects.dashboard.saveCustomizePanel();
        await pageObjects.dashboard.expectTimeRangeBadgeMissing();
      });

      await test.step('click View full service map button and verify navigation', async () => {
        await expect(pageObjects.serviceMapPage.serviceMapViewFullMapButton).toBeVisible();
        await pageObjects.serviceMapPage.serviceMapViewFullMapButton.click();

        await expect(page).toHaveURL(
          new RegExp(`/app/apm/services/${SERVICE_MAP_TEST_SERVICE}/service-map`)
        );
      });
    });

    test('adds a Service map panel with filters + sync toggle and saves the dashboard', async ({
      page,
      pageObjects,
    }) => {
      const dashboardTitle = `Service map filters save test ${Date.now()}`;

      await test.step('open a new dashboard with a 24h time range', async () => {
        await pageObjects.dashboard.openNewDashboard({ timeout: EXTENDED_TIMEOUT * 2 });
        await pageObjects.datePicker.setCommonlyUsedTime('Last_24_hours');
        await page.getByTestId('dateRangePickerControlButton').blur();
      });

      await test.step('add a Service map panel', async () => {
        await pageObjects.dashboard.openAddPanelFlyout({ timeout: EXTENDED_TIMEOUT });
        const serviceMapMenuItem = page.getByRole('menuitem', { name: 'Service map', exact: true });
        await expect(serviceMapMenuItem).toBeVisible({ timeout: EXTENDED_TIMEOUT });
        await serviceMapMenuItem.click();
        await expect(
          page.getByRole('heading', { name: 'Create service map panel', level: 2 })
        ).toBeVisible();
        await pageObjects.serviceMapPage.serviceMapEditorSaveButton.click();
        await pageObjects.dashboard.waitForPanelsToLoad(1);
      });

      await test.step('set a custom panel time range so editor suggestions resolve', async () => {
        await pageObjects.dashboard.openCustomizePanel();
        await pageObjects.dashboard.enableCustomTimeRange();
        await pageObjects.dashboard.openDatePickerQuickMenu();
        await pageObjects.dashboard.clickCommonlyUsedTimeRange('Last_24 hours');
        await pageObjects.dashboard.saveCustomizePanel();
      });

      await test.step('edit the panel: set service/env/KQL filters and enable filter sync', async () => {
        await pageObjects.dashboard.clickPanelAction('embeddablePanelAction-editPanel');
        await expect(
          page.getByRole('heading', { name: 'Edit service map', level: 2 })
        ).toBeVisible();

        await expect
          .poll(() => pageObjects.serviceMapPage.getServiceMapEditorComboBoxLoadingCount(), {
            timeout: EXTENDED_TIMEOUT,
          })
          .toBe(0);

        await pageObjects.serviceMapPage.serviceMapEditorServiceNameComboBox.setCustomSingleOption(
          SERVICE_MAP_TEST_SERVICE,
          { useFill: true, settleTimeoutMs: EXTENDED_TIMEOUT }
        );
        await pageObjects.serviceMapPage.selectServiceMapEditorEnvironment(
          SERVICE_MAP_TEST_ENVIRONMENT_STAGING
        );
        await pageObjects.serviceMapPage.serviceMapEditorKueryInput.fill(
          'transaction.name: "GET /api/staging"'
        );

        // Enable "Sync with dashboard filters" — this writes the
        // `sync_with_dashboard_filters` field that previously broke dashboard saves.
        await page.getByTestId('apmServiceMapEditorSyncFiltersToggle').click();

        await pageObjects.serviceMapPage.serviceMapEditorSaveButton.click();
      });

      await test.step('save the dashboard and verify it persists without error', async () => {
        await pageObjects.dashboard.saveDashboard(dashboardTitle);

        // A failed save (e.g. schema validation rejecting the panel config) shows an
        // error toast and keeps the dashboard dirty; assert success instead.
        await expect(page.getByTestId('errorToastMessage')).toBeHidden();
        await expect(page).toHaveURL(/\/app\/dashboards#\/view\//);

        const dashboardUrlMatch = page.url().match(/\/view\/([^/?]+)/);
        savedDashboardId = dashboardUrlMatch?.[1];

        await pageObjects.dashboard.waitForPanelsToLoad(1);
        expect(await pageObjects.dashboard.getPanelCount()).toBe(1);
        await expect(pageObjects.serviceMapPage.serviceMapEmbeddable).toBeVisible();
      });

      await test.step('reload the saved dashboard and verify the panel state persisted', async () => {
        await page.reload();
        await pageObjects.dashboard.waitForPanelsToLoad(1);
        await expect(pageObjects.serviceMapPage.serviceMapEmbeddable).toBeVisible();

        // Re-open the editor and confirm the sync toggle stayed on after save + reload.
        await pageObjects.dashboard.clickPanelAction('embeddablePanelAction-editPanel');
        await expect(
          page.getByRole('heading', { name: 'Edit service map', level: 2 })
        ).toBeVisible();
        await expect(page.getByTestId('apmServiceMapEditorSyncFiltersToggle')).toBeChecked();

        // Close the editor without changing anything so the dashboard query bar is interactable.
        await page.getByTestId('apmServiceMapEditorCancelButton').click();
        await expect(
          page.getByRole('heading', { name: 'Edit service map', level: 2 })
        ).toBeHidden();
      });

      const serviceNode = pageObjects.serviceMapPage.getServiceNodeRoot(SERVICE_MAP_TEST_SERVICE);

      await test.step('with sync on, the panel respects a new dashboard KQL filter', async () => {
        // Baseline: the panel's own filters (service/env/kuery) still resolve the node.
        await expect(serviceNode).toBeVisible({ timeout: EXTENDED_TIMEOUT });

        // A dashboard-level KQL query that matches no documents is AND-ed with the panel's
        // own filters when sync is enabled, so the map should empty out.
        await pageObjects.queryBar.setQuery('service.name : "non-existent-service-xyz"');
        await page.getByTestId('querySubmitButton').click();
        await expect(serviceNode).toBeHidden({ timeout: EXTENDED_TIMEOUT });

        // Clearing the dashboard query brings the node back — proving the panel reacts to
        // the dashboard filter rather than ignoring it.
        await pageObjects.queryBar.clearQuery();
        await page.getByTestId('querySubmitButton').click();
        await expect(serviceNode).toBeVisible({ timeout: EXTENDED_TIMEOUT });
      });

      await test.step('the panel reflects dashboard global time range changes', async () => {
        // The dashboard's global time isn't stored with the saved object, so pin it to a
        // window that covers the synth data before the panel starts inheriting it.
        await pageObjects.datePicker.setCommonlyUsedTime('Last_24_hours');
        await page.getByTestId('dateRangePickerControlButton').blur();

        // Drop the panel-level custom time range so the panel inherits the dashboard's
        // global time (no `time_range` published -> fetch$ falls back to dashboard time).
        await pageObjects.dashboard.openCustomizePanel();
        await pageObjects.dashboard.disableCustomTimeRange();
        await pageObjects.dashboard.saveCustomizePanel();
        await pageObjects.dashboard.expectTimeRangeBadgeMissing();

        // Still last 24h at the dashboard level (inherited) -> node present.
        await expect(serviceNode).toBeVisible({ timeout: EXTENDED_TIMEOUT });

        // Move the dashboard's global time to a window with no APM data -> map empties,
        // confirming the panel honors the dashboard time range change once it inherits it.
        await pageObjects.datePicker.setAbsoluteRange({
          from: 'Sep 22, 2015 @ 00:00:00.000',
          to: 'Sep 23, 2015 @ 00:00:00.000',
        });
        await expect(serviceNode).toBeHidden({ timeout: EXTENDED_TIMEOUT });
      });
    });
  }
);
