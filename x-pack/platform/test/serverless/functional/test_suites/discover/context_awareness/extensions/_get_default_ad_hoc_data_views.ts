/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/context_awareness/extensions/_get_default_ad_hoc_data_views.ts

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, unifiedFieldList, svlCommonPage } = getPageObjects([
    'common',
    'discover',
    'unifiedFieldList',
    'svlCommonPage',
  ]);
  const testSubjects = getService('testSubjects');
  const dataViews = getService('dataViews');
  const dataGrid = getService('dataGrid');
  const toasts = getService('toasts');
  const browser = getService('browser');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');

  describe('extension getDefaultAdHocDataViews', () => {
    before(async () => {
      await svlCommonPage.loginAsAdmin();
    });

    after(async () => {
      await kibanaServer.savedObjects.clean({ types: ['search'] });
    });

    it('should show the profile data view', async () => {
      await common.navigateToActualUrl('discover', undefined, {
        ensureCurrentUrl: false,
      });
      expect(await dataViews.getSelectedName()).not.to.be('Example profile data view');
      await dataViews.switchTo('Example profile data view');
      await discover.waitUntilSearchingHasFinished();
      expect(await dataViews.isManaged()).to.be(true);
      expect(await unifiedFieldList.getSidebarSectionFieldNames('available')).to.have.length(7);
      expect(
        await (await dataGrid.getCellElementByColumnName(0, '@timestamp')).getVisibleText()
      ).to.be('Jun 10, 2024 @ 16:30:00.000');
      expect(
        await (await dataGrid.getCellElementByColumnName(5, '@timestamp')).getVisibleText()
      ).to.be('Jun 10, 2024 @ 14:00:00.000');
    });

    it('should reload the profile data view on page refresh, and not show an error toast', async () => {
      await browser.refresh();
      await discover.waitUntilSearchingHasFinished();
      expect(await toasts.getCount({ timeout: 2000 })).to.be(0);
      expect(await dataViews.getSelectedName()).to.be('Example profile data view');
      expect(await dataViews.isManaged()).to.be(true);
    });

    it('should create a copy of the profile data view when saving the Discover session', async () => {
      await discover.saveSearch('Default profile data view session');
      await discover.waitUntilSearchingHasFinished();
      expect(await dataViews.getSelectedName()).to.be(
        'Example profile data view (Default profile data view session)'
      );
      expect(await dataViews.isManaged()).to.be(false);
      expect(await unifiedFieldList.getSidebarSectionFieldNames('available')).to.have.length(7);
      expect(
        await (await dataGrid.getCellElementByColumnName(0, '@timestamp')).getVisibleText()
      ).to.be('Jun 10, 2024 @ 16:30:00.000');
      expect(
        await (await dataGrid.getCellElementByColumnName(5, '@timestamp')).getVisibleText()
      ).to.be('Jun 10, 2024 @ 14:00:00.000');
      await dataViews.switchTo('Example profile data view');
      await discover.waitUntilSearchingHasFinished();
      expect(await dataViews.isManaged()).to.be(true);
      expect(await unifiedFieldList.getSidebarSectionFieldNames('available')).to.have.length(7);
      expect(
        await (await dataGrid.getCellElementByColumnName(0, '@timestamp')).getVisibleText()
      ).to.be('Jun 10, 2024 @ 16:30:00.000');
      expect(
        await (await dataGrid.getCellElementByColumnName(5, '@timestamp')).getVisibleText()
      ).to.be('Jun 10, 2024 @ 14:00:00.000');
    });

    describe('fallback behaviour', function () {
      // Search and Security projects have a default data view, so these don't apply
      this.tags(['skipSvlSearch', 'skipSvlSec']);

      after(async () => {
        await esArchiver.load(
          'src/platform/test/functional/fixtures/es_archiver/discover/context_awareness'
        );
        await kibanaServer.importExport.load(
          'src/platform/test/functional/fixtures/kbn_archiver/discover/context_awareness'
        );
      });

      it('should fall back to the profile data view when no other data views are available', async () => {
        await kibanaServer.importExport.unload(
          'src/platform/test/functional/fixtures/kbn_archiver/discover/context_awareness'
        );
        await common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        expect(await dataViews.getSelectedName()).to.be('Example profile data view');
        await discover.waitUntilSearchingHasFinished();
        expect(await dataViews.isManaged()).to.be(true);
        expect(await unifiedFieldList.getSidebarSectionFieldNames('available')).to.have.length(7);
        expect(
          await (await dataGrid.getCellElementByColumnName(0, '@timestamp')).getVisibleText()
        ).to.be('Jun 10, 2024 @ 16:30:00.000');
        expect(
          await (await dataGrid.getCellElementByColumnName(5, '@timestamp')).getVisibleText()
        ).to.be('Jun 10, 2024 @ 14:00:00.000');
      });

      it('should show the no data page when no ES data is available', async () => {
        await esArchiver.unload(
          'src/platform/test/functional/fixtures/es_archiver/discover/context_awareness'
        );
        await common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        expect(await testSubjects.exists('kbnNoDataPage')).to.be(true);
      });
    });
  });
}
