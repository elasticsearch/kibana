/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, getPageObjects, loadTestFile }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const browser = getService('browser');
  const kibanaServer = getService('kibanaServer');
  const security = getService('security');
  const { common, timePicker, discover } = getPageObjects(['common', 'timePicker', 'discover']);

  describe('discover/tabs4', function () {
    before(async function () {
      await browser.setWindowSize(1200, 1200);
      await security.testUser.setRoles(['kibana_admin', 'test_logstash_reader']);
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/index_pattern_without_timefield'
      );
      await esArchiver.load(
        'src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_flights'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/kibana_sample_data_flights_index_pattern'
      );
      await kibanaServer.uiSettings.replace({ defaultIndex: 'logstash-*' });
      await timePicker.setDefaultAbsoluteRangeViaUiSettings();
    });

    beforeEach(async () => {
      await common.navigateToApp('discover');
      await discover.waitUntilTabIsLoaded();
    });

    loadTestFile(require.resolve('./_no_data'));
  });
}
