/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, tags } from '../fixtures';

spaceTest.describe('Discover ES|QL editor', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults();
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.goto({ queryMode: 'esql' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest(
    'shows an error callout for a malformed query and clears it',
    async ({ page, pageObjects }) => {
      const { discover } = pageObjects;

      // Submitted directly rather than via writeAndSubmitEsqlQuery: that waits for a
      // successful fetch, which never arrives for a query the parser rejects.
      await discover.codeEditor.setCodeEditorValue('from logstash-* | limit A');
      await discover.submitQuery();
      await expect(page.testSubj.locator('discoverErrorCalloutTitle')).toBeVisible();

      await discover.writeAndSubmitEsqlQuery('from logstash-* | limit 10');
      await expect(page.testSubj.locator('discoverErrorCalloutTitle')).toBeHidden();
    }
  );

  spaceTest(
    'returns focus to the editor when the data source browser is dismissed',
    async ({ page, pageObjects }) => {
      const { discover } = pageObjects;

      await discover.codeEditor.setCodeEditorValue('from logstash-*');

      // The sources badge is a Monaco decoration. Decorations are styled by class name
      // and cannot carry a data-test-subj, so this app-owned class is the stable hook.
      await page.locator('.esqlSourcesBadge').click();
      await expect(page.testSubj.locator('esqlDataSourceBrowser')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.testSubj.locator('esqlDataSourceBrowser')).toBeHidden();

      // Focus must land back on the editor rather than being stranded on the body.
      await expect(page.locator('[data-test-subj="ESQLEditor"] textarea')).toBeFocused();
    }
  );
});
