/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// IMPORTANT: This spec MUST run with a privileged user (loginAsPrivilegedUser).
//
// The 3-dot context-menu toggle in fullscreen mode only renders when there is at
// least one overflow (non-quick) action available on the panel. After the action
// reorg, the only remaining popover-only action exposed by the metrics-grid card
// is "Add to case", and that action is gated on the `cases` feature's
// `create`/`update` capabilities. Without those capabilities, "Add to case" is
// filtered out, no overflow actions remain, the 3-dot toggle does not render,
// and every assertion in this spec fails.
//
// In short: privileged login is not a convenience here — it is the only way the
// context menu under test exists at all. Do not "simplify" this to a regular
// user; the spec will silently lose its subject.

import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  testData,
  DEFAULT_TIME_RANGE,
  DEFAULT_CONFIG,
  PAGINATION,
} from '../../fixtures/metrics_experience';

const { PAGE_SIZE } = PAGINATION;

spaceTest.describe(
  'Metrics in Discover - Fullscreen Mode (privileged)',
  {
    tag: testData.METRICS_EXPERIENCE_TAGS,
  },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DATA_VIEW_NAME);
      await scoutSpace.uiSettings.setDefaultTime(DEFAULT_TIME_RANGE);
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsPrivilegedUser();
      await pageObjects.discover.goto({ queryMode: 'esql' });
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest('should interact with metrics in fullscreen mode', async ({ pageObjects }) => {
      await pageObjects.discover.writeAndSubmitEsqlQuery(testData.ESQL_QUERIES.TS);
      const { metricsExperience } = pageObjects;
      await expect(metricsExperience.grid).toBeVisible();

      await spaceTest.step('enter fullscreen mode', async () => {
        await metricsExperience.toggleFullscreen();
        await expect(metricsExperience.fullscreen).toBeVisible();
      });

      await spaceTest.step('interact with pagination in fullscreen', async () => {
        await expect(metricsExperience.pagination.container).toBeVisible();
        await metricsExperience.pagination.nextButton.click();
        await expect(metricsExperience.cards).toHaveCount(PAGE_SIZE);
      });

      await spaceTest.step('search for metrics in fullscreen', async () => {
        await metricsExperience.searchMetric(DEFAULT_CONFIG.metrics[0].name);
        await expect(metricsExperience.getCardByIndex(0)).toBeVisible();
      });

      await spaceTest.step('open context menu in fullscreen', async () => {
        await metricsExperience.clearSearch();
        await expect(metricsExperience.getCardByIndex(0)).toBeVisible();
        await metricsExperience.openCardContextMenu(0);
        await expect(metricsExperience.chartActionsFor(0).addToCase).toBeVisible();
      });

      await spaceTest.step('exit fullscreen mode', async () => {
        await metricsExperience.fullscreenButton.click();
        await expect(metricsExperience.fullscreen).toBeHidden();
      });
    });
  }
);
