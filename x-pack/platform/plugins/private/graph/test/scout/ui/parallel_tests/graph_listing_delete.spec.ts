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

spaceTest.describe('Graph listing page - delete flow', { tag: tags.stateful.classic }, () => {
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

  spaceTest(
    'select all and delete removes all graphs and shows empty state',
    async ({ pageObjects }) => {
      await pageObjects.graphListing.goto();
      await expect(pageObjects.graphListing.contentList.itemLinks).toHaveCount(2);
      await pageObjects.graphListing.contentList.selectAllAndDelete();
      await expect(pageObjects.graphListing.emptyPromptCreateButton).toBeVisible();
    }
  );
});
