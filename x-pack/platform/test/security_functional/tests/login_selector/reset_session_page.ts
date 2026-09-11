/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService, getPageObjects, updateBaselines }: FtrProviderContext) {
  const screenshots = getService('screenshots');
  const browser = getService('browser');
  const security = getService('security');
  const PageObjects = getPageObjects(['security', 'common']);

  describe('reset session page', function () {
    const userWithoutPermissions = { username: 'user_without_permissions', password: 'changeme' };

    before(async () => {
      // Settle any leftover redirect from the preceding suite so setScreenshotSize doesn't drive a navigating page.
      await PageObjects.security.forceLogout();

      // We use a really small window to minimize differences across os's and browsers.
      await browser.setScreenshotSize(1000, 500);

      await security.user.create(userWithoutPermissions.username, {
        password: userWithoutPermissions.password,
        roles: [],
      });
    });

    beforeEach(async () => {
      // Logout needs to happen before anything else to avoid flaky behavior
      await PageObjects.security.forceLogout();
    });

    after(async () => {
      // Clean up after ourselves
      await security.user.delete(userWithoutPermissions.username);
      await PageObjects.security.forceLogout();
    });

    it('compare screenshot', async () => {
      await PageObjects.security.loginSelector.login('basic', 'basic1', {
        username: userWithoutPermissions.username,
        password: userWithoutPermissions.password,
        expectedLoginResult: 'error',
      });

      const percentDifference = await screenshots.compareAgainstBaseline(
        'reset_session_page',
        updateBaselines
      );
      expect(percentDifference).to.be.lessThan(0.029);
    });
  });
}
