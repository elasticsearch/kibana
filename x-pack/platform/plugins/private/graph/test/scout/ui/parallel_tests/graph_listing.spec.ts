/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '../fixtures';
import { GRAPH_A, GRAPH_B, WORKSPACE_ATTRS } from '../fixtures/constants';

spaceTest.describe('Graph listing page', { tag: tags.stateful.classic }, () => {
  // Read and search tests share a stable data set created once per worker.
  spaceTest.beforeAll(async ({ kbnClient, scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
    await kbnClient.savedObjects.create({
      type: 'graph-workspace',
      attributes: { ...GRAPH_A, ...WORKSPACE_ATTRS },
      space: scoutSpace.id,
      overwrite: true,
    });
    await kbnClient.savedObjects.create({
      type: 'graph-workspace',
      attributes: { ...GRAPH_B, ...WORKSPACE_ATTRS },
      space: scoutSpace.id,
      overwrite: true,
    });
  });

  spaceTest.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsPrivilegedUser();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('renders the page header and saved graphs', async ({ pageObjects }) => {
    await pageObjects.graphListing.goto();
    await expect(pageObjects.graphListing.contentList.pageHeader).toBeVisible();
    await expect(pageObjects.graphListing.contentList.itemLinks).toHaveCount(2);
  });

  spaceTest('search filters items by title', async ({ pageObjects }) => {
    await pageObjects.graphListing.goto();
    await pageObjects.graphListing.contentList.searchFor(GRAPH_A.title);
    await expect(pageObjects.graphListing.contentList.itemLinks).toHaveCount(1);
    await expect(
      pageObjects.graphListing.contentList.itemLinks.filter({ hasText: GRAPH_A.title })
    ).toHaveCount(1);
  });

  spaceTest(
    'create graph button navigates to the workspace editor',
    async ({ pageObjects, page }) => {
      await pageObjects.graphListing.goto();
      await pageObjects.graphListing.createGraphButton.click();
      await expect(page.locator('[data-test-subj~="graphCurrentGraphBreadcrumb"]')).toBeVisible();
    }
  );
});
