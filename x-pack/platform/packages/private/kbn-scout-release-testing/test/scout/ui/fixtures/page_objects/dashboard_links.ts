/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator } from '@kbn/scout';
import type { ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { EuiComboBoxWrapper } from '@kbn/scout';

type LinksLayoutType = 'horizontal' | 'vertical';

export class DashboardLinks {
  // Panel editor flyout
  private readonly panelEditorFlyout: Locator;
  private readonly panelEditorSaveBtn: Locator;
  private readonly panelEditorCloseBtn: Locator;
  private readonly panelEditorAddLinkBtn: Locator;
  private readonly panelEditorDroppable: Locator;
  private readonly panelEditorSaveByReferenceSwitch: Locator;

  // Link editor flyout
  private readonly linkEditorFlyout: Locator;
  private readonly linkEditorSaveBtn: Locator;
  private readonly linkEditorCloseBtn: Locator;
  private readonly linkEditorLabelInput: Locator;

  // Link types
  private readonly dashboardLinkRadioBtn: Locator;
  private readonly externalLinkRadioBtn: Locator;
  private readonly dashboardLinkComboBox: EuiComboBoxWrapper;
  private readonly externalLinkInput: Locator;

  // Links panel
  private readonly linksListGroup: Locator;

  constructor(private readonly page: ScoutPage) {
    // Panel editor flyout
    this.panelEditorFlyout = this.page.testSubj.locator('links--panelEditor--flyout');
    this.panelEditorSaveBtn = this.page.testSubj.locator('links--panelEditor--saveBtn');
    this.panelEditorCloseBtn = this.page.testSubj.locator('links--panelEditor--closeBtn');
    this.panelEditorAddLinkBtn = this.page.testSubj.locator('links--panelEditor--addLinkBtn');
    this.panelEditorDroppable = this.page.testSubj.locator(
      'links--panelEditor--linksAreaDroppable'
    );
    this.panelEditorSaveByReferenceSwitch = this.page.testSubj.locator(
      'links--panelEditor--saveByReferenceSwitch'
    );

    // Link editor flyout
    this.linkEditorFlyout = this.page.testSubj.locator('links--linkEditor--flyout');
    this.linkEditorSaveBtn = this.page.testSubj.locator('links--linkEditor--saveBtn');
    this.linkEditorCloseBtn = this.page.testSubj.locator('links--linkEditor--closeBtn');
    this.linkEditorLabelInput = this.page.testSubj.locator('links--linkEditor--linkLabel--input');

    // Link types
    this.dashboardLinkRadioBtn = this.page.testSubj.locator(
      'links--linkEditor--dashboardLink--radioBtn'
    );
    this.externalLinkRadioBtn = this.page.testSubj.locator(
      'links--linkEditor--externalLink--radioBtn'
    );
    this.dashboardLinkComboBox = new EuiComboBoxWrapper(
      this.page,
      'links--linkEditor--dashboardLink--comboBox'
    );
    this.externalLinkInput = this.page.testSubj.locator('links--linkEditor--externalLink--input');

    // Links panel
    this.linksListGroup = this.page.testSubj.locator('links--component--listGroup');
  }

  /* -----------------------------------------------------------
     Panel editor flyout
     ----------------------------------------------------------- */

  async expectPanelEditorFlyoutIsOpen() {
    await expect(this.panelEditorFlyout).toBeVisible();
  }

  async clickPanelEditorSaveButton() {
    await this.expectPanelEditorFlyoutIsOpen();
    await expect(this.panelEditorSaveBtn).toBeEnabled();
    await this.panelEditorSaveBtn.click();
  }

  async clickPanelEditorCloseButton() {
    await this.panelEditorCloseBtn.click();
  }

  async setLayout(layout: LinksLayoutType) {
    await this.expectPanelEditorFlyoutIsOpen();
    await this.page.testSubj.click(`links--panelEditor--${layout}LayoutBtn`);
  }

  async toggleSaveByReference(checked: boolean) {
    await this.expectPanelEditorFlyoutIsOpen();
    await this.setEuiSwitch(this.panelEditorSaveByReferenceSwitch, checked);
  }

  /* -----------------------------------------------------------
     Link editor flyout
     ----------------------------------------------------------- */

  async expectLinkEditorFlyoutIsOpen() {
    await expect(this.linkEditorFlyout).toBeVisible();
  }

  async clickLinkEditorSaveButton() {
    await expect(this.linkEditorSaveBtn).toBeEnabled();
    await this.linkEditorSaveBtn.click();
    await expect(this.linkEditorFlyout).toBeHidden();
  }

  async clickLinkEditorCloseButton() {
    await this.linkEditorCloseBtn.click();
    await expect(this.linkEditorFlyout).toBeHidden();
  }

  /* -----------------------------------------------------------
     Links panel
     ----------------------------------------------------------- */

  async getAllLinksInPanel() {
    return this.linksListGroup.locator('li').all();
  }

  async getNumberOfLinksInPanel() {
    return this.linksListGroup.locator('li').count();
  }

  /* -----------------------------------------------------------
     Draggable link helpers
     ----------------------------------------------------------- */

  getDraggableLinkByIndex(index: number) {
    return this.panelEditorDroppable.locator(
      `[data-test-subj="links--panelEditor--draggableLink"]:nth-child(${index})`
    );
  }

  async deleteLinkByIndex(index: number) {
    const link = this.getDraggableLinkByIndex(index);
    await link.hover();
    const deleteBtn = link.locator('[data-test-subj="panelEditorLink--deleteBtn"]');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
  }

  async editLinkByIndex(index: number) {
    const link = this.getDraggableLinkByIndex(index);
    await link.hover();
    const editBtn = link.locator('[data-test-subj="panelEditorLink--editBtn"]');
    await expect(editBtn).toBeVisible();
    await editBtn.click();
  }

  async reorderLinks(linkLabel: string, startIndex: number, steps: number, reverse = false) {
    const link = this.getDraggableLinkByIndex(startIndex);
    const dragHandle = link.locator('[data-test-subj="panelEditorLink--dragHandle"]');
    await expect(dragHandle).toHaveAttribute('data-rfd-drag-handle-draggable-id', linkLabel);

    await dragHandle.focus();
    await this.page.keyboard.press('Space');
    const arrowKey = reverse ? 'ArrowUp' : 'ArrowDown';
    for (let i = 0; i < steps; i++) {
      await this.page.keyboard.press(arrowKey);
    }
    await this.page.keyboard.press('Space');

    // Wait for drag animation to complete
    await expect(link).not.toHaveClass(/euiDraggable--isDragging/);
  }

  /* -----------------------------------------------------------
     Add dashboard link
     ----------------------------------------------------------- */

  async addDashboardLink(
    destination: string,
    options: {
      useFilters?: boolean;
      useTimeRange?: boolean;
      openInNewTab?: boolean;
      linkLabel?: string;
    } = {}
  ) {
    const { useFilters = true, useTimeRange = true, openInNewTab = false, linkLabel } = options;

    await this.expectPanelEditorFlyoutIsOpen();
    await this.panelEditorAddLinkBtn.click();
    await this.expectLinkEditorFlyoutIsOpen();

    // Select dashboard link type
    await this.dashboardLinkRadioBtn.locator('label[for="dashboardLink"]').click();

    // Set destination via combo box
    await this.dashboardLinkComboBox.selectSingleOption(destination);

    if (linkLabel) {
      await this.linkEditorLabelInput.fill(linkLabel);
    }

    await this.setEuiSwitch(
      this.page.testSubj.locator('dashboardNavigationOptions--useFilters--checkbox'),
      useFilters
    );
    await this.setEuiSwitch(
      this.page.testSubj.locator('dashboardNavigationOptions--useTimeRange--checkbox'),
      useTimeRange
    );
    await this.setEuiSwitch(
      this.page.testSubj.locator('dashboardNavigationOptions--openInNewTab--checkbox'),
      openInNewTab
    );

    await this.clickLinkEditorSaveButton();
  }

  /* -----------------------------------------------------------
     Add external link
     ----------------------------------------------------------- */

  async addExternalLink(
    destination: string,
    options: {
      openInNewTab?: boolean;
      encodeUrl?: boolean;
      linkLabel?: string;
    } = {}
  ) {
    const { openInNewTab = true, encodeUrl = true, linkLabel } = options;

    await this.setExternalUrlInput(destination);

    if (linkLabel) {
      await this.linkEditorLabelInput.fill(linkLabel);
    }

    await this.setEuiSwitch(this.page.testSubj.locator('urlDrilldownOpenInNewTab'), openInNewTab);
    await this.setEuiSwitch(this.page.testSubj.locator('urlDrilldownEncodeUrl'), encodeUrl);

    await this.clickLinkEditorSaveButton();
  }

  async setExternalUrlInput(destination: string) {
    await this.expectPanelEditorFlyoutIsOpen();
    await this.panelEditorAddLinkBtn.click();
    await this.expectLinkEditorFlyoutIsOpen();

    // Select external link type
    await this.externalLinkRadioBtn.locator('label[for="externalLink"]').click();

    await this.externalLinkInput.fill(destination);
  }

  /* -----------------------------------------------------------
     Private helpers
     ----------------------------------------------------------- */

  private async setEuiSwitch(switchLocator: Locator, checked: boolean) {
    const isChecked = (await switchLocator.getAttribute('aria-checked')) === 'true';
    if (isChecked !== checked) {
      await switchLocator.click();
    }
  }
}
