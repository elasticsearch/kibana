/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags, type Locator, type ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  TRACES,
  RICH_TRACE,
  setupTracesExperience,
  teardownTracesExperience,
  expectTracesExperienceEnabled,
} from '../../fixtures/traces_experience';

// APM chart toolbars re-layout as sparkline data streams in, which can push the
// "Open in Discover" icon out of the actionability window while Playwright is
// retrying a click. Scout's default actionTimeout is 10s; on cloud CI the chart
// can still be settling past that budget. Give these clicks the same 20s head
// room we use for the waterfall render.
const CHART_LINK_CLICK_TIMEOUT = 20000;

// Kibana's redirect URL resolution + cold Discover load can exceed the default
// 10s actionTimeout in CI, so navigation gets its own budget.
const DISCOVER_NAVIGATION_TIMEOUT = 30000;

// Waterfall rendering after navigation + API interception can exceed the default
// 10s expect.timeout on cloud CI.
const WATERFALL_RENDER_TIMEOUT = 20000;

const clickAndWaitForDiscover = (
  page: ScoutPage,
  target: string | Locator,
  clickOptions?: { timeout?: number }
) => {
  const locator = typeof target === 'string' ? page.testSubj.locator(target) : target;
  return Promise.all([
    page.waitForURL('**/app/discover**', { timeout: DISCOVER_NAVIGATION_TIMEOUT }),
    locator.click(clickOptions),
  ]);
};

const APM_TIME_RANGE = {
  rangeFrom: TRACES.DEFAULT_START_TIME,
  rangeTo: TRACES.DEFAULT_END_TIME,
};

spaceTest.describe(
  'Traces in Discover - Explore from APM',
  {
    tag: [...tags.stateful.all, ...tags.serverless.observability.complete],
  },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace, config }) => {
      await setupTracesExperience(scoutSpace, config);
    });

    spaceTest.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsViewer();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await teardownTracesExperience(scoutSpace);
    });

    spaceTest(
      'Service Inventory - "Open in Discover" links open correct experience',
      async ({ page, pageObjects }) => {
        await spaceTest.step('navigate to APM service inventory', async () => {
          await page.gotoApp('apm/services', {
            params: APM_TIME_RANGE,
          });
        });

        await spaceTest.step('"Open traces in Discover" opens traces experience', async () => {
          await pageObjects.tracesExperience.apm.clickManagedTableRowAction(
            RICH_TRACE.SERVICE_NAME,
            'apmManagedTableActionsMenuItem-servicesTable-openTracesInDiscover'
          );
          await expectTracesExperienceEnabled(pageObjects);
          await page.goBack();
        });

        await spaceTest.step('"Open logs in Discover" opens Discover', async () => {
          await pageObjects.tracesExperience.apm.clickManagedTableRowAction(
            RICH_TRACE.SERVICE_NAME,
            'apmManagedTableActionsMenuItem-servicesTable-openLogsInDiscover'
          );
          await pageObjects.dataGrid.waitForDocTableRendered();
          await expect(page.testSubj.locator('discoverDocTable')).toBeVisible();
        });
      }
    );

    spaceTest(
      'Service Overview - "Open in Discover" links open traces experience',
      async ({ page, pageObjects }) => {
        await spaceTest.step('navigate to APM service overview', async () => {
          await page.gotoApp(`apm/services/${RICH_TRACE.SERVICE_NAME}/overview`, {
            params: APM_TIME_RANGE,
          });
        });

        await spaceTest.step('Latency chart opens traces experience', async () => {
          await clickAndWaitForDiscover(page, 'apmLatencyChartOpenInDiscover', {
            timeout: CHART_LINK_CLICK_TIMEOUT,
          });
          await expectTracesExperienceEnabled(pageObjects);
          await pageObjects.tracesExperience.openDocumentFlyout();
          await expect(pageObjects.tracesExperience.flyout.overviewTab).toBeVisible();
          await page.goBack();
        });

        await spaceTest.step('Throughput chart opens traces experience', async () => {
          await clickAndWaitForDiscover(page, 'apmServiceOverviewThroughputChartOpenInDiscover', {
            timeout: CHART_LINK_CLICK_TIMEOUT,
          });
          await expectTracesExperienceEnabled(pageObjects);
          await page.goBack();
        });

        await spaceTest.step('Failed transaction rate chart opens traces experience', async () => {
          await clickAndWaitForDiscover(page, 'apmFailedTransactionRateChartOpenInDiscover', {
            timeout: CHART_LINK_CLICK_TIMEOUT,
          });
          await expectTracesExperienceEnabled(pageObjects);
          await page.goBack();
        });

        await spaceTest.step('Transactions table opens traces experience', async () => {
          await expect(page.testSubj.locator('transactionsGroupTable')).toBeVisible();
          await pageObjects.tracesExperience.apm.clickManagedTableRowAction(
            RICH_TRACE.TRANSACTION_NAME,
            'apmManagedTableActionsMenuItem-transactionsTable-openInDiscover',
            'transactionsGroupTable'
          );
          await expectTracesExperienceEnabled(pageObjects);
        });
      }
    );

    spaceTest(
      'Transactions page - "Open in Discover" links open traces experience',
      async ({ page, pageObjects }) => {
        await spaceTest.step('navigate to APM transactions page', async () => {
          await page.gotoApp(`apm/services/${RICH_TRACE.SERVICE_NAME}/transactions`, {
            params: APM_TIME_RANGE,
          });
        });

        await spaceTest.step('Latency chart opens traces experience', async () => {
          await clickAndWaitForDiscover(page, 'apmLatencyChartOpenInDiscover', {
            timeout: CHART_LINK_CLICK_TIMEOUT,
          });
          await expectTracesExperienceEnabled(pageObjects);
          await page.goBack();
        });

        await spaceTest.step('Throughput chart opens traces experience', async () => {
          await clickAndWaitForDiscover(page, 'apmServiceOverviewThroughputChartOpenInDiscover', {
            timeout: CHART_LINK_CLICK_TIMEOUT,
          });
          await expectTracesExperienceEnabled(pageObjects);
          await page.goBack();
        });

        await spaceTest.step('Failed transaction rate chart opens traces experience', async () => {
          await clickAndWaitForDiscover(page, 'apmFailedTransactionRateChartOpenInDiscover', {
            timeout: CHART_LINK_CLICK_TIMEOUT,
          });
          await expectTracesExperienceEnabled(pageObjects);
          await page.goBack();
        });

        await spaceTest.step('Transactions table opens traces experience', async () => {
          await expect(page.testSubj.locator('transactionsGroupTable')).toBeVisible();
          await pageObjects.tracesExperience.apm.clickManagedTableRowAction(
            RICH_TRACE.TRANSACTION_NAME,
            'apmManagedTableActionsMenuItem-transactionsTable-openInDiscover',
            'transactionsGroupTable'
          );
          await expectTracesExperienceEnabled(pageObjects);
        });
      }
    );

    const transactionDetailParams = {
      ...APM_TIME_RANGE,
      transactionName: RICH_TRACE.TRANSACTION_NAME,
      transactionType: 'request',
    };

    spaceTest(
      'Transaction Detail - Charts open traces experience',
      async ({ page, pageObjects }) => {
        await spaceTest.step('navigate to APM transaction detail', async () => {
          await page.gotoApp(`apm/services/${RICH_TRACE.SERVICE_NAME}/transactions/view`, {
            params: transactionDetailParams,
          });
        });

        await spaceTest.step('Latency chart opens traces experience', async () => {
          await clickAndWaitForDiscover(page, 'apmLatencyChartOpenInDiscover', {
            timeout: CHART_LINK_CLICK_TIMEOUT,
          });
          await expectTracesExperienceEnabled(pageObjects);
          await expect(page.testSubj.locator('discoverDocTable')).toBeVisible();
          await page.goBack();
        });

        await spaceTest.step('Throughput chart opens traces experience', async () => {
          await clickAndWaitForDiscover(page, 'apmServiceOverviewThroughputChartOpenInDiscover', {
            timeout: CHART_LINK_CLICK_TIMEOUT,
          });
          await expectTracesExperienceEnabled(pageObjects);
          await page.goBack();
        });

        await spaceTest.step('Failed transaction rate chart opens traces experience', async () => {
          await clickAndWaitForDiscover(page, 'apmFailedTransactionRateChartOpenInDiscover', {
            timeout: CHART_LINK_CLICK_TIMEOUT,
          });
          await expectTracesExperienceEnabled(pageObjects);
          await page.goBack();
        });
      }
    );

    spaceTest(
      'Transaction Detail - Waterfall and span links open traces experience',
      async ({ page, pageObjects }) => {
        await spaceTest.step('navigate to APM transaction detail', async () => {
          await page.gotoApp(`apm/services/${RICH_TRACE.SERVICE_NAME}/transactions/view`, {
            params: transactionDetailParams,
          });
        });

        await spaceTest.step('"Open in Discover" button opens traces experience', async () => {
          await clickAndWaitForDiscover(page, 'apmWaterfallOpenInDiscoverButton');
          await expectTracesExperienceEnabled(pageObjects);
          await pageObjects.tracesExperience.openDocumentFlyout();
          await expect(pageObjects.tracesExperience.flyout.overviewTab).toBeVisible();
          await page.goBack();
        });

        await spaceTest.step('Span flyout "Open in Discover" opens traces experience', async () => {
          await pageObjects.tracesExperience.apm.clickWaterfallItem(RICH_TRACE.DB_SPAN_NAME);
          await clickAndWaitForDiscover(page, 'spanFlyoutViewSpanInDiscoverLink');
          await expectTracesExperienceEnabled(pageObjects);
          await page.goBack();
          await pageObjects.tracesExperience.apm.dismissFlyout();
        });
      }
    );

    spaceTest(
      'Transaction Detail - Correlations open traces experience',
      async ({ page, pageObjects }) => {
        await spaceTest.step('navigate to APM transaction detail', async () => {
          await page.gotoApp(`apm/services/${RICH_TRACE.SERVICE_NAME}/transactions/view`, {
            params: transactionDetailParams,
          });
        });

        await spaceTest.step('Latency correlations opens traces experience', async () => {
          await page.testSubj.locator('apmLatencyCorrelationsTabButton').click();
          await clickAndWaitForDiscover(page, 'apmLatencyCorrelationsOpenInDiscoverButton');
          await expectTracesExperienceEnabled(pageObjects);
          await expect(page.testSubj.locator('discoverDocTable')).toBeVisible();
          await page.goBack();
        });

        await spaceTest.step(
          'Failed transactions correlations opens traces experience',
          async () => {
            await page.testSubj.locator('apmFailedTransactionsCorrelationsTabButton').click();
            await clickAndWaitForDiscover(page, 'apmFailedCorrelationsViewInDiscoverButton');
            await expectTracesExperienceEnabled(pageObjects);
          }
        );
      }
    );

    spaceTest(
      'Errors page - "Open in Discover" links open traces experience',
      async ({ page, pageObjects }) => {
        await spaceTest.step('navigate to APM errors page', async () => {
          await page.gotoApp(`apm/services/${RICH_TRACE.SERVICE_NAME}/errors`, {
            params: APM_TIME_RANGE,
          });
        });

        await spaceTest.step('Failed transaction rate chart opens traces experience', async () => {
          await clickAndWaitForDiscover(page, 'apmFailedTransactionRateChartOpenInDiscover', {
            timeout: CHART_LINK_CLICK_TIMEOUT,
          });
          await expectTracesExperienceEnabled(pageObjects);
          await page.goBack();
        });

        await spaceTest.step('Error sample "Open in Discover" opens Discover', async () => {
          await pageObjects.tracesExperience.apm.clickDetailLink(
            RICH_TRACE.ERRORS.TRANSACTION_DB_ERROR
          );
          await clickAndWaitForDiscover(page, 'errorGroupDetailsOpenErrorInDiscoverButton');
          await pageObjects.dataGrid.waitForDocTableRendered();
          await expect(page.testSubj.locator('discoverDocTable')).toBeVisible();
        });
      }
    );

    spaceTest(
      'Transaction Detail - Unified waterfall size warning "view in Discover" link opens traces experience',
      async ({ page, pageObjects }) => {
        await spaceTest.step(
          'intercept unified trace API to force exceedsMax condition',
          async () => {
            await page.route('**/internal/apm/unified_traces/**', async (route) => {
              const response = await route.fetch();
              const body = await response.json();
              await route.fulfill({
                response,
                json: { ...body, traceDocsTotal: body.maxTraceItems + 1 },
              });
            });
          }
        );

        await spaceTest.step('navigate to APM transaction detail', async () => {
          await page.gotoApp(`apm/services/${RICH_TRACE.SERVICE_NAME}/transactions/view`, {
            params: transactionDetailParams,
          });
        });

        await spaceTest.step('unified waterfall size warning is visible', async () => {
          await expect(pageObjects.tracesExperience.apm.waterfall.container).toBeVisible({
            timeout: WATERFALL_RENDER_TIMEOUT,
          });
          await expect(pageObjects.tracesExperience.apm.waterfall.sizeWarning).toBeVisible({
            timeout: WATERFALL_RENDER_TIMEOUT,
          });
        });

        await spaceTest.step(
          'warning "view in Discover" link opens traces experience',
          async () => {
            await clickAndWaitForDiscover(
              page,
              pageObjects.tracesExperience.apm.waterfall.sizeWarningDiscoverLink
            );
            await expectTracesExperienceEnabled(pageObjects);
            await page.unrouteAll({ behavior: 'wait' });
          }
        );
      }
    );

    spaceTest(
      'Dependencies - "Open in Discover" from operation detail opens traces experience',
      async ({ page, pageObjects }) => {
        await spaceTest.step('navigate to APM dependencies page', async () => {
          await page.gotoApp('apm/dependencies/operations', {
            params: {
              ...APM_TIME_RANGE,
              dependencyName: 'postgresql',
            },
          });
        });

        await spaceTest.step('open operation detail and click Open in Discover', async () => {
          await pageObjects.tracesExperience.apm.clickDetailLink(RICH_TRACE.DB_SPAN_NAME);
          await clickAndWaitForDiscover(page, 'apmWaterfallOpenInDiscoverButton');
        });

        await spaceTest.step('verify traces experience loaded', async () => {
          await expectTracesExperienceEnabled(pageObjects);
        });
      }
    );
  }
);
