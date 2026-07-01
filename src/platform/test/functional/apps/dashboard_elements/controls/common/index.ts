/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ loadTestFile, getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const security = getService('security');

  const { dashboard } = getPageObjects(['dashboard']);

  async function setup() {
    await esArchiver.loadIfNeeded(
      'src/platform/test/functional/fixtures/es_archiver/dashboard/current/data'
    );
    await kibanaServer.savedObjects.cleanStandardList();
    await kibanaServer.importExport.load(
      'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/kibana'
    );
    await security.testUser.setRoles(['kibana_admin', 'test_logstash_reader', 'animals']);
    await kibanaServer.uiSettings.replace({
      defaultIndex: '0bf35f60-3dc9-11e8-8660-4d65aa086b3c',
    });

    await dashboard.navigateToApp();
    await dashboard.preserveCrossAppState();
  }

  describe('Controls', function () {
    before(setup);
    loadTestFile(require.resolve('./range_slider'));
    loadTestFile(require.resolve('./time_slider'));
    loadTestFile(require.resolve('./control_chaining'));
    loadTestFile(require.resolve('./control_group_apply_button'));
    loadTestFile(require.resolve('./pin_controls'));
    loadTestFile(require.resolve('./replace_controls'));
    loadTestFile(require.resolve('./multiple_data_views'));
  });
}
