/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

import { ES_ARCHIVES, KBN_ARCHIVES, test } from '../fixtures';

const toSavedSearchTitleTestSubj = (title: string) =>
  `savedObjectTitle${title.split(' ').join('-')}`;

const openLoadSavedSearchPanel = async (page: ScoutPage) => {
  const openButton = page.testSubj.locator('discoverOpenButton');
  if (await openButton.isVisible()) {
    await openButton.click();
  } else {
    const overflowButton = page.testSubj.locator('app-menu-overflow-button');
    await expect(overflowButton).toBeVisible();
    await overflowButton.click();
    await page.testSubj
      .locator('app-menu-popover')
      .locator('[data-test-subj="discoverOpenButton"]')
      .click();
  }
  await page.testSubj.waitForSelector('loadSearchForm', { state: 'visible' });
};

const selectFilterTags = async (page: ScoutPage, ...tagNames: string[]) => {
  await page.testSubj.locator('loadSearchForm').locator('.euiFilterGroup .euiFilterButton').click();
  for (const tagName of tagNames) {
    await page.testSubj.click(`tag-searchbar-option-${tagName.replace(' ', '_')}`);
  }
  await page.testSubj.click('savedObjectFinderSearchInput');
};

test.describe('Tags - discover integration', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ esArchiver, kbnClient }) => {
    await esArchiver.loadIfNeeded(ES_ARCHIVES.LOGSTASH_FUNCTIONAL);
    await kbnClient.importExport.load(KBN_ARCHIVES.DISCOVER);
  });

  test.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.discover.waitUntilSearchingHasFinished();
  });

  test.afterAll(async ({ kbnClient }) => {
    await kbnClient.importExport.unload(KBN_ARCHIVES.DISCOVER);
    await kbnClient.savedObjects.cleanStandardList();
  });

  test('open search allows manually typing tag filter query', async ({ page }) => {
    await openLoadSavedSearchPanel(page);
    const searchInput = page.testSubj.locator('savedObjectFinderSearchInput');
    await searchInput.fill('tag:(tag-1)');
    await searchInput.press('Enter');

    await expect(page.testSubj.locator('savedObjectFinderTitle')).toHaveCount(1);
    await expect(page.testSubj.locator(toSavedSearchTitleTestSubj('A Saved Search'))).toBeVisible();
  });

  test('open search allows filtering by selecting a tag in the filter menu', async ({ page }) => {
    await openLoadSavedSearchPanel(page);
    await selectFilterTags(page, 'tag-2');

    await expect(page.testSubj.locator('savedObjectFinderTitle')).toHaveCount(2);
    await expect(
      page.testSubj.locator(toSavedSearchTitleTestSubj('A Different Saved Search'))
    ).toBeVisible();
    await expect(page.testSubj.locator(toSavedSearchTitleTestSubj('A Saved Search'))).toBeVisible();
  });

  test('open search allows filtering by selecting multiple tags', async ({ page }) => {
    await openLoadSavedSearchPanel(page);
    await selectFilterTags(page, 'tag-2', 'tag-3');

    await expect(page.testSubj.locator('savedObjectFinderTitle')).toHaveCount(3);
    await expect(
      page.testSubj.locator(toSavedSearchTitleTestSubj('A Different Saved Search'))
    ).toBeVisible();
    await expect(page.testSubj.locator(toSavedSearchTitleTestSubj('A Saved Search'))).toBeVisible();
    await expect(
      page.testSubj.locator(toSavedSearchTitleTestSubj('A Third Saved Search'))
    ).toBeVisible();
  });

  test('creating allows selecting tags for a new saved search', async ({ page, pageObjects }) => {
    await pageObjects.discover.selectDataView('logstash-*');
    await pageObjects.discover.waitUntilSearchingHasFinished();
    await page.testSubj.click('discoverSaveButton');
    await page.testSubj.fill('savedObjectTitle', 'My New Search');
    await page.testSubj.click('savedObjectTagSelector');
    await page.testSubj.click('tagSelectorOption-tag-1');
    await page.testSubj.click('tagSelectorOption-tag-2');
    await page.testSubj.click('savedObjectTitle');
    await page.testSubj.click('confirmSaveSavedObjectButton');
    await page.testSubj.waitForSelector('savedObjectSaveModal', { state: 'hidden' });

    await openLoadSavedSearchPanel(page);
    await selectFilterTags(page, 'tag-1', 'tag-2');
    await expect(page.testSubj.locator('savedObjectFinderTitle')).toHaveCount(3);
    await expect(
      page.testSubj.locator(toSavedSearchTitleTestSubj('A Different Saved Search'))
    ).toBeVisible();
    await expect(page.testSubj.locator(toSavedSearchTitleTestSubj('A Saved Search'))).toBeVisible();
    await expect(page.testSubj.locator(toSavedSearchTitleTestSubj('My New Search'))).toBeVisible();
  });

  test('creating allows creating a tag from the tag selector', async ({ page, pageObjects }) => {
    await pageObjects.discover.selectDataView('logstash-*');
    await pageObjects.discover.waitUntilSearchingHasFinished();
    await page.testSubj.click('discoverSaveButton');
    await page.testSubj.fill('savedObjectTitle', 'search-with-new-tag');
    await expect(page.testSubj.locator('confirmSaveSavedObjectButton')).toBeEnabled();
    await page.testSubj.click('savedObjectTagSelector');
    await page.testSubj.click('tagSelectorOption-action__create');
    await pageObjects.tagManagement.tagModal.fillForm({
      name: 'my-new-tag',
      color: '#FFCC33',
      description: '',
    });
    await page.testSubj.click('createModalConfirmButton');
    await pageObjects.tagManagement.tagModal.form.waitFor({ state: 'hidden' });
    await page.testSubj.click('confirmSaveSavedObjectButton');
    await page.testSubj.waitForSelector('savedObjectSaveModal', { state: 'hidden' });

    await openLoadSavedSearchPanel(page);
    await selectFilterTags(page, 'my-new-tag');
    await expect(page.testSubj.locator('savedObjectFinderTitle')).toHaveCount(1);
    await expect(
      page.testSubj.locator(toSavedSearchTitleTestSubj('search-with-new-tag'))
    ).toBeVisible();
  });

  test('editing allows selecting tags for an existing saved search', async ({
    page,
    pageObjects,
  }) => {
    await pageObjects.discover.loadSavedSearch('A Saved Search');
    await pageObjects.discover.waitUntilSearchingHasFinished();
    await page.testSubj.click('discoverSaveButton');
    await page.testSubj.click('savedObjectTagSelector');
    await page.testSubj.click('tagSelectorOption-tag-3');
    await page.testSubj.click('savedObjectTitle');
    await page.testSubj.click('confirmSaveSavedObjectButton');
    await page.testSubj.waitForSelector('savedObjectSaveModal', { state: 'hidden' });

    await openLoadSavedSearchPanel(page);
    await selectFilterTags(page, 'tag-3');
    await expect(page.testSubj.locator('savedObjectFinderTitle')).toHaveCount(3);
    await expect(
      page.testSubj.locator(toSavedSearchTitleTestSubj('A Different Saved Search'))
    ).toBeVisible();
    await expect(page.testSubj.locator(toSavedSearchTitleTestSubj('A Saved Search'))).toBeVisible();
    await expect(
      page.testSubj.locator(toSavedSearchTitleTestSubj('A Third Saved Search'))
    ).toBeVisible();
  });
});
