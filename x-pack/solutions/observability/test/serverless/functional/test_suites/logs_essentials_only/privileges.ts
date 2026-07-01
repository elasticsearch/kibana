/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getPageObject, getPageObjects, getService }: FtrProviderContext) {
  const pageObjects = getPageObjects([
    'common',
    'svlCommonPage',
    'svlManagementPage',
    'security',
    'svlCustomRolesPage',
  ]);
  const testSubjects = getService('testSubjects');
  const browser = getService('browser');
  const find = getService('find');

  describe('privileges', function () {
    this.tags(['failsOnMKI']);

    before(async () => {
      await pageObjects.svlCommonPage.loginAsAdmin();
      await pageObjects.common.navigateToApp('management');
      await pageObjects.svlManagementPage.assertRoleManagementCardExists();
      await pageObjects.svlManagementPage.clickRoleManagementCard();
      const url = await browser.getCurrentUrl();
      expect(url).to.contain('/management/security/roles');
    });

    it('should click create role', async () => {
      await pageObjects.svlCustomRolesPage.assertCreateRoleButtonExists();
      await pageObjects.svlCustomRolesPage.clickCreateRoleButton();
      await pageObjects.svlCustomRolesPage.assertAddKibanaPrivilegesButtonExists();
      await pageObjects.svlCustomRolesPage.clickAddKibanaPrivilegesButton();
      await pageObjects.svlCustomRolesPage.assertSetSpaceDropdownExists();
      await pageObjects.svlCustomRolesPage.setSpaceDropdown('* All Spaces');
      await pageObjects.svlCustomRolesPage.assertFeatureCategoryObservabilityExists();
      await pageObjects.svlCustomRolesPage.toggleObservabilityPrivilegeCategory();
      const container = await find.byCssSelector('#featureCategory_observability');

      const privileges = await testSubjects.findAllDescendant(
        'featurePrivilegeControls',
        container
      );
      const text = await Promise.all(
        privileges.map(async (privilege) => {
          return await privilege.getVisibleText();
        })
      );
      expect(privileges.length).to.be(4);
      expect(text).to.eql([
        'Discover\nAll\nRead\nNone',
        'Dashboard\nAll\nRead\nNone',
        'Logs\nAll\nRead\nNone',
        'Observability Alerts\nAll\nRead\nNone',
      ]);
    });

    it('should not show analytics section', async () => {
      await pageObjects.svlCustomRolesPage.assertFeatureCategoryAnalyticsDoesNotExist();
    });
  });
}
