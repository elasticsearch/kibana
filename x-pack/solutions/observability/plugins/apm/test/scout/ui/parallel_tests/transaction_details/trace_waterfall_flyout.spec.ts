/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test, testData } from '../../fixtures';
import type { TransactionDetailsPage } from '../../fixtures/page_objects/transaction_details';

async function openFlyoutActionsMenu(transactionDetailsPage: TransactionDetailsPage) {
  await transactionDetailsPage.traceWaterfallFlyout.open();
  await transactionDetailsPage.traceWaterfallFlyout.openActionsMenu();
}

/**
 * Tests for the TraceWaterfallFlyout, which opens when the user clicks "View full trace"
 * on a transaction that is not the trace root.
 *
 * Test data: a distributed trace with apm-waterfall-rum (root) → apm-waterfall-node (child).
 * Navigating to the apm-waterfall-node transaction enables the "View full trace" button.
 */
test.describe(
  'Trace waterfall flyout',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeEach(async ({ browserAuth, pageObjects: { transactionDetailsPage } }) => {
      await browserAuth.loginAsViewer();
      await transactionDetailsPage.goToTransactionDetails({
        serviceName: testData.SERVICE_WATERFALL_NODE,
        transactionName: testData.WATERFALL_NODE_TRANSACTION_NAME,
        start: testData.START_DATE,
        end: testData.END_DATE,
      });
    });

    test('Full trace flyout renders waterfall and opens child flyouts', async ({
      pageObjects: { transactionDetailsPage },
    }) => {
      const { traceWaterfallFlyout } = transactionDetailsPage;

      await test.step('Opens the flyout when "View full trace" is clicked', async () => {
        await traceWaterfallFlyout.open();
      });

      await test.step('Waterfall shows the root service transaction', async () => {
        await expect(
          traceWaterfallFlyout.waterfall.getByText(testData.WATERFALL_RUM_TRANSACTION_NAME)
        ).toBeVisible();
      });

      await test.step('Waterfall shows the child transaction', async () => {
        await expect(
          traceWaterfallFlyout.waterfall
            .getByTestId('traceItemRowContent')
            .filter({ hasText: testData.WATERFALL_NODE_TRANSACTION_NAME })
            .filter({ hasText: testData.SERVICE_WATERFALL_NODE })
        ).toBeVisible();
      });

      await test.step('Clicking a span row opens the span detail flyout', async () => {
        await traceWaterfallFlyout.clickSpan(testData.WATERFALL_NODE_DB_SPAN_NAME);
        await expect(traceWaterfallFlyout.spanDetailFlyout).toBeVisible();
      });

      await test.step('Expanding an About field cell shows the popover above the nested flyout', async () => {
        const { childDocFlyout } = traceWaterfallFlyout;
        await childDocFlyout.expandFirstValueCell();
        await expect(childDocFlyout.cellPopover).toBeVisible();
        await childDocFlyout.ensureCellPopoverOnTop();
        await childDocFlyout.closeCellPopover();
        await childDocFlyout.close();
      });

      await test.step('Clicking "View error" on a transaction with one error opens the error detail flyout', async () => {
        await traceWaterfallFlyout.clickErrorBadge(testData.WATERFALL_NODE_TRANSACTION_NAME);
        await expect(traceWaterfallFlyout.childDocFlyout.logMessage).toBeVisible();
        await traceWaterfallFlyout.childDocFlyout.close();
      });

      await test.step('Clicking "View errors" on a transaction with multiple errors opens the errors table', async () => {
        await traceWaterfallFlyout.clickErrorBadge(testData.WATERFALL_RUM_TRANSACTION_NAME);
        await expect(traceWaterfallFlyout.childDocFlyout.errors.section).toBeVisible();
      });
    });

    test('"Open in Discover" opens Discover with trace filter and results', async ({
      pageObjects: { transactionDetailsPage, dataGrid, discover },
    }) => {
      await openFlyoutActionsMenu(transactionDetailsPage);
      await transactionDetailsPage.traceWaterfallFlyout.openInDiscoverLink.click();

      await dataGrid.waitForDocTableRendered();

      const query = await discover.getEsqlQueryValue();
      expect(query).toContain('trace.id');
    });

    test('"Open in APM" navigates to the root transaction detail page', async ({
      page,
      pageObjects: { transactionDetailsPage },
    }) => {
      await openFlyoutActionsMenu(transactionDetailsPage);
      await transactionDetailsPage.traceWaterfallFlyout.openInApmLink.click();
      await expect(
        page.getByRole('heading', { name: testData.WATERFALL_RUM_TRANSACTION_NAME })
      ).toBeVisible();
    });
  }
);
