/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../../fixtures';
import {
  HOST1_NAME,
  HOSTS,
  SERVICE_PER_HOST_COUNT,
  DATE_WITH_HOSTS_DATA_FROM,
  DATE_WITH_HOSTS_DATA_TO,
  EXTENDED_TIMEOUT,
} from '../../fixtures/constants';
import {
  cleanHostsFlyoutSynthtraceData,
  ingestHostsFlyoutSynthtraceData,
} from '../../fixtures/sequential_hosts_synthtrace';

const CUSTOM_DASHBOARDS_SETTING = 'observability:enableInfrastructureAssetCustomDashboards';

test.describe(
  'Hosts Page - Flyout',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeAll(async ({ esClient, kbnUrl, log, config, kbnClient }) => {
      log.info('Sequential suite: ingesting ECS hosts + logs + APM services for flyout tests');
      await ingestHostsFlyoutSynthtraceData({ esClient, kbnUrl, log, config });

      log.info('Sequential suite: waiting for hosts metrics to be searchable before navigating');
      await expect
        .poll(
          async () => {
            try {
              const { data } = await kbnClient.request<{ nodes: Array<{ name: string }> }>({
                method: 'POST',
                path: '/api/metrics/infra/host',
                body: {
                  from: DATE_WITH_HOSTS_DATA_FROM,
                  to: DATE_WITH_HOSTS_DATA_TO,
                  metrics: ['cpuV2', 'diskSpaceUsage', 'memory', 'memoryFree', 'normalizedLoad1m'],
                  limit: 100,
                  schema: 'ecs',
                },
              });
              return data.nodes.length;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              log.debug(`Hosts metrics readiness probe failed, retrying: ${message}`);
              return 0;
            }
          },
          { timeout: EXTENDED_TIMEOUT, intervals: [1_000, 2_000, 5_000] }
        )
        .toBeGreaterThanOrEqual(HOSTS.length);
    });

    test.beforeEach(async ({ browserAuth, pageObjects: { hostsPage } }) => {
      // Flyout suites open Lens + elastic-charts in the host overview tab.
      // Under CI contention the cumulative cost of navigation, flyout init,
      // and first-time chart rendering can exceed Scout's default 60s test
      // timeout. Now that this spec runs sequentially, a smaller budget is
      // sufficient while still covering first-render variance.
      test.setTimeout(120_000);
      await browserAuth.loginAsViewer();
      await hostsPage.goToPage({
        from: DATE_WITH_HOSTS_DATA_FROM,
        to: DATE_WITH_HOSTS_DATA_TO,
        preferredSchema: 'ecs',
      });
      await expect(hostsPage.tableRows).toHaveCount(HOSTS.length);
    });

    test.afterEach(async ({ kbnClient }) => {
      // Reset the custom-dashboards setting after every test so cleanup runs
      // even if the test times out. No-op for tests that didn't toggle it.
      await kbnClient.uiSettings.update({ [CUSTOM_DASHBOARDS_SETTING]: false });
    });

    test.afterAll(async ({ esClient, kbnUrl, log, config }) => {
      log.info('Sequential suite: cleaning synthtrace data for flyout tests');
      await cleanHostsFlyoutSynthtraceData({ esClient, kbnUrl, log, config });
    });

    test('Overview Tab - KPI charts and collapsible sections', async ({
      pageObjects: { hostsPage, assetDetailsPage },
    }) => {
      await hostsPage.openHostFlyout(HOST1_NAME);

      await test.step('verify KPI charts are rendered', async () => {
        await expect(assetDetailsPage.hostOverviewTab.kpiGrid).toBeVisible({
          timeout: EXTENDED_TIMEOUT,
        });
        await expect(
          assetDetailsPage.hostOverviewTab.getKPIEmbeddableError('cpuUsage')
        ).toHaveCount(0);
        await expect(
          assetDetailsPage.hostOverviewTab.getKPIEmbeddableError('normalizedLoad1m')
        ).toHaveCount(0);
        await expect(
          assetDetailsPage.hostOverviewTab.getKPIEmbeddableError('memoryUsage')
        ).toHaveCount(0);
        await expect(
          assetDetailsPage.hostOverviewTab.getKPIEmbeddableError('diskUsage')
        ).toHaveCount(0);
      });

      await test.step('verify collapsible sections exist', async () => {
        await expect(assetDetailsPage.hostOverviewTab.metadataSectionCollapsible).toBeVisible();
        await expect(assetDetailsPage.hostOverviewTab.alertsSectionCollapsible).toBeVisible();
        await expect(assetDetailsPage.hostOverviewTab.metricsSectionCollapsible).toBeVisible();
        await expect(assetDetailsPage.hostOverviewTab.servicesSectionCollapsible).toBeVisible();
      });

      await test.step('verify metrics chart sections', async () => {
        await expect(assetDetailsPage.hostOverviewTab.metricsCpuUsageChart).toBeVisible();
        await expect(assetDetailsPage.hostOverviewTab.metricsCpuNormalizedLoadChart).toBeVisible();
        await expect(assetDetailsPage.hostOverviewTab.metricsMemoryUsageChart).toBeVisible();
        await expect(assetDetailsPage.hostOverviewTab.metricsDiskUsageChart).toBeVisible();
        await expect(assetDetailsPage.hostOverviewTab.metricsDiskIOChart).toBeVisible();
        await expect(assetDetailsPage.hostOverviewTab.metricsNetworkChart).toBeVisible();
      });
    });

    test('Overview Tab - Services section', async ({
      pageObjects: { hostsPage, assetDetailsPage },
    }) => {
      await hostsPage.openHostFlyout(HOST1_NAME);

      await test.step('verify services section is visible with correct count', async () => {
        await expect(assetDetailsPage.hostOverviewTab.servicesContainer).toBeVisible({
          timeout: EXTENDED_TIMEOUT,
        });
        const serviceLinks = assetDetailsPage.hostOverviewTab.servicesContainer.getByRole('link');
        await expect(serviceLinks).toHaveCount(SERVICE_PER_HOST_COUNT);
      });
    });

    test('Metadata Tab', async ({ pageObjects: { hostsPage, assetDetailsPage } }) => {
      await hostsPage.openHostFlyout(HOST1_NAME);

      await test.step('navigate to metadata tab', async () => {
        await assetDetailsPage.metadataTab.clickTab();
        await expect(assetDetailsPage.metadataTab.tab).toHaveAttribute('aria-selected', 'true');
      });

      await test.step('verify metadata table is visible', async () => {
        await expect(assetDetailsPage.metadataTab.table).toBeVisible();
        await expect(assetDetailsPage.metadataTab.searchBar).toBeVisible();
      });
    });

    test('Metrics Tab', async ({ pageObjects: { hostsPage, assetDetailsPage } }) => {
      await hostsPage.openHostFlyout(HOST1_NAME);

      await test.step('navigate to metrics tab', async () => {
        await assetDetailsPage.hostMetricsTab.clickTab();
        await expect(assetDetailsPage.hostMetricsTab.tab).toHaveAttribute('aria-selected', 'true');
      });

      await test.step('verify metrics content is visible', async () => {
        await expect(assetDetailsPage.hostMetricsTab.cpuUsageChart).toBeVisible({
          timeout: EXTENDED_TIMEOUT,
        });
      });
    });

    test('Processes Tab', async ({ pageObjects: { hostsPage, assetDetailsPage } }) => {
      await hostsPage.openHostFlyout(HOST1_NAME);

      await test.step('navigate to processes tab', async () => {
        await assetDetailsPage.processesTab.clickTab();
        await expect(assetDetailsPage.processesTab.tab).toHaveAttribute('aria-selected', 'true');
      });

      await test.step('verify processes content is visible', async () => {
        await expect(assetDetailsPage.processesTab.content).toBeVisible({
          timeout: EXTENDED_TIMEOUT,
        });
      });
    });

    test('Logs Tab', async ({ pageObjects: { hostsPage, assetDetailsPage } }) => {
      await hostsPage.openHostFlyout(HOST1_NAME);

      await test.step('navigate to logs tab', async () => {
        await assetDetailsPage.logsTag.clickTab();
        await expect(assetDetailsPage.logsTag.tab).toHaveAttribute('aria-selected', 'true');
      });

      await test.step('verify logs content is visible', async () => {
        await expect(assetDetailsPage.logsTag.table).toBeVisible({ timeout: EXTENDED_TIMEOUT });
      });
    });

    test('Open as page and return', async ({
      pageObjects: { hostsPage, assetDetailsPage },
      page,
    }) => {
      await hostsPage.openHostFlyout(HOST1_NAME);

      await test.step('click open as page', async () => {
        await assetDetailsPage.openAsPageButton.click();
        const url = new URL(page.url());
        expect(url.pathname).toBe(`/app/metrics/detail/host/${encodeURIComponent(HOST1_NAME)}`);
      });

      await test.step('verify date range is preserved', async () => {
        const datePicker = page.getByTestId('superDatePickerstartDatePopoverButton');
        await expect(datePicker).toBeVisible({ timeout: EXTENDED_TIMEOUT });
        await expect(datePicker).toContainText('Mar 28, 2023');
      });

      await test.step('return to hosts view', async () => {
        await expect(assetDetailsPage.returnButton).toBeVisible({ timeout: EXTENDED_TIMEOUT });
        await assetDetailsPage.returnButton.click();
        await expect(
          page.getByRole('dialog').getByRole('heading', { name: HOST1_NAME })
        ).toBeVisible();
      });
    });

    test('Dashboards Tab', async ({ pageObjects: { hostsPage, assetDetailsPage }, kbnClient }) => {
      await kbnClient.uiSettings.update({ [CUSTOM_DASHBOARDS_SETTING]: true });
      // Re-navigate so the page picks up the enabled setting (the beforeEach
      // navigation happened with the setting still off).
      await hostsPage.goToPage({
        from: DATE_WITH_HOSTS_DATA_FROM,
        to: DATE_WITH_HOSTS_DATA_TO,
        preferredSchema: 'ecs',
      });
      await expect(hostsPage.tableRows).toHaveCount(HOSTS.length);
      await hostsPage.openHostFlyout(HOST1_NAME);

      await test.step('navigate to dashboards tab', async () => {
        await assetDetailsPage.dashboardsTab.clickTab();
        await expect(assetDetailsPage.dashboardsTab.tab).toHaveAttribute('aria-selected', 'true');
      });

      await test.step('verify dashboards splash screen is visible', async () => {
        await expect(assetDetailsPage.dashboardsTab.addDashboardButton).toBeVisible({
          timeout: EXTENDED_TIMEOUT,
        });
      });
    });
  }
);
