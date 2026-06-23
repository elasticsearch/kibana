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
  DEEP_TRACE,
  setupTracesExperience,
  teardownTracesExperience,
} from '../../fixtures/traces_experience';
import type { TracesFlyout } from '../../fixtures/traces_experience/page_objects/flyout';

type DiscoverPage = PageObjects['discover'];

const openTraceTimeline = async (pageObjects: {
  discover: DiscoverPage;
  tracesExperience: {
    openOverviewTab: (d: DiscoverPage) => Promise<void>;
    flyout: TracesFlyout;
  };
}) => {
  await pageObjects.discover.goto({ queryMode: 'esql' });
  await pageObjects.discover.writeAndSubmitEsqlQuery(
    `${TRACES.ESQL_QUERY} | WHERE transaction.name == "${RICH_TRACE.TRANSACTION_NAME}"`
  );
  await pageObjects.tracesExperience.openOverviewTab(pageObjects.discover);
  const { flyout } = pageObjects.tracesExperience;
  await flyout.traceSummary.fullScreenButton.click();
  await expect(flyout.waterfallFlyout.container).toBeVisible();
  // Dismiss the "Trace insights in Discover" tour step if shown (it has a 500ms render delay
  // and a z-index that overlaps the child flyout, blocking subsequent interactions).
  await flyout.traceSummary.tourOkButton
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => flyout.traceSummary.tourOkButton.click())
    .catch(() => {});
};

spaceTest.describe(
  'Traces in Discover - Waterfall flyout usage',
  {
    tag: [...tags.stateful.all, ...tags.serverless.observability.complete],
  },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace, config }) => {
      await setupTracesExperience(scoutSpace, config);
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await teardownTracesExperience(scoutSpace);
    });

    spaceTest(
      'child flyout loads the correct document data for each waterfall item',
      async ({ browserAuth, pageObjects }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('setup: login and open trace timeline', async () => {
          await browserAuth.loginAsViewer();
          await openTraceTimeline(pageObjects);
        });

        // ── Transaction ─────────────────────────────────────────────────

        await spaceTest.step(
          'Transaction child flyout - click on the transaction row',
          async () => {
            await flyout.waterfallFlyout
              .getWaterfallItem(RICH_TRACE.TRANSACTION_NAME)
              .content.click();
          }
        );

        await spaceTest.step(
          'Transaction child flyout - verify About section with transaction name and no trace summary',
          async () => {
            await expect(flyout.waterfallFlyout.childDocFlyout.aboutSection).toContainText(
              RICH_TRACE.TRANSACTION_NAME
            );
            await expect(flyout.waterfallFlyout.childDocFlyout.traceSummarySection).toBeHidden();
          }
        );

        await spaceTest.step('Transaction child flyout - close', async () => {
          await flyout.waterfallFlyout.childDocFlyout.close();
        });

        // ── Span ────────────────────────────────────────────────────────

        await spaceTest.step('Span child flyout - click on the DB span row', async () => {
          await flyout.waterfallFlyout.getWaterfallItem(RICH_TRACE.DB_SPAN_NAME).content.click();
        });

        await spaceTest.step(
          'Span child flyout - verify About section with span name and no trace summary',
          async () => {
            await expect(flyout.waterfallFlyout.childDocFlyout.aboutSection).toContainText(
              RICH_TRACE.DB_SPAN_NAME
            );
            await expect(flyout.waterfallFlyout.childDocFlyout.traceSummarySection).toBeHidden();
          }
        );

        await spaceTest.step('Span child flyout - close', async () => {
          await flyout.waterfallFlyout.childDocFlyout.close();
        });

        // ── "View error" (single error on DB span) ──────────────────────

        await spaceTest.step(
          'Log child flyout - click "View error" badge on the DB span',
          async () => {
            const { errorBadge } = flyout.waterfallFlyout.getWaterfallItem(RICH_TRACE.DB_SPAN_NAME);
            await errorBadge.click();
          }
        );

        await spaceTest.step(
          'Log child flyout - verify error message and no trace summary',
          async () => {
            await expect(flyout.waterfallFlyout.childDocFlyout.logMessage).toContainText(
              RICH_TRACE.ERRORS.DB_SPAN_TIMEOUT
            );
            await expect(flyout.waterfallFlyout.childDocFlyout.traceSummarySection).toBeHidden();
          }
        );

        await spaceTest.step('Log child flyout - close', async () => {
          await flyout.waterfallFlyout.childDocFlyout.close();
        });

        // ── "View errors" (multiple errors on transaction) ──────────────

        await spaceTest.step(
          'Transaction child flyout (View errors) - click "View 2 errors" badge',
          async () => {
            const { errorBadge } = flyout.waterfallFlyout.getWaterfallItem(
              RICH_TRACE.TRANSACTION_NAME
            );
            await errorBadge.click();
          }
        );

        await spaceTest.step(
          'Transaction child flyout (View errors) - verify About section, both errors, and no trace summary',
          async () => {
            await expect(flyout.waterfallFlyout.childDocFlyout.aboutSection).toContainText(
              RICH_TRACE.TRANSACTION_NAME
            );
            await expect(flyout.waterfallFlyout.childDocFlyout.errors.section).toContainText(
              RICH_TRACE.ERRORS.TRANSACTION_DB_ERROR
            );
            await expect(flyout.waterfallFlyout.childDocFlyout.errors.section).toContainText(
              RICH_TRACE.ERRORS.TRANSACTION_VALIDATION_ERROR
            );
            await expect(flyout.waterfallFlyout.childDocFlyout.traceSummarySection).toBeHidden();
          }
        );

        await spaceTest.step('Transaction child flyout (View errors) - close', async () => {
          await flyout.waterfallFlyout.childDocFlyout.close();
        });

        // ── Internal span ─────────────────────────────────────────────────

        await spaceTest.step(
          'Internal span child flyout - click on the internal span row',
          async () => {
            await flyout.waterfallFlyout
              .getWaterfallItem(RICH_TRACE.INTERNAL_SPAN_NAME)
              .content.click();
          }
        );

        await spaceTest.step(
          'Internal span child flyout - verify About section with span name and no trace summary',
          async () => {
            await expect(flyout.waterfallFlyout.childDocFlyout.aboutSection).toContainText(
              RICH_TRACE.INTERNAL_SPAN_NAME
            );
            await expect(flyout.waterfallFlyout.childDocFlyout.traceSummarySection).toBeHidden();
          }
        );
      }
    );

    spaceTest(
      'Selected span is scrolled into view when opening the full-screen waterfall',
      async ({ browserAuth, pageObjects }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('setup: login and open the scroll target span document', async () => {
          await browserAuth.loginAsViewer();
          await pageObjects.discover.goto({ queryMode: 'esql' });
          await pageObjects.discover.writeAndSubmitEsqlQuery(
            `${TRACES.ESQL_QUERY} | WHERE span.name == "${DEEP_TRACE.SCROLL_TARGET_SPAN_NAME}"`
          );
          await pageObjects.tracesExperience.openOverviewTab(pageObjects.discover);
        });

        await spaceTest.step('Open the full-screen waterfall', async () => {
          await flyout.traceSummary.fullScreenButton.click();
          await expect(flyout.waterfallFlyout.container).toBeVisible();
        });

        await spaceTest.step('Scroll target span is visible in the viewport', async () => {
          await expect(
            flyout.waterfallFlyout.getWaterfallItem(DEEP_TRACE.SCROLL_TARGET_SPAN_NAME).row
          ).toBeInViewport();
        });
      }
    );

    spaceTest(
      'Service badge in full-screen waterfall navigates to the APM service overview',
      async ({ browserAuth, page, pageObjects }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('setup: login and open trace timeline', async () => {
          await browserAuth.loginAsViewer();
          await openTraceTimeline(pageObjects);
        });

        await spaceTest.step('Click the service badge on the transaction row', async () => {
          const { serviceBadge } = flyout.waterfallFlyout.getWaterfallItem(
            RICH_TRACE.TRANSACTION_NAME
          );
          await expect(serviceBadge).toBeVisible();
          await serviceBadge.click();
        });

        await spaceTest.step('Verify navigation to the APM service overview', async () => {
          await expect(page).toHaveURL(
            new RegExp(`/app/apm/services/${RICH_TRACE.SERVICE_NAME}/overview`)
          );
        });
      }
    );

    spaceTest(
      'Open in Discover from child flyout sections navigates to the correct data',
      async ({ browserAuth, pageObjects }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('setup: login and open trace timeline', async () => {
          await browserAuth.loginAsViewer();
          await openTraceTimeline(pageObjects);
        });

        await spaceTest.step(
          'Internal span child flyout - click on the internal span row',
          async () => {
            await flyout.waterfallFlyout
              .getWaterfallItem(RICH_TRACE.INTERNAL_SPAN_NAME)
              .content.click();
          }
        );

        await spaceTest.step(
          'Internal span child flyout - errors Open in Discover shows the span error',
          async () => {
            await flyout.waterfallFlyout.childDocFlyout.errors.openInDiscoverButton.click();
            await pageObjects.discover.expectDocTableToContainText(
              RICH_TRACE.ERRORS.PROCESS_ORDER_FAILURE
            );
          }
        );

        await spaceTest.step(
          'Internal span child flyout - switch back to original tab',
          async () => {
            await pageObjects.unifiedTabs.navigateToTabByName('Untitled');
          }
        );

        await spaceTest.step(
          'Internal span child flyout - logs Open in Discover shows the correlated logs',
          async () => {
            await flyout.waterfallFlyout.childDocFlyout.logs.openInDiscoverButton.click();
            await pageObjects.discover.expectDocTableToContainText(
              RICH_TRACE.LOGS.PROCESS_ORDER_VALIDATING
            );
            await pageObjects.discover.expectDocTableToContainText(
              RICH_TRACE.LOGS.PROCESS_ORDER_INVENTORY
            );
            await pageObjects.discover.expectDocTableToContainText(
              RICH_TRACE.LOGS.PROCESS_ORDER_SUCCESS
            );
          }
        );

        await spaceTest.step(
          'Internal span child flyout - switch back to original tab',
          async () => {
            await pageObjects.unifiedTabs.navigateToTabByName('Untitled');
          }
        );

        await spaceTest.step(
          'Internal span child flyout - span links Open in Discover shows the linked span',
          async () => {
            await flyout.waterfallFlyout.childDocFlyout.spanLinks.openInDiscoverButton.click();
            await pageObjects.discover.expectDocTableToContainText(PRODUCER_TRACE.KAFKA_SPAN_NAME);
          }
        );
      }
    );
  }
);
