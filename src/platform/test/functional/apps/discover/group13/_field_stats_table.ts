/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FtrProviderContext } from '../ftr_provider_context';

/**
 * Migration recommendation: delete these tests. They test a show/hide UI behavior that is already covered in src/platform/plugins/shared/discover/public/components/view_mode_toggle/view_mode_toggle.test.tsx
 */
export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, timePicker, header } = getPageObjects([
    'common',
    'discover',
    'timePicker',
    'header',
  ]);
  const esArchiver = getService('esArchiver');
  const testSubjects = getService('testSubjects');
  const kibanaServer = getService('kibanaServer');
  const security = getService('security');
  const defaultSettings = {
    defaultIndex: 'logstash-*',
  };

  describe('discover field statistics table', function () {
    before(async () => {
      await security.testUser.setRoles(['kibana_admin', 'test_logstash_reader']);
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await kibanaServer.uiSettings.update(defaultSettings);
      await common.navigateToApp('discover');
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
    });

    after(async () => {
      await kibanaServer.importExport.unload(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.uiSettings.replace({});
    });

    it('should show Field Statistics data in data view mode', async () => {
      await testSubjects.click('dscViewModeFieldStatsButton');
      await header.waitUntilLoadingHasFinished();
      await testSubjects.existOrFail('dataVisualizerTableContainer');

      await testSubjects.click('dscViewModeDocumentButton');
      await header.waitUntilLoadingHasFinished();
      await testSubjects.existOrFail('discoverDocTable');
    });

    it('should not show Field Statistics data in ES|QL mode', async () => {
      await discover.selectTextBaseLang();
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      await testSubjects.missingOrFail('dscViewModeFieldStatsButton');
    });
  });
}
