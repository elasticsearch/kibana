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
  const log = getService('log');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');

  describe('visualize app', () => {
    before(async () => {
      log.debug('Starting visualize before method');
      await browser.setWindowSize(1280, 800);
      await kibanaServer.savedObjects.cleanStandardList();

      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/long_window_logstash'
      );
      await browser.refresh();
    });

    // `_visualize_listing` coverage now lives in the visualizations Scout suite
    // (`test/scout/ui/parallel_tests/visualize_listing.*.spec.ts`).
    loadTestFile(require.resolve('./_add_to_dashboard'));
  });
}
