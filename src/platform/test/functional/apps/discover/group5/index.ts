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
  const browser = getService('browser');

  describe('discover/group5', function () {
    before(async function () {
      await browser.setWindowSize(1300, 800);
    });

    // `_no_data` is intentionally first: it expects a clean ES/Kibana state.
    // Running it after other tests leaves residual managed/default data views
    // (e.g. "All logs") that prevent Discover from rendering the no-data page.
    loadTestFile(require.resolve('./_no_data'));
    loadTestFile(require.resolve('./_filter_editor'));
    loadTestFile(require.resolve('./_field_data_with_fields_api'));
    loadTestFile(require.resolve('./_shared_links'));
    loadTestFile(require.resolve('./_source_filters'));
    loadTestFile(require.resolve('./_large_string'));
    loadTestFile(require.resolve('./_inspector'));
    loadTestFile(require.resolve('./_url_state'));
  });
}
