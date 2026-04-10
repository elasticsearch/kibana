/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-search';
import { expect } from '@kbn/scout-search/ui';
import { test } from '../fixtures';

const BOOK_CATALOG_INDEX = 'book_catalog';
const STEP_TIMEOUT = 30_000;

const ALL_TUTORIAL_SLUGS = [
  'sample-tutorial',
  'basics',
  'semantic-search',
  'esql',
  'time-series',
  'agent-builder',
];

test.describe('Updated Tutorials', { tag: [...tags.stateful.classic] }, () => {
  test.beforeEach(async ({ browserAuth, pageObjects, esClient }) => {
    try {
      await esClient.indices.delete({ index: BOOK_CATALOG_INDEX });
    } catch {
      // Index may not exist yet
    }
    await browserAuth.loginAsAdmin();
    await pageObjects.gettingStarted.goto();
  });

  test.afterEach(async ({ esClient }) => {
    try {
      await esClient.indices.delete({ index: BOOK_CATALOG_INDEX });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('tutorial selector renders all available tutorial cards', async ({ pageObjects }) => {
    const cards = await pageObjects.gettingStarted.getTutorialSelectorCards();
    expect(cards).toHaveLength(ALL_TUTORIAL_SLUGS.length);

    for (const slug of ALL_TUTORIAL_SLUGS) {
      const card = await pageObjects.gettingStarted.getTutorialSelectorCard(slug);
      await expect(card).toBeVisible();
    }
  });

  test('selecting a tutorial opens the runner and back returns to selector', async ({
    pageObjects,
    page,
  }) => {
    await test.step('select sample tutorial and verify runner appears', async () => {
      await pageObjects.gettingStarted.selectTutorial('sample-tutorial');
      const step0 = await pageObjects.gettingStarted.getStepPanel(0);
      await expect(step0).toBeVisible();
    });

    await test.step('verify runner header elements', async () => {
      await expect(page.testSubj.locator('tutorialStepProgress')).toBeVisible();
      await expect(page.testSubj.locator('tutorialReset')).toBeVisible();
      await expect(page.testSubj.locator('tutorialBack')).toBeVisible();
    });

    await test.step('verify step progress shows correct initial count', async () => {
      const progressText = await pageObjects.gettingStarted.getStepProgressText();
      expect(progressText).toContain('Step 1 of 6');
    });

    await test.step('click back and verify selector is shown', async () => {
      await pageObjects.gettingStarted.clickTutorialBackToAll();
      const cards = await pageObjects.gettingStarted.getTutorialSelectorCards();
      expect(cards).toHaveLength(ALL_TUTORIAL_SLUGS.length);
    });
  });

  test('step progress updates as steps are advanced', async ({ pageObjects }) => {
    await test.step('select sample tutorial', async () => {
      await pageObjects.gettingStarted.selectTutorial('sample-tutorial');
    });

    await test.step('verify initial progress', async () => {
      const progressText = await pageObjects.gettingStarted.getStepProgressText();
      expect(progressText).toContain('Step 1 of 6');
    });

    await test.step('execute step 0 and advance', async () => {
      await pageObjects.gettingStarted.clickStepExecute(0);
      await expect(
        (
          await pageObjects.gettingStarted.getStepPanel(0)
        ).locator('[data-test-subj="tutorialStep-0-next"]')
      ).toBeVisible({ timeout: STEP_TIMEOUT });
      await pageObjects.gettingStarted.clickStepNext(0);
    });

    await test.step('verify progress updated to step 2', async () => {
      const progressText = await pageObjects.gettingStarted.getStepProgressText();
      expect(progressText).toContain('Step 2 of 6');
    });
  });

  test('reset returns tutorial to initial state', async ({ pageObjects, page }) => {
    await test.step('select sample tutorial and execute first step', async () => {
      await pageObjects.gettingStarted.selectTutorial('sample-tutorial');
      await pageObjects.gettingStarted.clickStepExecute(0);
      await expect(page.testSubj.locator('tutorialStep-0-next')).toBeVisible({
        timeout: STEP_TIMEOUT,
      });
    });

    await test.step('advance to step 1', async () => {
      await pageObjects.gettingStarted.clickStepNext(0);
      const step1 = await pageObjects.gettingStarted.getStepPanel(1);
      await expect(step1).toBeVisible();
    });

    await test.step('click reset and verify back at step 0 only', async () => {
      await pageObjects.gettingStarted.clickTutorialReset();
      const step0 = await pageObjects.gettingStarted.getStepPanel(0);
      await expect(step0).toBeVisible();
      await expect(page.testSubj.locator('tutorialStep-1')).toBeHidden();
      const progressText = await pageObjects.gettingStarted.getStepProgressText();
      expect(progressText).toContain('Step 1 of 6');
    });
  });

  test('completes sample tutorial with cleanup step', async ({ pageObjects, page }) => {
    await test.step('select the sample tutorial', async () => {
      await pageObjects.gettingStarted.selectTutorial('sample-tutorial');
      const step0 = await pageObjects.gettingStarted.getStepPanel(0);
      await expect(step0).toBeVisible();
    });

    await test.step('execute step 0 - create index', async () => {
      await pageObjects.gettingStarted.clickStepExecute(0);
      await expect(page.testSubj.locator('tutorialStep-0-next')).toBeVisible({
        timeout: STEP_TIMEOUT,
      });
    });

    await test.step('advance to step 1 and ingest documents', async () => {
      await pageObjects.gettingStarted.clickStepNext(0);
      await pageObjects.gettingStarted.clickStepIngest(1);
      await expect(page.testSubj.locator('tutorialStep-1-next')).toBeVisible({
        timeout: STEP_TIMEOUT,
      });
    });

    await test.step('advance to step 2 and execute full-text search', async () => {
      await pageObjects.gettingStarted.clickStepNext(1);
      await pageObjects.gettingStarted.clickStepExecute(2);
      await expect(page.testSubj.locator('tutorialStep-2-next')).toBeVisible({
        timeout: STEP_TIMEOUT,
      });
    });

    await test.step('advance to step 3 and execute filtered search', async () => {
      await pageObjects.gettingStarted.clickStepNext(2);
      await pageObjects.gettingStarted.clickStepExecute(3);
      await expect(page.testSubj.locator('tutorialStep-3-next')).toBeVisible({
        timeout: STEP_TIMEOUT,
      });
    });

    await test.step('advance to step 4 and execute aggregation', async () => {
      await pageObjects.gettingStarted.clickStepNext(3);
      await pageObjects.gettingStarted.clickStepExecute(4);
      await expect(page.testSubj.locator('tutorialStep-4-next')).toBeVisible({
        timeout: STEP_TIMEOUT,
      });
    });

    await test.step('advance past last step to cleanup', async () => {
      await pageObjects.gettingStarted.clickStepNext(4);
      const cleanupPanel = await pageObjects.gettingStarted.getCleanupStepPanel();
      await expect(cleanupPanel).toBeVisible();
      await expect(cleanupPanel).toContainText('Cleanup');
    });

    await test.step('verify step progress shows cleanup step', async () => {
      const progressText = await pageObjects.gettingStarted.getStepProgressText();
      expect(progressText).toContain('Step 6 of 6');
    });

    await test.step('delete cleanup item and verify deleted state', async () => {
      await pageObjects.gettingStarted.clickCleanupItemDelete(0);
      const deletedButton = await pageObjects.gettingStarted.getCleanupItemDeleted(0);
      await expect(deletedButton).toBeVisible({ timeout: STEP_TIMEOUT });
    });

    await test.step('complete cleanup and verify summary', async () => {
      await pageObjects.gettingStarted.clickCleanupComplete();
      const summary = await pageObjects.gettingStarted.getTutorialSummary();
      await expect(summary).toBeVisible();
      await expect(summary).toContainText('Summary');
      await expect(summary).toContainText('Learn more');
    });

    await test.step('navigate back to tutorial selector', async () => {
      await pageObjects.gettingStarted.clickTutorialBackToAll();
      const cards = await pageObjects.gettingStarted.getTutorialSelectorCards();
      expect(cards).toHaveLength(ALL_TUTORIAL_SLUGS.length);
    });
  });
});
