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
  const elasticChart = getService('elasticChart');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const security = getService('security');

  const { dashboard } = getPageObjects(['timePicker', 'dashboard']);

  const setup = async () => {
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
    await dashboard.gotoDashboardLandingPage();
    await elasticChart.setNewChartUiDebugFlag();
  };

  describe('Options list control', () => {
    before(setup);

    loadTestFile(require.resolve('./options_list_creation_and_editing'));
    loadTestFile(require.resolve('./options_list_dashboard_interaction'));
    loadTestFile(require.resolve('./options_list_runtime_fields'));
    loadTestFile(require.resolve('./options_list_suggestions'));
    loadTestFile(require.resolve('./options_list_validation'));
    loadTestFile(require.resolve('./options_list_exists_query'));
  });
}
