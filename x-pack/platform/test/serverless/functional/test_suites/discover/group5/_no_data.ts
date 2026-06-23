/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/group5/_no_data.ts

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const log = getService('log');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const testSubjects = getService('testSubjects');
  const dataGrid = getService('dataGrid');
  const dataViews = getService('dataViews');
  const { common, svlCommonPage, discover, header } = getPageObjects([
    'common',
    'svlCommonPage',
    'discover',
    'header',
  ]);

  describe('discover no data', function () {
    this.tags(['skipSvlOblt', 'skipSvlSec']);

    const kbnDirectory = 'src/platform/test/functional/fixtures/kbn_archiver/discover';

    before(async function () {
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
      log.debug('load kibana with no data');
      await kibanaServer.importExport.unload(kbnDirectory);
      await svlCommonPage.loginAsAdmin();
      await common.navigateToApp('discover');
    });

    after(async () => {
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
    });

    it('adds a new data view when no data views', async () => {
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
      await common.navigateToApp('discover');

      const dataViewToCreate = 'logstash';
      await dataViews.createFromPrompt({ name: dataViewToCreate });
      await dataViews.waitForSwitcherToBe(`${dataViewToCreate}*`);
    });

    it('skips to Discover to try ES|QL', async () => {
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
      await kibanaServer.uiSettings.update({
        'timepicker:timeDefaults': '{  "from": "2015-09-18T19:37:13.000Z",  "to": "now"}',
      });
      await common.navigateToApp('discover');

      await testSubjects.click('tryESQLLink');

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      await testSubjects.existOrFail('ESQLEditor');
      await testSubjects.existOrFail('unifiedHistogramChart');
      const rows = await dataGrid.getDocTableRows();
      expect(rows.length).to.be.above(0);
    });
  });
}
