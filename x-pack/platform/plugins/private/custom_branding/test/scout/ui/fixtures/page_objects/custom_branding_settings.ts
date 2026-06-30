/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage } from '@kbn/scout';

export class CustomBrandingSettingsPage {
  constructor(private readonly page: ScoutPage) {}

  private async waitForSaveToast() {
    await this.page.testSubj.locator('euiToastHeader__title').waitFor({ state: 'visible' });
  }

  async navigateToGlobalSettings() {
    await this.page.gotoApp('management/kibana/settings');
    await this.page.testSubj.click('settings-tab-global-settings');
    await this.page.testSubj.locator('managementSettingsTitle').waitFor({ state: 'visible' });
  }

  async setPageTitle(title: string) {
    const input = this.page.testSubj.locator(
      'management-settings-editField-xpackCustomBranding:pageTitle'
    );
    await input.clear();
    await input.fill(title);
    await this.page.testSubj.click('settings-save-button');
    await this.waitForSaveToast();
  }

  async setLogo(imagePath: string) {
    const input = this.page.testSubj.locator(
      'management-settings-editField-xpackCustomBranding:logo'
    );
    await input.setInputFiles(imagePath);
    await this.page.testSubj.click('settings-save-button');
    await this.waitForSaveToast();
  }

  async setCustomizedLogo(imagePath: string) {
    const input = this.page.testSubj.locator(
      'management-settings-editField-xpackCustomBranding:customizedLogo'
    );
    await input.setInputFiles(imagePath);
    await this.page.testSubj.click('settings-save-button');
    await this.waitForSaveToast();
  }
}
