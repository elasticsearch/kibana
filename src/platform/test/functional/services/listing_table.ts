/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import {
  CONTENT_LIST_TEST_SUBJECTS,
  getContentListToolbarSubjects,
  getContentListSelectionBarSubjects,
} from '@kbn/content-list-common';
import { FtrService } from '../ftr_provider_context';

type AppName = keyof typeof PREFIX_MAP;
const PREFIX_MAP = {
  visualize: 'vis',
  dashboard: 'dashboard',
  map: 'map',
};

// `@kbn/content-list` subjects, resolved from the framework's single source of
// truth so this service can't drift from what the components render — see the
// class JSDoc.
const TOOLBAR_SUBJECTS = getContentListToolbarSubjects();
const CONTENT_LIST_TABLE = CONTENT_LIST_TEST_SUBJECTS.table;
const CONTENT_LIST_TABLE_SKELETON = CONTENT_LIST_TEST_SUBJECTS.tableSkeleton;
const CONTENT_LIST_ITEM_LINK = CONTENT_LIST_TEST_SUBJECTS.itemLink;
const CONTENT_LIST_SEARCH_BOX = TOOLBAR_SUBJECTS.searchBox;
const CONTENT_LIST_TAGS_FILTER_BUTTON = CONTENT_LIST_TEST_SUBJECTS.tagsFilter;
const CONTENT_LIST_SELECTION_BAR_DELETE = getContentListSelectionBarSubjects(
  TOOLBAR_SUBJECTS.selectionBar
).deleteButton;

const itemLinkSelector = (appName: AppName) =>
  `[data-test-subj^="${PREFIX_MAP[appName]}ListingTitleLink-"], [data-test-subj="${CONTENT_LIST_ITEM_LINK}"]`;

/**
 * Drives a listing page rendered by *either* the legacy `TableListView` or the
 * `@kbn/content-list` framework.
 *
 * A `TableListView` -> Content List migration in one plugin can break suites in
 * other plugins that navigate to the migrated listing at run time (selective
 * testing won't schedule them — see
 * {@link https://github.com/elastic/kibana/pull/270044}). The listing-load,
 * search, tag-filter, item-link and bulk-delete affordances below resolve both
 * subject families so those consumers survive the migration. Helpers tied to
 * legacy `TableListView` DOM (inspect flyout, per-row checkbox selection,
 * pagination) remain legacy-only; migrate them when their listing moves.
 */
export class ListingTableService extends FtrService {
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly find = this.ctx.getService('find');
  private readonly log = this.ctx.getService('log');
  private readonly retry = this.ctx.getService('retry');
  private readonly common = this.ctx.getPageObject('common');
  private readonly flyout = this.ctx.getService('flyout');

  private readonly tagPopoverToggle = this.ctx.getService('menuToggle').create({
    name: 'Tag Popover',
    menuTestSubject: 'tagSelectableList',
    toggleButtonTestSubject: 'tagFilterPopoverButton',
  });

  private readonly userPopoverToggle = this.ctx.getService('menuToggle').create({
    name: 'User Popover',
    menuTestSubject: 'userSelectableList',
    toggleButtonTestSubject: 'userFilterPopoverButton',
  });

  private async getSearchFilter() {
    if (await this.testSubjects.exists('tableListSearchBox', { timeout: 1000 })) {
      return this.testSubjects.find('tableListSearchBox');
    }
    return this.testSubjects.find(CONTENT_LIST_SEARCH_BOX);
  }

  /**
   * Returns search input value on landing page
   */
  public async getSearchFilterValue() {
    const searchFilter = await this.getSearchFilter();
    return await searchFilter.getAttribute('value');
  }

  /**
   * Set search input value on landing page
   */
  public async setSearchFilterValue(value: string) {
    const searchFilter = await this.getSearchFilter();
    await searchFilter.type(value);
  }

  /**
   * Clears search input on landing page
   */
  public async clearSearchFilter() {
    await this.testSubjects.click('clearSearchButton');
  }

  private async getAllItemsNamesOnCurrentPage(): Promise<string[]> {
    const visualizationNames = [];
    const links = await this.find.allByCssSelector('.euiTableRow .euiLink');
    for (let i = 0; i < links.length; i++) {
      visualizationNames.push(await links[i].getVisibleText());
    }
    this.log.debug(`Found ${visualizationNames.length} visualizations on current page`);
    return visualizationNames;
  }

  private async getAllSelectableItemsNamesOnCurrentPage(): Promise<string[]> {
    const visualizationNames = [];
    const rows = await this.find.allByCssSelector('.euiTableRow-isSelectable');
    for (let i = 0; i < rows.length; i++) {
      const link = await rows[i].findByCssSelector('.euiLink');
      visualizationNames.push(await link.getVisibleText());
    }
    this.log.debug(`Found ${visualizationNames.length} selectable visualizations on current page`);
    return visualizationNames;
  }

  public async waitUntilTableIsLoaded() {
    await this.retry.try(async () => {
      if (await this.testSubjects.exists('listingTable-isLoaded', { timeout: 1000 })) {
        return true;
      }
      // Content List keeps its table mounted behind a loading skeleton.
      if (await this.testSubjects.exists(CONTENT_LIST_TABLE, { timeout: 1000 })) {
        if (!(await this.testSubjects.exists(CONTENT_LIST_TABLE_SKELETON, { timeout: 1000 }))) {
          return true;
        }
      }
      throw new Error('Waiting');
    });
  }

  public async loadNextPageIfAvailable() {
    const morePages = !(
      (await this.testSubjects.getAttribute('pagination-button-next', 'disabled')) === 'true'
    );
    if (morePages) {
      await this.testSubjects.click('pagerNextButton');
      await this.waitUntilTableIsLoaded();
    }

    return morePages;
  }

  /**
   * Navigates through all pages on Landing page and returns array of items names that are selectable
   * Added for visualize_integration saved object tagging tests
   */
  public async getAllSelectableItemsNames(): Promise<string[]> {
    this.log.debug('ListingTable.getAllItemsNames');
    let morePages = true;
    let visualizationNames: string[] = [];
    while (morePages) {
      visualizationNames = visualizationNames.concat(
        await this.getAllSelectableItemsNamesOnCurrentPage()
      );
      morePages = await this.loadNextPageIfAvailable();
    }
    return visualizationNames;
  }

  /**
   * Select tags in the searchbar's tag filter.
   */
  public async selectFilterTags(...tagNames: string[]): Promise<void> {
    await this.openTagPopover();
    // select the tags
    for (const tagName of tagNames) {
      await this.testSubjects.click(`tag-searchbar-option-${tagName.replace(' ', '_')}`);
    }
    await this.closeTagPopover();
    await this.waitUntilTableIsLoaded();
  }

  public async openTagPopover(): Promise<void> {
    this.log.debug('ListingTable.openTagPopover');
    if (await this.testSubjects.exists('tagFilterPopoverButton', { timeout: 1000 })) {
      await this.tagPopoverToggle.open();
      return;
    }
    await this.testSubjects.click(CONTENT_LIST_TAGS_FILTER_BUTTON);
  }

  public async closeTagPopover(): Promise<void> {
    this.log.debug('ListingTable.closeTagPopover');
    if (await this.testSubjects.exists('tagFilterPopoverButton', { timeout: 1000 })) {
      await this.tagPopoverToggle.close();
      return;
    }
    // Content List's filter is a toggle button; clicking it again dismisses it.
    await this.testSubjects.click(CONTENT_LIST_TAGS_FILTER_BUTTON);
  }

  /**
   * Select users in the searchbar's user filter.
   */
  public async selectUsers(...userNames: string[]): Promise<void> {
    await this.openUsersPopover();
    // select users
    for (const userName of userNames) {
      await this.testSubjects.click(`userProfileSelectableOption-${userName}`);
    }
    await this.closeUsersPopover();
    await this.waitUntilTableIsLoaded();
  }

  public async openUsersPopover(): Promise<void> {
    this.log.debug('ListingTable.openUsersPopover');
    await this.userPopoverToggle.open();
  }

  public async closeUsersPopover(): Promise<void> {
    this.log.debug('ListingTable.closeUsersPopover');
    await this.userPopoverToggle.close();
  }

  /**
   * Navigates through all pages on Landing page and returns array of items names
   */
  public async getAllItemsNames(): Promise<string[]> {
    this.log.debug('ListingTable.getAllItemsNames');
    let morePages = true;
    let visualizationNames: string[] = [];
    while (morePages) {
      visualizationNames = visualizationNames.concat(await this.getAllItemsNamesOnCurrentPage());
      morePages = await this.loadNextPageIfAvailable();
    }
    return visualizationNames;
  }

  public async clickActionButton(actionSelector: string, index: number = 0) {
    const buttons = await this.testSubjects.findAll(actionSelector);
    await buttons[index].click();
  }

  /**
   * Open the inspect flyout
   */
  public async inspectVisualization(index: number = 0) {
    await this.clickActionButton('inspect-action', index);
  }

  public async inspectorFieldsReadonly() {
    const disabledValues = await Promise.all([
      this.testSubjects.getAttribute('nameInput', 'readonly'),
      this.testSubjects.getAttribute('descriptionInput', 'readonly'),
    ]);

    return disabledValues.every((value) => value === 'true');
  }

  public async closeInspector() {
    await this.flyout.closeFlyout();
  }

  /**
   * Edit Visualization title and description in the flyout
   */
  public async editVisualizationDetails(
    { title, description }: { title?: string; description?: string } = {},
    shouldSave: boolean = true
  ) {
    if (title) {
      await this.testSubjects.setValue('nameInput', title);
    }
    if (description) {
      await this.testSubjects.setValue('descriptionInput', description);
    }
    if (shouldSave) {
      await this.retry.try(async () => {
        await this.testSubjects.click('saveButton');
        await this.testSubjects.missingOrFail('flyoutTitle');
      });
    }
  }

  /**
   * Returns items count on landing page
   */
  public async expectItemsCount(appName: AppName, count: number, findTimeout?: number) {
    await this.retry.try(async () => {
      const elements = await this.find.allByCssSelector(
        itemLinkSelector(appName),
        findTimeout ?? 10000
      );
      expect(elements.length).to.equal(count);
    });
  }

  /**
   * Types name into search field on Landing page and waits till search completed
   * @param name item name
   */
  public async searchForItemWithName(name: string, { escape = true }: { escape?: boolean } = {}) {
    this.log.debug(`searchForItemWithName: ${name}`);

    await this.retry.try(async () => {
      const searchFilter = await this.getSearchFilter();
      await searchFilter.clearValue();
      await searchFilter.click();

      if (escape) {
        name = name
          // Note: this replacement of - to space is to preserve original logic but I'm not sure why or if it's needed.
          .replace('-', ' ')
          // Remove `[*]` from search as it is not supported by EUI Query's syntax.
          .replace(/ *\[[^)]*\] */g, '');
      }

      await searchFilter.type(name);
      await this.common.pressEnterKey();
      const filterValue = await this.getSearchFilterValue();
      if (filterValue !== name) {
        throw new Error(`the input value has not updated properly`);
      }
    });

    await this.waitUntilTableIsLoaded();
  }

  /**
   * Searches for item on Landing page and returns the count of rows whose title
   * matches `name` exactly. Counting must stay name-specific: a search can leave
   * sibling rows visible (e.g. `Foo` and `Foo (1)`), so a broad listing-link
   * selector would over-count.
   */
  public async searchAndExpectItemsCount(appName: AppName, name: string, count: number) {
    await this.searchForItemWithName(name);
    await this.retry.try(async () => {
      let matches: number;
      if (await this.testSubjects.exists(CONTENT_LIST_TABLE, { timeout: 1000 })) {
        // Content List item links carry no per-item subject; match on exact text.
        const links = await this.testSubjects.findAll(CONTENT_LIST_ITEM_LINK);
        const texts = await Promise.all(links.map((link) => link.getVisibleText()));
        matches = texts.filter((text) => text.trim() === name).length;
      } else {
        const links = await this.testSubjects.findAll(
          `${PREFIX_MAP[appName]}ListingTitleLink-${name.replace(/ /g, '-')}`
        );
        matches = links.length;
      }
      expect(matches).to.equal(count);
    });
  }

  public async clickDeleteSelected() {
    if (await this.testSubjects.exists('deleteSelectedItems', { timeout: 1000 })) {
      await this.testSubjects.click('deleteSelectedItems');
      return;
    }
    await this.testSubjects.click(CONTENT_LIST_SELECTION_BAR_DELETE);
  }

  public async selectFirstItemInList() {
    await this.find.clickByCssSelector('.euiTableCellContent .euiCheckbox__input');
  }

  public async clickItemCheckbox(id: string) {
    await this.testSubjects.click(`checkboxSelectRow-${id}`);
  }

  /**
   * Searches for item by name, selects checbox and deletes it
   * @param name item name
   * @param id row id
   */
  public async deleteItem(name: string, id?: string) {
    await this.searchForItemWithName(name);
    if (id) {
      await this.clickItemCheckbox(id);
    } else {
      await this.selectFirstItemInList();
    }
    await this.clickDeleteSelected();
    await this.common.clickConfirmOnModal();
  }

  /**
   * Clicks item on Landing page by link name if it is present
   */
  public async clickItemLink(appName: AppName, name: string) {
    const legacySubj = `${PREFIX_MAP[appName]}ListingTitleLink-${name.split(' ').join('-')}`;
    if (await this.testSubjects.exists(legacySubj, { timeout: 1000 })) {
      await this.testSubjects.click(legacySubj);
      return;
    }
    // Content List item links carry no per-item subject; match on exact text.
    const links = await this.testSubjects.findAll(CONTENT_LIST_ITEM_LINK);
    for (const link of links) {
      if ((await link.getVisibleText()).trim() === name) {
        await link.click();
        return;
      }
    }
    throw new Error(`No listing row found with name "${name}".`);
  }

  /**
   * Checks 'SelectAll' checkbox on
   */
  public async checkListingSelectAllCheckbox() {
    const element = await this.testSubjects.find('checkboxSelectAll');
    const isSelected = await element.isSelected();
    if (!isSelected) {
      this.log.debug(`checking checkbox "checkboxSelectAll"`);
      await this.testSubjects.click('checkboxSelectAll');
    }
  }

  /**
   * Clicks NewItem button on Landing page
   */
  public async clickNewButton(): Promise<void> {
    await this.testSubjects.click('newItemButton');
  }

  public async isShowingEmptyPromptCreateNewButton(): Promise<void> {
    await this.testSubjects.existOrFail('newItemButton');
  }

  public async selectTab(which: number) {
    await this.find.clickByCssSelector(`.euiTab:nth-child(${which})`);
  }
}
