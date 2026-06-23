/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { spaceTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { KibanaCodeEditorWrapper } from '@kbn/scout';

spaceTest.describe(
  'No data views: try ES|QL from dashboard',
  { tag: tags.deploymentAgnostic },
  () => {
    // The no-data prompt only appears when the active space has no data views,
    // so this suite deliberately does *not* load the shared dashboard kbn archive
    // nor set a default index in `beforeAll`.
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsPrivilegedUser();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'creates a new ES|QL dashboard from the no-data prompt',
      async ({ pageObjects, page }) => {
        await spaceTest.step('shows the no-data prompt on the dashboard listing', async () => {
          await pageObjects.dashboard.goto();
          await expect(page.testSubj.locator('noDataViewsPrompt')).toBeVisible();
        });

        await spaceTest.step('opens a new ES|QL-backed dashboard', async () => {
          await page.testSubj.click('tryESQLLink');
          await pageObjects.dashboard.waitForRenderComplete();
          // The breadcrumb is prefixed with "Editing " when the dashboard is in edit mode,
          // which is the state the "Try ES|QL" flow lands users in.
          await expect(page.testSubj.locator('breadcrumb last')).toContainText('New Dashboard');
          await expect(page.testSubj.locator('lnsVisualizationContainer')).toBeVisible();
        });

        await spaceTest.step('seeds the inline editor with the default ES|QL query', async () => {
          await pageObjects.dashboard.clickPanelAction('embeddablePanelAction-editPanel');
          const codeEditor = new KibanaCodeEditorWrapper(page);
          await expect.poll(() => codeEditor.getCodeEditorValue()).toBe('FROM logs*');
        });
      }
    );
  }
);
