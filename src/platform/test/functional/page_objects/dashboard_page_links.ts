/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import type { LinksLayoutType } from '@kbn/links-plugin/common/types';
import { FtrService } from '../ftr_provider_context';

export class DashboardPageLinks extends FtrService {
  private readonly log = this.ctx.getService('log');
  private readonly retry = this.ctx.getService('retry');
  private readonly browser = this.ctx.getService('browser');
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly comboBox = this.ctx.getService('comboBox');

  /* -----------------------------------------------------------
    Links panel
    ----------------------------------------------------------- */

  public async getAllLinksInPanel() {
    this.log.debug('get all link elements from the panel');
    const listGroup = await this.testSubjects.find('links--component--listGroup');
    return await listGroup.findAllByCssSelector('li');
  }

  public async getNumberOfLinksInPanel() {
    this.log.debug('get the number of links in the panel');
    const links = await this.getAllLinksInPanel();
    return links.length;
  }

  /* -----------------------------------------------------------
    Links flyout
    ----------------------------------------------------------- */

  public async expectPanelEditorFlyoutIsOpen() {
    await this.retry.waitFor(
      'links panel editor flyout to exist',
      async () => await this.testSubjects.exists('links--panelEditor--flyout')
    );
  }

  public async expectLinkEditorFlyoutIsOpen() {
    await this.retry.waitFor(
      'link editor flyout to exist',
      async () => await this.testSubjects.exists('links--linkEditor--flyout')
    );
  }

  public async clickPanelEditorSaveButton() {
    this.log.debug('click links panel editor save button');
    await this.expectPanelEditorFlyoutIsOpen();
    await this.testSubjects.clickWhenNotDisabled('links--panelEditor--saveBtn');
  }

  public async clickLinkEditorCloseButton() {
    this.log.debug('click link editor close button');
    await this.testSubjects.click('links--linkEditor--closeBtn');
    await this.testSubjects.waitForDeleted('links--linkEditor--flyout');
  }

  public async clickPanelEditorCloseButton() {
    this.log.debug('click links panel editor close button');
    await this.testSubjects.click('links--panelEditor--closeBtn');
    await this.testSubjects.waitForDeleted('links--panelEditor--flyout');
  }

  public async clickLinksEditorSaveButton() {
    this.log.debug('click link editor save button');
    await this.testSubjects.clickWhenNotDisabled('links--linkEditor--saveBtn');
    await this.testSubjects.waitForDeleted('links--linkEditor--flyout');
  }

  public async findDraggableLinkByIndex(index: number) {
    this.log.debug(`find the draggable link element at index ${index}`);
    await this.testSubjects.exists('links--panelEditor--flyout');
    const linksFormRow = await this.testSubjects.find('links--panelEditor--linksAreaDroppable');
    return await linksFormRow.findByCssSelector(
      `[data-test-subj="links--panelEditor--draggableLink"]:nth-child(${index})`
    );
  }

  public async addDashboardLink(
    destination: string,
    useFilters: boolean = true,
    useTimeRange: boolean = true,
    openInNewTab: boolean = false,
    linkLabel?: string
  ) {
    this.log.debug(
      `add a dashboard link to "${destination}" ${
        linkLabel ? `with custom label "${linkLabel}"` : ''
      }`
    );

    await this.expectPanelEditorFlyoutIsOpen();
    await this.retry.try(async () => {
      await this.testSubjects.click('links--panelEditor--addLinkBtn');
      await this.expectLinkEditorFlyoutIsOpen();
    });
    const radioOption = await this.testSubjects.find('links--linkEditor--dashboardLink--radioBtn');
    const label = await radioOption.findByCssSelector('label[for="dashboardLink"]');
    await label.click();

    await this.comboBox.set('links--linkEditor--dashboardLink--comboBox', destination);
    if (linkLabel) {
      await this.testSubjects.setValue('links--linkEditor--linkLabel--input', linkLabel);
    }

    await this.testSubjects.setEuiSwitch(
      'dashboardNavigationOptions--useFilters--checkbox',
      useFilters ? 'check' : 'uncheck'
    );
    await this.testSubjects.setEuiSwitch(
      'dashboardNavigationOptions--useTimeRange--checkbox',
      useTimeRange ? 'check' : 'uncheck'
    );
    await this.testSubjects.setEuiSwitch(
      'dashboardNavigationOptions--openInNewTab--checkbox',
      openInNewTab ? 'check' : 'uncheck'
    );

    await this.clickLinksEditorSaveButton();
  }

  public async addExternalLink(
    destination: string,
    openInNewTab: boolean = true,
    encodeUrl: boolean = true,
    linkLabel?: string
  ) {
    this.log.debug(
      `add an external link to "${destination}" ${
        linkLabel ? `with custom label "${linkLabel}"` : ''
      }`
    );
    await this.setExternalUrlInput(destination);
    if (linkLabel) {
      await this.testSubjects.setValue('links--linkEditor--linkLabel--input', linkLabel);
    }
    await this.testSubjects.setEuiSwitch(
      'urlDrilldownOpenInNewTab',
      openInNewTab ? 'check' : 'uncheck'
    );
    await this.testSubjects.setEuiSwitch('urlDrilldownEncodeUrl', encodeUrl ? 'check' : 'uncheck');

    await this.clickLinksEditorSaveButton();
  }

  public async deleteLinkByIndex(index: number) {
    this.log.debug(`delete the link at ${index}`);
    const linkToDelete = await this.findDraggableLinkByIndex(index);
    await this.retry.try(async () => {
      await linkToDelete.moveMouseTo();
      await this.testSubjects.existOrFail(`panelEditorLink--deleteBtn`);
    });
    const deleteButton = await linkToDelete.findByTestSubject(`panelEditorLink--deleteBtn`);
    await deleteButton.click();
  }

  public async editLinkByIndex(index: number) {
    this.log.debug(`edit the link at ${index}`);
    const linkToEdit = await this.findDraggableLinkByIndex(index);
    await this.retry.try(async () => {
      await linkToEdit.moveMouseTo();
      await this.testSubjects.existOrFail(`panelEditorLink--editBtn`);
    });
    const editButton = await linkToEdit.findByTestSubject(`panelEditorLink--editBtn`);
    await editButton.click();
  }

  public async reorderLinks(startIndex: number, steps: number, reverse = false) {
    this.log.debug(
      `move link at position ${startIndex} to ${reverse ? startIndex - steps : startIndex + steps}`
    );
    const linkToMove = await this.findDraggableLinkByIndex(startIndex);
    const draggableButton = await linkToMove.findByTestSubject(`panelEditorLink--dragHandle`);

    await draggableButton.focus();
    await this.browser.pressKeys(this.browser.keys.SPACE);

    for (let i = 0; i < steps; i++) {
      await this.browser.pressKeys(reverse ? this.browser.keys.UP : this.browser.keys.DOWN);
    }
    await this.browser.pressKeys(this.browser.keys.SPACE);
    await this.retry.try(async () => {
      expect(await linkToMove.elementHasClass('euiDraggable--isDragging')).to.be(false);
    });
  }

  public async setLayout(layout: LinksLayoutType) {
    this.log.debug(`set the link panel layout to ${layout}`);
    await this.expectPanelEditorFlyoutIsOpen();
    const testSubj = `links--panelEditor--${layout}LayoutBtn`;
    await this.testSubjects.click(testSubj);
  }

  public async setExternalUrlInput(destination: string) {
    this.log.debug(`set the external URL input to ${destination}`);
    await this.expectPanelEditorFlyoutIsOpen();
    await this.retry.try(async () => {
      await this.testSubjects.click('links--panelEditor--addLinkBtn');
      await this.expectLinkEditorFlyoutIsOpen();
    });
    await this.retry.try(async () => {
      const option = await this.testSubjects.find('links--linkEditor--externalLink--radioBtn');
      const label = await option.findByCssSelector('label[for="externalLink"]');
      await label.click();
      if (!(await this.testSubjects.exists('links--linkEditor--externalLink--input'))) {
        throw new Error('External link input did not render');
      }
    });
    await this.testSubjects.setValue('links--linkEditor--externalLink--input', destination);
  }

  public async toggleSaveByReference(checked: boolean) {
    this.log.debug(`toggle save by reference for link panel to ${checked}`);
    await this.expectPanelEditorFlyoutIsOpen();
    await this.testSubjects.setEuiSwitch(
      'links--panelEditor--saveByReferenceSwitch',
      checked ? 'check' : 'uncheck'
    );
  }
}
