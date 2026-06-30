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
  setupTracesExperience,
  teardownTracesExperience,
} from '../../fixtures/traces_experience';
import type { TracesFlyout } from '../../fixtures/traces_experience/page_objects/flyout';

type DiscoverPage = PageObjects['discover'];

const openDocViewerAndTraceTimeline = async (pageObjects: {
  discover: DiscoverPage;
  tracesExperience: {
    openOverviewTab: () => Promise<void>;
    flyout: TracesFlyout;
  };
}) => {
  await pageObjects.discover.writeAndSubmitEsqlQuery(
    `${TRACES.ESQL_QUERY} | WHERE transaction.name == "${RICH_TRACE.TRANSACTION_NAME}"`
  );
  await pageObjects.tracesExperience.openOverviewTab();
  await pageObjects.tracesExperience.flyout.traceSummary.fullScreenButton.click();
  await expect(pageObjects.tracesExperience.flyout.waterfallFlyout.container).toBeVisible();
};

spaceTest.describe(
  'Traces in Discover - Flyout cascade-close Emotion cache stability',
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
      // Suppress the tour so it does not overlap the waterfall flyout interactions.
      await page.evaluate(() => localStorage.setItem('fullscreenWaterfallTourDismissed', 'true'));
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await teardownTracesExperience(scoutSpace);
    });

    spaceTest(
      'closing the Trace Timeline flyout navigates back to the Document Viewer without corrupting the Emotion style cache',
      async ({ page, pageObjects }) => {
        const { flyout } = pageObjects.tracesExperience;
        const docViewerFlyout = page.testSubj.locator('docViewerFlyout');

        const consoleErrors: string[] = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
          }
        });

        await spaceTest.step('open the Document Viewer and Trace Timeline flyouts', async () => {
          await pageObjects.discover.waitUntilSearchingHasFinished();
          await openDocViewerAndTraceTimeline(pageObjects);
        });

        await spaceTest.step('close the Trace Timeline flyout via the Back button', async () => {
          await flyout.waterfallFlyout.backButton.click();
          await expect(flyout.waterfallFlyout.container).toBeHidden();
          // The Document Viewer remains visible — it was not cascade-closed because
          // both flyouts share the same EUI flyout-manager historyKey.
          await expect(docViewerFlyout).toBeVisible();
        });

        await spaceTest.step(
          're-open the Trace Timeline flyout after navigating back',
          async () => {
            await flyout.traceSummary.fullScreenButton.click();
            await expect(flyout.waterfallFlyout.container).toBeVisible();
          }
        );

        await spaceTest.step(
          'verify no insertBefore errors from stale Emotion cache refs',
          async () => {
            const hasInsertBeforeError = consoleErrors.some((msg) => msg.includes('insertBefore'));
            expect(hasInsertBeforeError).toBe(false);
          }
        );
      }
    );
  }
);
