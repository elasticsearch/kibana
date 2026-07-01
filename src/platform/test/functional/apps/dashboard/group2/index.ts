/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, loadTestFile }: FtrProviderContext) {
  const browser = getService('browser');
  const esArchiver = getService('esArchiver');

  async function loadCurrentData() {
    await browser.setWindowSize(1300, 900);
    await esArchiver.unload(
      'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
    );
    await esArchiver.loadIfNeeded(
      'src/platform/test/functional/fixtures/es_archiver/dashboard/current/data'
    );
  }

  describe('dashboard app - group 2', function () {
    before(loadCurrentData);

    loadTestFile(require.resolve('./full_screen_mode'));
    loadTestFile(require.resolve('./dashboard_filter_bar'));
    loadTestFile(require.resolve('./dashboard_filtering'));
  });
}
