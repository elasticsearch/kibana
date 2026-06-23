/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '../fixtures';
import {
  GROUP_ALPHA,
  GROUP_BETA,
  GROUP_SEARCH,
  GROUP_TAGGED_DELETE,
  SAMPLE_TAG_NAME,
} from '../fixtures/constants';
import { cleanupAnnotationListing, seedAnnotationListing } from '../fixtures/seed_fixtures';

spaceTest.describe('Event Annotation listing page', { tag: tags.stateful.classic }, () => {
  // Read and search tests share a stable data set created once per worker.
  spaceTest.beforeAll(async ({ kbnClient, scoutSpace }) => {
    await seedAnnotationListing({
      kbnClient,
      scoutSpace,
      withTag: true,
      groups: [GROUP_ALPHA, GROUP_BETA, GROUP_SEARCH, { ...GROUP_TAGGED_DELETE, tagged: true }],
    });
  });

  spaceTest.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsPrivilegedUser();
  });

  spaceTest.afterAll(async ({ kbnClient, scoutSpace }) => {
    await cleanupAnnotationListing({ kbnClient, scoutSpace });
  });

  spaceTest('renders the toolbar and saved annotation groups', async ({ pageObjects }) => {
    await pageObjects.annotationListing.goto();
    await expect(pageObjects.annotationListing.contentList.searchBox).toBeVisible();
    await expect(pageObjects.annotationListing.contentList.itemLinks).toHaveCount(4);
  });

  spaceTest('search filters items by title', async ({ pageObjects }) => {
    await pageObjects.annotationListing.goto();
    await pageObjects.annotationListing.contentList.searchFor(GROUP_ALPHA.title);
    await expect(pageObjects.annotationListing.contentList.itemLinks).toHaveCount(1);
    await expect(
      pageObjects.annotationListing.contentList.itemLinks.filter({
        hasText: GROUP_ALPHA.title,
      })
    ).toHaveCount(1);
  });

  spaceTest('search keeps legacy text matching semantics', async ({ pageObjects }) => {
    await pageObjects.annotationListing.goto();

    await pageObjects.annotationListing.contentList.searchFor('search');
    await expect(pageObjects.annotationListing.contentList.itemLinks).toHaveCount(1);

    await pageObjects.annotationListing.contentList.searchFor('for');
    await expect(pageObjects.annotationListing.contentList.itemLinks).toHaveCount(1);

    await pageObjects.annotationListing.contentList.searchFor('fo');
    await expect(pageObjects.annotationListing.contentList.itemLinks).toHaveCount(1);

    await pageObjects.annotationListing.contentList.searchFor('earc');
    await expect(pageObjects.annotationListing.contentList.itemLinks).toHaveCount(0);

    await pageObjects.annotationListing.contentList.searchFor('SEARCH');
    await expect(pageObjects.annotationListing.contentList.itemLinks).toHaveCount(1);

    await pageObjects.annotationListing.contentList.searchFor('search banana');
    await expect(pageObjects.annotationListing.contentList.itemLinks).toHaveCount(0);

    await pageObjects.annotationListing.contentList.searchFor(GROUP_SEARCH.description);
    await expect(pageObjects.annotationListing.contentList.itemLinks).toHaveCount(1);
  });

  spaceTest('tag filter narrows the listing to tagged groups', async ({ pageObjects }) => {
    await pageObjects.annotationListing.goto();
    await pageObjects.annotationListing.selectTag(SAMPLE_TAG_NAME);

    await expect(pageObjects.annotationListing.contentList.itemLinks).toHaveCount(1);
    await expect(
      pageObjects.annotationListing.contentList.itemLinks.filter({
        hasText: GROUP_TAGGED_DELETE.title,
      })
    ).toHaveCount(1);
  });

  spaceTest('shows a no-results message when nothing matches', async ({ pageObjects }) => {
    await pageObjects.annotationListing.goto();
    await pageObjects.annotationListing.contentList.searchFor('definitely-not-a-real-title');
    await expect(pageObjects.annotationListing.contentList.itemLinks).toHaveCount(0);
    await expect(pageObjects.annotationListing.noResultsMessage).toBeVisible();
  });
});
