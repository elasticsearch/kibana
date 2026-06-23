/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/context_awareness/extensions/_get_default_ad_hoc_data_views.ts

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, unifiedFieldList } = getPageObjects([
    'common',
    'discover',
    'unifiedFieldList',
  ]);
  const testSubjects = getService('testSubjects');
  const dataViews = getService('dataViews');
  const dataGrid = getService('dataGrid');
  const toasts = getService('toasts');
  const browser = getService('browser');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');

  describe('extension getDefaultAdHocDataViews', () => {
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
      ).to.be('2024-06-10T16:30:00.000Z');
      expect(
        await (await dataGrid.getCellElementByColumnName(5, '@timestamp')).getVisibleText()
      ).to.be('2024-06-10T14:00:00.000Z');
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
      ).to.be('2024-06-10T16:30:00.000Z');
      expect(
        await (await dataGrid.getCellElementByColumnName(5, '@timestamp')).getVisibleText()
      ).to.be('2024-06-10T14:00:00.000Z');
      await dataViews.switchTo('Example profile data view');
      await discover.waitUntilSearchingHasFinished();
      expect(await dataViews.isManaged()).to.be(true);
      expect(await unifiedFieldList.getSidebarSectionFieldNames('available')).to.have.length(7);
      expect(
        await (await dataGrid.getCellElementByColumnName(0, '@timestamp')).getVisibleText()
      ).to.be('2024-06-10T16:30:00.000Z');
      expect(
        await (await dataGrid.getCellElementByColumnName(5, '@timestamp')).getVisibleText()
      ).to.be('2024-06-10T14:00:00.000Z');
    });

    describe('fallback behaviour', function () {
      after(async () => {
        await esArchiver.load(
          'src/platform/test/functional/fixtures/es_archiver/discover/context_awareness'
        );
        // `logstash_functional` is loaded once at the suite level (see `../index.ts`),
        // so reload it here after the "no data page" test unloaded it.
        await esArchiver.loadIfNeeded(
          'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
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
        ).to.be('2024-06-10T16:30:00.000Z');
        expect(
          await (await dataGrid.getCellElementByColumnName(5, '@timestamp')).getVisibleText()
        ).to.be('2024-06-10T14:00:00.000Z');
      });

      it('should show the no data page when no ES data is available', async () => {
        await esArchiver.unload(
          'src/platform/test/functional/fixtures/es_archiver/discover/context_awareness'
        );
        // Also unload the suite-level archive so Discover truly sees no ES data.
        await esArchiver.unload(
          'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
        );
        await common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        expect(await testSubjects.exists('kbnNoDataPage')).to.be(true);
      });
    });
  });
}
