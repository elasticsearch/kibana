/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import type { PageObjects } from '@kbn/scout';
import {
  spaceTest,
  TRACES,
  RICH_TRACE,
  PRODUCER_TRACE,
  setupTracesExperience,
  teardownTracesExperience,
} from '../../fixtures/traces_experience';

type DiscoverPage = PageObjects['discover'];

const openOverviewTab = async (
  pageObjects: {
    discover: DiscoverPage;
    tracesExperience: { openOverviewTab: () => Promise<void> };
  },
  esqlWhereClause: string
) => {
  await pageObjects.discover.writeAndSubmitEsqlQuery(
    `${TRACES.ESQL_QUERY} | WHERE ${esqlWhereClause}`
  );
  await pageObjects.tracesExperience.openOverviewTab();
};

spaceTest.describe(
  'Traces in Discover - Overview tab content and actions',
  {
    tag: [...tags.stateful.all, ...tags.serverless.observability.complete],
  },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace, config }) => {
      await setupTracesExperience(scoutSpace, config);
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects, page }) => {
      await browserAuth.loginAsViewer();
      await pageObjects.discover.goto({ queryMode: 'esql' });
      await page.evaluate(() => localStorage.setItem('fullscreenWaterfallTourDismissed', 'true'));
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await teardownTracesExperience(scoutSpace);
    });

    // ── About section ──────────────────────────────────────────────────

    spaceTest(
      'About section - service name link navigates to APM service overview',
      async ({ pageObjects, page }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('filter for span and open overview tab', async () => {
          await openOverviewTab(pageObjects, `span.name == "${RICH_TRACE.INTERNAL_SPAN_NAME}"`);
        });

        await spaceTest.step('click service name link and verify APM service page', async () => {
          await flyout.about.serviceNameLink.click();
          const serviceHeader = page.testSubj.locator('apmMainTemplateHeaderServiceName');
          await expect(serviceHeader).toHaveText(RICH_TRACE.SERVICE_NAME);
          await expect(page.testSubj.locator('overviewTab')).toHaveAttribute(
            'aria-selected',
            'true'
          );
        });
      }
    );

    spaceTest(
      'About section - transaction name link navigates to APM transactions page',
      async ({ pageObjects, page }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('filter for transaction and open overview tab', async () => {
          await openOverviewTab(
            pageObjects,
            `transaction.name == "${RICH_TRACE.TRANSACTION_NAME}"`
          );
        });

        await spaceTest.step('click transaction name link and verify APM page', async () => {
          await flyout.about.transactionNameLink.click();
          const serviceHeader = page.testSubj.locator('apmMainTemplateHeaderServiceName');
          await expect(serviceHeader).toHaveText(RICH_TRACE.SERVICE_NAME);
          await expect(page.testSubj.locator('transactionsTab')).toHaveAttribute(
            'aria-selected',
            'true'
          );
        });
      }
    );

    spaceTest(
      'About section - dependency name link navigates to APM dependency overview',
      async ({ pageObjects, page }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('filter for span with dependency and open overview tab', async () => {
          await openOverviewTab(pageObjects, `span.name == "${RICH_TRACE.DB_SPAN_NAME}"`);
        });

        await spaceTest.step('click dependency name link and verify APM page', async () => {
          await flyout.about.dependencyNameLink.click();
          await page.waitForURL(/\/dependencies\/overview/);
          await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
            'aria-selected',
            'true'
          );
        });
      }
    );

    // ── Similar Spans section ──────────────────────────────────────────

    spaceTest(
      'Similar Spans section - renders chart and Open in Discover returns similar spans',
      async ({ pageObjects }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('filter for span and open overview tab', async () => {
          await openOverviewTab(pageObjects, `span.name == "${RICH_TRACE.INTERNAL_SPAN_NAME}"`);
        });

        await spaceTest.step('verify chart renders without error', async () => {
          await expect(flyout.similarSpans.durationDistributionChart).toBeVisible();
          await expect(flyout.similarSpans.durationDistributionChart).not.toContainText(
            'An error happened when trying to fetch data'
          );
        });

        await spaceTest.step(
          'click Open in Discover and verify new tab returns similar spans',
          async () => {
            await flyout.similarSpans.openInDiscoverButton.click();
            await pageObjects.discover.expectDocTableToContainText(RICH_TRACE.SERVICE_NAME);
            await pageObjects.discover.expectDocTableToContainText(RICH_TRACE.INTERNAL_SPAN_NAME);
          }
        );
      }
    );

    // ── Trace Summary (waterfall) section ──────────────────────────────

    spaceTest(
      'Trace Summary section - waterfall actions and Open in Discover',
      async ({ pageObjects }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('filter for span and open overview tab', async () => {
          await openOverviewTab(pageObjects, `span.name == "${RICH_TRACE.INTERNAL_SPAN_NAME}"`);
        });

        await spaceTest.step(
          'click waterfall preview to open expanded timeline flyout',
          async () => {
            await flyout.traceSummary.clickWaterfallPreview();
            await expect(flyout.waterfallFlyout.container).toBeVisible();
            await flyout.waterfallFlyout.backButton.click();
            await expect(flyout.waterfallFlyout.container).toBeHidden();
          }
        );

        await spaceTest.step(
          'click expand timeline button to open expanded timeline flyout',
          async () => {
            await flyout.traceSummary.fullScreenButton.click();
            await expect(flyout.waterfallFlyout.container).toBeVisible();
            await flyout.waterfallFlyout.backButton.click();
            await expect(flyout.waterfallFlyout.container).toBeHidden();
          }
        );

        await spaceTest.step(
          'click Open in Discover and verify new tab returns trace items',
          async () => {
            await flyout.traceSummary.openInDiscoverButton.click();
            await pageObjects.discover.expectDocTableToContainText(RICH_TRACE.TRANSACTION_NAME);
            await pageObjects.discover.expectDocTableToContainText(RICH_TRACE.SERVICE_NAME);
          }
        );
      }
    );

    spaceTest(
      'Trace Summary section - service badge navigates to the APM service overview',
      async ({ pageObjects, page }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('filter for transaction and open overview tab', async () => {
          await openOverviewTab(
            pageObjects,
            `transaction.name == "${RICH_TRACE.TRANSACTION_NAME}"`
          );
        });

        await spaceTest.step('click service badge in the focused waterfall', async () => {
          const serviceBadge = flyout.traceSummary.getServiceBadge(RICH_TRACE.TRANSACTION_NAME);
          await expect(serviceBadge).toBeVisible();
          await serviceBadge.click();
        });

        await spaceTest.step('verify navigation to the APM service overview', async () => {
          await expect(page).toHaveURL(
            new RegExp(`/app/apm/services/${RICH_TRACE.SERVICE_NAME}/overview`)
          );
        });
      }
    );

    // ── Errors section ─────────────────────────────────────────────────

    spaceTest(
      'Errors section - error link and Open in Discover return expected results',
      async ({ pageObjects, page }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step(
          'filter for transaction with errors and open overview tab',
          async () => {
            await openOverviewTab(
              pageObjects,
              `transaction.name == "${RICH_TRACE.TRANSACTION_NAME}"`
            );
          }
        );

        await spaceTest.step(
          'click error message link and verify new tab returns exactly the target error',
          async () => {
            const errorLink = page.testSubj
              .locator('error-group-link')
              .filter({ hasText: RICH_TRACE.ERRORS.TRANSACTION_DB_ERROR });
            await errorLink.click();
            await pageObjects.discover.expectDocTableToContainText(
              RICH_TRACE.ERRORS.TRANSACTION_DB_ERROR
            );
            await pageObjects.discover.expectDocTableToContainText(RICH_TRACE.TRANSACTION_NAME);
          }
        );

        await spaceTest.step('switch back to original tab', async () => {
          await pageObjects.unifiedTabs.navigateToTabByName('Untitled');
        });

        await spaceTest.step(
          'click Open in Discover and verify new tab returns all transaction errors',
          async () => {
            await flyout.errors.openInDiscoverButton.click();
            await pageObjects.discover.expectDocTableToContainText(
              RICH_TRACE.ERRORS.TRANSACTION_DB_ERROR
            );
            await pageObjects.discover.expectDocTableToContainText(
              RICH_TRACE.ERRORS.TRANSACTION_VALIDATION_ERROR
            );
          }
        );
      }
    );

    // ── Logs section ───────────────────────────────────────────────────

    spaceTest(
      'Logs section - Open in Discover returns correlated logs',
      async ({ pageObjects }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step(
          'filter for transaction with correlated logs and open overview tab',
          async () => {
            await openOverviewTab(
              pageObjects,
              `transaction.name == "${RICH_TRACE.TRANSACTION_NAME}"`
            );
          }
        );

        await spaceTest.step('verify all 3 correlated logs are displayed', async () => {
          await expect(flyout.logs.section).toContainText(RICH_TRACE.LOGS.TRANSACTION_DB_ERROR);
          await expect(flyout.logs.section).toContainText(
            RICH_TRACE.LOGS.TRANSACTION_VALIDATION_ERROR
          );
          await expect(flyout.logs.section).toContainText(RICH_TRACE.LOGS.TRANSACTION_INFO);
        });

        await spaceTest.step(
          'click Open in Discover and verify new tab returns correlated logs',
          async () => {
            await flyout.logs.openInDiscoverButton.click();
            await pageObjects.discover.expectDocTableToContainText(
              RICH_TRACE.LOGS.TRANSACTION_DB_ERROR
            );
            await pageObjects.discover.expectDocTableToContainText(
              RICH_TRACE.LOGS.TRANSACTION_VALIDATION_ERROR
            );
            await pageObjects.discover.expectDocTableToContainText(
              RICH_TRACE.LOGS.TRANSACTION_INFO
            );
          }
        );
      }
    );

    // ── Span Links section ─────────────────────────────────────────────

    spaceTest(
      'Span Links section - links and Open in Discover return expected results',
      async ({ pageObjects }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('filter for span with span links and open overview tab', async () => {
          await openOverviewTab(pageObjects, `span.name == "${RICH_TRACE.INTERNAL_SPAN_NAME}"`);
        });

        await spaceTest.step(
          'click span name link and verify new tab returns the linked span',
          async () => {
            const spanNameLink = flyout.spanLinks.section
              .locator('a')
              .filter({ hasText: PRODUCER_TRACE.KAFKA_SPAN_NAME });
            await spanNameLink.click();
            await pageObjects.discover.expectDocTableToContainText(PRODUCER_TRACE.KAFKA_SPAN_NAME);
            await pageObjects.discover.expectDocTableToContainText(PRODUCER_TRACE.SERVICE_NAME);
          }
        );

        await spaceTest.step('switch back to original tab', async () => {
          await pageObjects.unifiedTabs.navigateToTabByName('Untitled');
        });

        await spaceTest.step(
          'click service name link and verify new tab returns service documents',
          async () => {
            const serviceNameLink = flyout.spanLinks.section
              .locator('a')
              .filter({ hasText: PRODUCER_TRACE.SERVICE_NAME });
            await serviceNameLink.click();
            await pageObjects.discover.expectDocTableToContainText(PRODUCER_TRACE.SERVICE_NAME);
          }
        );

        await spaceTest.step('switch back to original tab', async () => {
          await pageObjects.unifiedTabs.navigateToTabByName('Untitled');
        });

        await spaceTest.step(
          'click trace ID link and verify new tab returns trace documents',
          async () => {
            const traceIdLink = flyout.spanLinks.section.locator(
              '[data-test-subj^="outgoing-traceIdLink-"]'
            );
            await traceIdLink.click();
            await pageObjects.discover.expectDocTableToContainText(PRODUCER_TRACE.KAFKA_SPAN_NAME);
          }
        );

        await spaceTest.step('switch back to original tab', async () => {
          await pageObjects.unifiedTabs.navigateToTabByName('Untitled');
        });

        await spaceTest.step(
          'click Open in Discover and verify new tab returns span link targets',
          async () => {
            await flyout.spanLinks.openInDiscoverButton.click();
            await pageObjects.discover.expectDocTableToContainText(PRODUCER_TRACE.KAFKA_SPAN_NAME);
          }
        );
      }
    );
  }
);
