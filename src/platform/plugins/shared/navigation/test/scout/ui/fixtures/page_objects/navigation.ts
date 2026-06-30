/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '@kbn/scout';

export class Navigation {
  constructor(private readonly page: ScoutPage) {}

  async goToSecurity() {
    await this.page.gotoApp('security');
    await this.page.testSubj
      .locator('kbnChromeLayoutNavigation')
      .waitFor({ state: 'visible', timeout: 30_000 });
  }

  async clickLogo() {
    await this.page.testSubj.locator('nav-header-logo').waitFor({ state: 'visible' });
    await this.page.testSubj.click('nav-header-logo');
  }

  getSidenav() {
    return this.page.testSubj.locator('kbnChromeLayoutNavigation');
  }

  getBreadcrumbByText(text: string) {
    return this.page.locator('.euiBreadcrumb', { hasText: text });
  }

  async openUserMenu() {
    await this.page.testSubj.click('userMenuButton');
    await this.page.testSubj.locator('userMenu').waitFor({ state: 'visible' });
  }

  getCustomizeNavLink() {
    return this.page.testSubj.locator('customizeNavigationUserMenuLink');
  }

  private getCustomizeNavModal() {
    return this.page.testSubj.locator('customizeNavigationModal');
  }

  async openCustomizeNavModal() {
    await this.openUserMenu();
    await this.page.testSubj.click('customizeNavigationUserMenuLink');
    await this.getCustomizeNavModal().waitFor({ state: 'visible' });
  }

  async toggleItemVisibility(id: string) {
    await this.page.testSubj.click(`customizeNavigationItemToggle-${id}`);
  }

  async applyCustomization() {
    // Set up the response waiter before clicking so we don't miss the request.
    // We don't assert on status: the PUT can succeed (200) or fail (e.g. a
    // read-only user lacks user-storage write access), and callers assert the
    // resulting UI state (persisted nav, or an error toast) afterwards.
    const saved = this.page.waitForResponse(
      (resp) => resp.url().includes('/internal/user_storage/') && resp.request().method() === 'PUT'
    );
    await this.page.testSubj.click('customizeNavigationSaveButton');
    await saved;
    await this.getCustomizeNavModal().waitFor({ state: 'hidden' });
  }
}
