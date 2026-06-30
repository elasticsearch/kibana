/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Insights flyout persistence tests.
 *
 * These tests validate that the metrics insights flyout state (open metric and
 * selected tab) is persisted in the Metrics restorable state and survives
 * Discover tab navigation/duplication, and that stale state is cleared when
 * the underlying metric disappears from a populated grid.
 *
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, testData, DEFAULT_TIME_RANGE } from '../../fixtures/metrics_experience';

spaceTest.describe(
  'Metrics in Discover - Insights Flyout Persistence',
  { tag: testData.METRICS_EXPERIENCE_TAGS },
  () => {
    // Force a wide viewport so the metrics insights flyout renders in push mode
    // (>= 1200px). In overlay mode an `euiOverlayMask` traps pointer events on
    // the surrounding UI (Discover tab bar, metrics toolbar) and the
    // persistence flow becomes unreachable. See `PUSH_FLYOUT_VIEWPORT` for
    // details.
    spaceTest.use({ viewport: testData.PUSH_FLYOUT_VIEWPORT });

    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DATA_VIEW_NAME);
      await scoutSpace.uiSettings.setDefaultTime(DEFAULT_TIME_RANGE);
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      const { discover, metricsExperience } = pageObjects;
      await browserAuth.loginAsViewer();
      await discover.goto({ queryMode: 'classic' });
      await discover.writeAndSubmitEsqlQuery(testData.ESQL_QUERIES.TS);
      await expect(metricsExperience.grid).toBeVisible();
      await expect(metricsExperience.getCardByIndex(0)).toBeVisible();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'persists open metric and selected tab across Discover tab navigation',
      async ({ pageObjects, page }) => {
        const { metricsExperience, unifiedTabs } = pageObjects;

        const originalTabTestSubj = await unifiedTabs.getActiveTabTestSubj();

        await spaceTest.step('open flyout and switch to ES|QL Query tab', async () => {
          await metricsExperience.openInsightsFlyout(0);
          await expect(metricsExperience.flyout.container).toBeVisible();

          await metricsExperience.flyout.esqlQuery.tabButton.click();
          await expect(metricsExperience.flyout.esqlQuery.codeBlock).toBeVisible();
        });

        await spaceTest.step('create a new Discover tab', async () => {
          await unifiedTabs.createNewTab();
          // The new tab starts with empty restorable state and only the active
          // tab renders its flyout (`isTabSelected` gate), so nothing should
          // be visible here.
          await expect(metricsExperience.flyout.container).toBeHidden();
        });

        await spaceTest.step(
          'switch back to the original tab and confirm the flyout is restored',
          async () => {
            await unifiedTabs.navigateToTabByTestSubj(originalTabTestSubj);
            await expect(metricsExperience.flyout.container).toBeVisible();
          }
        );

        await spaceTest.step(
          'restored flyout still shows the ES|QL Query tab content',
          async () => {
            await expect(metricsExperience.flyout.esqlQuery.codeBlock).toBeVisible();
            await expect(metricsExperience.flyout.esqlQuery.codeBlock).toContainText(
              testData.METRICS_TEST_INDEX_NAME
            );
          }
        );

        await spaceTest.step('restored push-mode flyout has no a11y violations', async () => {
          const { violations } = await page.checkA11y({
            include: ['[data-test-subj="metricsExperienceFlyoutEsqlQueryTabContent"]'],
          });
          expect(violations).toHaveLength(0);
        });
      }
    );

    spaceTest(
      'duplicating a tab preserves the open metric and selected flyout tab in the new tab',
      async ({ pageObjects }) => {
        const { metricsExperience, unifiedTabs } = pageObjects;

        const originalTabTestSubj = await unifiedTabs.getActiveTabTestSubj();

        await spaceTest.step('open flyout and switch to ES|QL Query tab', async () => {
          await metricsExperience.openInsightsFlyout(0);
          await expect(metricsExperience.flyout.container).toBeVisible();

          await metricsExperience.flyout.esqlQuery.tabButton.click();
          await expect(metricsExperience.flyout.esqlQuery.codeBlock).toBeVisible();
        });

        await spaceTest.step('duplicate the active tab', async () => {
          await unifiedTabs.duplicateActiveTab();
          const newTabTestSubj = await unifiedTabs.getActiveTabTestSubj();
          expect(newTabTestSubj).not.toBe(originalTabTestSubj);
        });

        await spaceTest.step(
          'duplicated tab loads with the same flyout open and ES|QL Query tab selected',
          async () => {
            await expect(metricsExperience.grid).toBeVisible();
            await expect(metricsExperience.flyout.container).toBeVisible();
            await expect(metricsExperience.flyout.esqlQuery.codeBlock).toBeVisible();
            await expect(metricsExperience.flyout.esqlQuery.codeBlock).toContainText(
              testData.METRICS_TEST_INDEX_NAME
            );
          }
        );

        await spaceTest.step(
          'switching back to the original tab still shows its preserved flyout',
          async () => {
            await unifiedTabs.navigateToTabByTestSubj(originalTabTestSubj);
            await expect(metricsExperience.flyout.container).toBeVisible();
            await expect(metricsExperience.flyout.esqlQuery.codeBlock).toBeVisible();
          }
        );
      }
    );

    spaceTest(
      'opening a different metric flyout in the duplicated tab does not affect the original tab',
      async ({ pageObjects }) => {
        const { metricsExperience, unifiedTabs } = pageObjects;

        const originalTabTestSubj = await unifiedTabs.getActiveTabTestSubj();

        await spaceTest.step('open flyout for first metric in original tab', async () => {
          await metricsExperience.openInsightsFlyout(0);
          await expect(metricsExperience.flyout.container).toBeVisible();
        });

        await spaceTest.step('duplicate the tab', async () => {
          await unifiedTabs.duplicateActiveTab();
          await expect(metricsExperience.grid).toBeVisible();
          await expect(metricsExperience.flyout.container).toBeVisible();
        });

        await spaceTest.step(
          'open a different metric flyout in the duplicated (now active) tab',
          async () => {
            await metricsExperience.openInsightsFlyout(1);
            await expect(metricsExperience.flyout.container).toBeVisible();
          }
        );

        await spaceTest.step(
          'returning to the original tab still shows the original metric flyout',
          async () => {
            await unifiedTabs.navigateToTabByTestSubj(originalTabTestSubj);
            await expect(metricsExperience.flyout.container).toBeVisible();
          }
        );
      }
    );

    spaceTest(
      'clears stale flyout state when the underlying metric disappears from a populated grid',
      async ({ pageObjects }) => {
        const { metricsExperience } = pageObjects;

        // The grid contract guarantees every card has an `id="<metric>-0"`
        // attribute (see `grid.navigation.spec.ts`); the `beforeEach` already
        // asserted the first card is visible, so this is non-null.
        const firstCardId = (await metricsExperience.getCardByIndex(0).getAttribute('id'))!;

        await spaceTest.step('open the insights flyout for the first card', async () => {
          await metricsExperience.openInsightsFlyout(0);
          await expect(metricsExperience.flyout.container).toBeVisible();
        });

        await spaceTest.step(
          'search for "gauge" so the open metric drops out while the grid stays populated',
          async () => {
            await metricsExperience.searchMetric('gauge');
            // Wait for the grid to actually rotate to a different first card
            // so the cleanup effect has observed a populated grid that no
            // longer contains the originally open metric.
            await expect(metricsExperience.getCardByIndex(0)).not.toHaveAttribute(
              'id',
              firstCardId
            );
          }
        );

        await spaceTest.step('flyout is no longer rendered', async () => {
          await expect(metricsExperience.flyout.container).toBeHidden();
        });

        await spaceTest.step(
          'clearing the search does not bring the stale flyout back',
          async () => {
            await metricsExperience.clearSearch();
            await expect(metricsExperience.getCardByIndex(0)).toHaveAttribute('id', firstCardId);
            await expect(metricsExperience.flyout.container).toBeHidden();
          }
        );
      }
    );
  }
);
