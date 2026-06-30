/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable max-classes-per-file */

import { type ScoutPage, EuiFieldTextWrapper } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

export class AbstractPageObject {
  constructor(public readonly page: ScoutPage) {}
}

export class IndexManagement extends AbstractPageObject {
  async goto() {
    await this.page.gotoApp('management/data/index_management');
  }

  async sectionHeadingText() {
    return await this.page.testSubj.locator('appHeaderTitle').textContent();
  }

  async changeTabs(
    tab:
      | 'indicesTab'
      | 'data_streamsTab'
      | 'templatesTab'
      | 'component_templatesTab'
      | 'enrich_policiesTab'
  ) {
    await this.page.testSubj.locator(tab).click();
  }

  async clickCreateIndexButton() {
    await this.page.testSubj.locator('createIndexButton').click();
  }

  async setCreateIndexName(value: string) {
    await this.page.testSubj.fill('createIndexNameFieldText', value);
  }

  async setCreateIndexMode(value: string) {
    await this.page.testSubj.click('indexModeField');
    await this.page.testSubj.locator(`indexMode${value}Option`).click();
  }

  async clickCreateIndexSaveButton() {
    const saveButton = this.page.testSubj.locator('createIndexSaveButton');
    await saveButton.click();
    // Wait for modal to close using web-first assertion
    await expect(saveButton).toBeHidden({ timeout: 30000 });
  }

  /**
   * Returns locator for index link - caller should use web-first assertions.
   * Note: Consider using extended timeout as this can be slow in CI environments.
   * Example: await expect(pageObjects.indexManagement.indexLink(name)).toBeVisible({ timeout: 30000 });
   */
  indexLink(indexName: string) {
    return this.page.getByRole('button').getByText(indexName);
  }

  async toggleHiddenIndices() {
    await this.page.testSubj.locator('checkboxToggles-includeHiddenIndices').click();
  }

  async openIndexDetailsPage(indexOfRow: number) {
    const indexLinks = this.page.testSubj.locator('indexTableIndexNameLink');
    // this should be refactored to use data-test-subj on the table rows
    // eslint-disable-next-line playwright/no-nth-methods
    await indexLinks.nth(indexOfRow).click();

    // Wait for index details page to load using web-first assertion
    await expect(this.page.testSubj.locator('indexDetailsContent')).toBeVisible();
  }

  async navigateToIndexManagementTab(
    tab: 'indices' | 'data_streams' | 'templates' | 'component_templates' | 'enrich_policies'
  ) {
    await this.goto();
    const tabMap = {
      indices: 'indicesTab',
      data_streams: 'data_streamsTab',
      templates: 'templatesTab',
      component_templates: 'component_templatesTab',
      enrich_policies: 'enrich_policiesTab',
    };
    await this.page.testSubj.locator(tabMap[tab]).click();
  }

  async clickNextButton() {
    await this.page.testSubj.locator('nextButton').click();
  }

  /**
   * Custom combobox interaction for non-clearable comboboxes.
   * Note: Cannot use EuiComboBoxWrapper here because the fieldType combobox
   * has isClearable={false} (in type_parameter.tsx), and EuiComboBoxWrapper.selectSingleOption()
   * attempts to clear() first, which fails when trying to click the non-existent comboBoxClearButton.
   */
  async setComboBox(testSubject: string, value: string) {
    const comboBox = this.page.testSubj.locator(testSubject);
    await comboBox.click();

    // Type the value
    const input = comboBox.locator('input');
    await input.fill(value);

    // Wait for and click the option
    await this.page.locator(`[role="option"]`).filter({ hasText: value }).click();
  }

  async changeMappingsEditorTab(tab: 'fields' | 'advancedOptions' | 'templates') {
    const tabMap = {
      fields: 'fieldsTab',
      advancedOptions: 'advancedOptionsTab',
      templates: 'templatesTab',
    };
    await this.page.testSubj.locator(tabMap[tab]).click();
  }

  indexDetailsPage = {
    expectIndexDetailsPageIsLoaded: async () => {
      await expect(this.page.testSubj.locator('indexDetailsTab-overview')).toBeVisible();
      await expect(this.page.testSubj.locator('indexDetailsContent')).toBeVisible();
      await expect(this.page.testSubj.locator('appHeaderBack')).toBeVisible();
    },
  };

  indexTemplateWizard = {
    completeStepOne: async () => {
      const nameField = new EuiFieldTextWrapper(this.page, { dataTestSubj: 'nameField' });
      await nameField.fill('test-index-template');

      const indexPatternsField = new EuiFieldTextWrapper(this.page, {
        dataTestSubj: 'indexPatternsField',
      });
      await indexPatternsField.fill('test-index-pattern');

      await this.clickNextButton();
    },
  };

  /**
   * Reads the Stack Management sidebar section composition. Uses the stable `data-test-subj`
   * attributes set by `managementSidebarNav` (`item.id` is forwarded as `data-test-subj` on
   * every EuiSideNav item). Returns the visible sections and the link IDs nested within each.
   *
   * Call this after navigating to `/app/management` and waiting for the sidebar to appear.
   */
  async readSidebarSections(): Promise<Array<{ sectionId: string; sectionLinks: string[] }>> {
    // Evaluate in-page to avoid the `nth()` Playwright anti-pattern; reads the full section
    // + link structure in one call to the DOM.
    return this.page.locator('.kbnSolutionNav').evaluate((nav) => {
      const roots = Array.from(nav.querySelectorAll<HTMLElement>('.euiSideNavItem--root'));
      return roots.flatMap((root) => {
        // Section header button carries data-test-subj = section ID
        const sectionId = root
          .querySelector<HTMLElement>(':scope > .euiSideNavItemButton')
          ?.getAttribute('data-test-subj');
        if (!sectionId) return [];
        // Child link anchors carry data-test-subj = app ID
        const sectionLinks = Array.from(
          root.querySelectorAll<HTMLElement>('.euiSideNavItem > a.euiSideNavItemButton')
        )
          .map((a) => a.getAttribute('data-test-subj'))
          .filter((id): id is string => id !== null);
        return [{ sectionId, sectionLinks }];
      });
    });
  }
}
