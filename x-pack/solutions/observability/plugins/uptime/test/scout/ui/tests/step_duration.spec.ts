/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test } from '../fixtures';

const queryParams = {
  dateRangeStart: '2021-11-21T22:06:06.502Z',
  dateRangeEnd: '2021-11-21T22:10:08.203Z',
};

test.describe('StepsDuration', { tag: tags.stateful.classic }, () => {
  test('navigates to monitor details and verifies step duration', async ({
    pageObjects,
    browserAuth,
    page,
  }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.uptimeOverview.goto(queryParams);

    await test.step('navigate to monitor details', async () => {
      await pageObjects.uptimeOverview.clickMonitorByName('test-monitor - inline');
      await expect(page).toHaveURL(/\/app\/uptime\/monitor\/dGVzdC1tb25pdG9yLWlubGluZQ/);
    });

    await test.step('navigate to journey steps', async () => {
      const stepsLocator = pageObjects.uptimeOverview.getJourneyStepRows();
      await expect(stepsLocator).toHaveCount(4);
      // eslint-disable-next-line playwright/no-nth-methods
      await stepsLocator.first().click();
      await expect(page).toHaveURL(
        /\/app\/uptime\/journey\/9f217c22-4b17-11ec-b976-aa665a54da40\/steps/
      );
    });

    await test.step('verify step duration chart', async () => {
      await expect(async () => {
        await pageObjects.monitorDetails.hoverStepDurationButton();
        await expect(page.testSubj.locator('uptimeExploreDataButton')).toBeVisible();
        await expect(page.testSubj.locator('lens-embeddable')).toBeVisible();
      }).toPass({ timeout: 30_000 });
    });
  });
});
