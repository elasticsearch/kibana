/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Timeline read-only',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    spaceTest.beforeEach(async ({ browserAuth, apiServices, pageObjects }) => {
      await apiServices.timeline.deleteAll();
      await browserAuth.loginAsT1Analyst();
      await pageObjects.timelinePage.navigateToTimelines();
    });

    spaceTest.afterAll(async ({ apiServices }) => {
      await apiServices.timeline.deleteAll();
    });

    spaceTest(
      'should not be able to create/update timeline with only read privileges',
      async ({ pageObjects }) => {
        const { timelinePage } = pageObjects;

        await timelinePage.open();
        await timelinePage.createNew();

        await expect(timelinePage.panel).toBeVisible();
        await expect(timelinePage.saveButton).toBeDisabled();

        await spaceTest.step('Hover save button and verify read-only tooltip', async () => {
          await timelinePage.hoverSaveButton();
          await expect(timelinePage.saveTooltip).toContainText(
            'you do not have the required permissions to save timelines'
          );
        });
      }
    );
  }
);
