/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, loadTestFile }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');

  const from = '2024-06-10T14:00:00.000Z';
  const to = '2024-06-10T16:30:00.000Z';

  describe('discover/context_awareness', () => {
    before(async () => {
      await esArchiver.load(
        'src/platform/test/functional/fixtures/es_archiver/discover/context_awareness'
      );
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover/context_awareness'
      );
      await kibanaServer.uiSettings.update({
        'timepicker:timeDefaults': `{ "from": "${from}", "to": "${to}"}`,
      });
    });

    loadTestFile(require.resolve('./_framework'));
    loadTestFile(require.resolve('./_telemetry'));
    loadTestFile(require.resolve('./_profile_state'));
    loadTestFile(require.resolve('./extensions/_get_row_indicator_provider'));
    loadTestFile(require.resolve('./extensions/_get_row_additional_leading_controls'));
    loadTestFile(require.resolve('./extensions/_get_doc_viewer'));
    loadTestFile(require.resolve('./extensions/_get_cell_renderers'));
    loadTestFile(require.resolve('./extensions/_get_default_app_state'));
    loadTestFile(require.resolve('./extensions/_get_additional_cell_actions'));
    loadTestFile(require.resolve('./extensions/_get_app_menu'));
    loadTestFile(require.resolve('./extensions/_get_default_ad_hoc_data_views'));
    loadTestFile(require.resolve('./extensions/_get_default_esql_query'));
    loadTestFile(require.resolve('./extensions/_get_pagination_config'));
    loadTestFile(require.resolve('./extensions/_get_recommended_fields'));
  });
}
