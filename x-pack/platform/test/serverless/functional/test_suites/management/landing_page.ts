/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default ({ getPageObjects, getService }: FtrProviderContext) => {
  const testSubjects = getService('testSubjects');
  const pageObjects = getPageObjects(['svlCommonPage', 'common', 'svlManagementPage']);
  const browser = getService('browser');
  const retry = getService('retry');

  describe('Management landing page', function () {
    this.tags('smoke');
    before(async () => {
      await pageObjects.svlCommonPage.loginAsAdmin();
    });

    beforeEach(async () => {
      await pageObjects.common.navigateToApp('management');
    });

    it('renders the page', async () => {
      await retry.waitFor('page to be visible', async () => {
        return await testSubjects.exists('cards-navigation-page');
      });

      const url = await browser.getCurrentUrl();
      expect(url).to.contain(`/management`);
    });

    it('navigates to index management by clicking the card', async () => {
      await testSubjects.click('app-card-index_management');
      await retry.waitFor('Index Management title to be visible', async () => {
        return await testSubjects.exists('indicesList');
      });
    });

    it('navigates to API keys management by clicking the card', async () => {
      await testSubjects.click('app-card-api_keys');
      expect(async () => {
        await pageObjects.common.waitUntilUrlIncludes('/app/management/security/api_keys');
      }).not.to.throwError();
    });
  });
};
