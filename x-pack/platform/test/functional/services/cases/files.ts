/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../ftr_provider_context';

export function CasesFilesTableServiceProvider({ getService, getPageObject }: FtrProviderContext) {
  const common = getPageObject('common');
  const testSubjects = getService('testSubjects');
  const find = getService('find');
  const browser = getService('browser');

  const assertFileExists = (index: number, totalFiles: number) => {
    if (index > totalFiles - 1) {
      throw new Error('Cannot get file from table. Index is greater than the length of all rows');
    }
  };

  return {
    async addFile(fileInputPath: string) {
      // open the Attach popover and choose the file option
      await testSubjects.click('case-view-attach-button');
      await testSubjects.click('case-view-attach-menu-file');
      await find.byCssSelector('[aria-label="Upload a file"]');

      // upload a file — the upload button only enables once the picker has
      // registered the selected file, so wait for that before clicking
      await common.setFileInputPath(fileInputPath);
      await testSubjects.clickWhenNotDisabled('uploadButton');

      // the modal (and its overlay mask) is removed only after the upload's
      // createAttachments call resolves, so its removal is the true "upload
      // committed" signal and keeps the caller's next click from being intercepted
      await testSubjects.missingOrFail('cases-files-add-modal', { timeout: 120_000 });
    },

    async searchByFileName(fileName: string) {
      const searchField = await testSubjects.find('cases-files-search');

      await searchField.clearValue();

      await searchField.type(fileName);
      await searchField.pressKeys(browser.keys.ENTER);
    },

    async openActionsPopover(index: number = 0) {
      const popoverButtons = await find.allByCssSelector(
        '[data-test-subj*="cases-files-actions-popover-button-"',
        100
      );

      assertFileExists(index, popoverButtons.length);

      await popoverButtons[index].click();

      await testSubjects.existOrFail('contextMenuPanelTitle');
    },

    async deleteFile(index: number = 0) {
      await this.openActionsPopover(index);

      await (await testSubjects.find('cases-files-delete-button', 1000)).click();

      await testSubjects.click('confirmModalConfirmButton');

      // wait for the confirm modal (and its overlay mask) to be removed so the next test's click isn't intercepted
      await testSubjects.missingOrFail('confirmModalConfirmButton');
    },

    async openFilePreview(index: number = 0) {
      const row = await this.getFileByIndex(index);

      await (await row.findByCssSelector('[data-test-subj="cases-files-name-link"]')).click();
    },

    async emptyOrFail() {
      // The files accordion only renders when the case has at least one file
      // (or one file matching the active search), so "no files" now means the
      // accordion is missing rather than the table showing its empty state.
      await testSubjects.missingOrFail('case-view-attachment-accordion-file');
    },

    async getFileByIndex(index: number) {
      const rows = await find.allByCssSelector('[data-test-subj*="cases-files-table-row-"', 100);

      assertFileExists(index, rows.length);

      return rows[index] ?? null;
    },
  };
}
