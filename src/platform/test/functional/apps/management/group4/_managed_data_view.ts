/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const testSubjects = getService('testSubjects');
  const flyout = getService('flyout');
  const PageObjects = getPageObjects(['settings', 'common', 'header']);

  // Stable UUID from src/platform/test/functional/fixtures/kbn_archiver/managed_data_view.json
  const MANAGED_DV_ID = '5f863f70-4728-4e8d-b441-db08f8c33b28';

  describe('managed data view', function describeIndexTests() {
    before(async function () {
      await esArchiver.load('x-pack/platform/test/fixtures/es_archives/logstash_functional');
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/managed_data_view'
      );
      await kibanaServer.uiSettings.replace({});
    });

    after(async function () {
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/logstash_functional');
      await kibanaServer.importExport.unload(
        'src/platform/test/functional/fixtures/kbn_archiver/managed_data_view'
      );
    });

    describe('when viewing a managed data view', function () {
      it('can see managed badge in data view page', async function () {
        await PageObjects.settings.navigateToDataViewById(MANAGED_DV_ID);

        const patternName = await PageObjects.settings.getIndexPageHeading();
        expect(patternName).to.be('logstash-*');

        const managedBadge = await PageObjects.settings.getManagedTag();
        expect(managedBadge).to.be('Managed');
      });

      it('data view editor is disabled', async function () {
        await PageObjects.settings.navigateToDataViewById(MANAGED_DV_ID);
        await PageObjects.settings.clickEditIndexButton();

        await PageObjects.settings.expectDisabledDataViewEditor();
        await flyout.closeFlyout();
      });

      it('field editor is disabled', async function () {
        await PageObjects.settings.navigateToDataViewById(MANAGED_DV_ID);
        await PageObjects.settings.clickAddField();

        await PageObjects.settings.expectDisabledFieldEditor();
        await flyout.closeFlyout();
      });

      it('delete option is not available on the detail page', async function () {
        await PageObjects.settings.navigateToDataViewById(MANAGED_DV_ID);
        await testSubjects.missingOrFail('moreActionsButton');
        await testSubjects.missingOrFail('deleteIndexPatternButton');
      });

      it('delete action is disabled on the list page', async function () {
        await PageObjects.settings.navigateToDataViews();
        // Row icon actions expose disabled state with `aria-disabled="true"`
        // (because `hasAriaDisabled` keeps the button focusable for its tooltip)
        // instead of the native `disabled` attribute that `testSubjects.isEnabled` checks.
        const ariaDisabled = await (
          await testSubjects.find('action-delete')
        ).getAttribute('aria-disabled');
        expect(ariaDisabled).to.be('true');
      });
    });
  });
}
