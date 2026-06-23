/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ loadTestFile }: FtrProviderContext) {
  describe('Entity Analytics - Watchlists', function () {
    loadTestFile(require.resolve('./index_source_sync'));
    loadTestFile(require.resolve('./store_source_sync'));
    loadTestFile(require.resolve('./entity_store_sync'));
    loadTestFile(require.resolve('./manual_assignment'));
    loadTestFile(require.resolve('./lifecycle'));
    loadTestFile(require.resolve('./index_source_api_key'));
    loadTestFile(require.resolve('./watchlist_privileges'));
  });
}
