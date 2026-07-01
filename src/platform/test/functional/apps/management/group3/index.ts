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
  const esArchiver = getService('esArchiver');

  describe('management - group 3 (import/export/management)', function () {
    before(async () => {
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await esArchiver.loadIfNeeded('src/platform/test/functional/fixtures/es_archiver/makelogs');
    });

    loadTestFile(require.resolve('./_mgmt_import_saved_objects'));
    loadTestFile(require.resolve('./_import_objects'));
    loadTestFile(require.resolve('./_test_huge_fields'));
    loadTestFile(require.resolve('./_handle_alias'));
    loadTestFile(require.resolve('./_handle_version_conflict'));
    loadTestFile(require.resolve('./_handle_not_found'));
    loadTestFile(require.resolve('./_legacy_url_redirect'));
  });
}
