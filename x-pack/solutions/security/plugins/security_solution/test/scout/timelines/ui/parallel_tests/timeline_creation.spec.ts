/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

const DEFAULT_QUERY = 'host.name: *';

spaceTest.describe(
  'Timeline creation',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    spaceTest.beforeEach(async ({ browserAuth, apiServices, pageObjects }) => {
      await apiServices.timeline.deleteAll();
      await browserAuth.loginAsPlatformEngineer();
      await pageObjects.timelinePage.navigateToTimelines();
    });

    spaceTest.afterAll(async ({ apiServices }) => {
      await apiServices.timeline.deleteAll();
    });

    spaceTest(
      'should create a timeline from a template and have the same query',
      async ({ pageObjects, apiServices }) => {
        const { timelinePage } = pageObjects;

        await apiServices.timeline.createTimelineTemplate({
          title: 'Security Timeline',
          description: 'This is the best timeline',
          query: DEFAULT_QUERY,
        });

        await spaceTest.step('Navigate to templates and select custom tab', async () => {
          await timelinePage.navigateToTemplates();
          await timelinePage.selectCustomTemplates();
        });

        await spaceTest.step('Create timeline from template', async () => {
          await timelinePage.createTimelineFromTemplate('Security Timeline');
        });

        await spaceTest.step('Verify flyout is visible with the template query', async () => {
          await expect(timelinePage.queryInput).toHaveText(DEFAULT_QUERY);
        });
      }
    );

    spaceTest('should be able to create timeline', async ({ pageObjects }) => {
      const { timelinePage } = pageObjects;

      await timelinePage.open();
      await timelinePage.createNew();

      await timelinePage.addNameAndDescription('Security Timeline', 'This is the best timeline');

      await expect(timelinePage.panel).toBeVisible();
    });

    spaceTest('should show the different timeline states', async ({ pageObjects }) => {
      const { timelinePage } = pageObjects;

      await timelinePage.open();

      await spaceTest.step('Verify unsaved state on new timeline', async () => {
        await expect(timelinePage.saveStatus).toHaveText(/^Unsaved/);
      });

      await spaceTest.step('Save timeline', async () => {
        await timelinePage.saveWithName('Test');
        await expect(timelinePage.saveStatus).toBeHidden();
      });

      await spaceTest.step('Modify query and verify unsaved changes state', async () => {
        await timelinePage.executeKQL('agent.name : *');
        await expect(timelinePage.saveStatus).toBeVisible({ timeout: 30_000 });
        await expect(timelinePage.saveStatus).toHaveText(/^Unsaved changes/);
      });
    });

    spaceTest('should save timelines as new', async ({ pageObjects }) => {
      const { timelinePage } = pageObjects;

      await spaceTest.step('Verify no timelines exist initially', async () => {
        await expect(timelinePage.timelinesTable).toContainText(
          '0 Timelines match the search criteria'
        );
      });

      await spaceTest.step('Create and save first timeline', async () => {
        await timelinePage.open();
        await timelinePage.saveWithName('First');
        await expect(timelinePage.saveStatus).toBeHidden();
      });

      await spaceTest.step('Save as new timeline with different name', async () => {
        await timelinePage.saveAsNew('Second');
      });

      await spaceTest.step('Close and verify both timelines appear in list', async () => {
        await timelinePage.close();
        await expect(timelinePage.timelineRows).toHaveCount(2);
        await expect(timelinePage.timelineRows).toContainText(['Second', 'First']);
      });
    });
  }
);
