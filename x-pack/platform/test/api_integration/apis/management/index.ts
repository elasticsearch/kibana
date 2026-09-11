/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ loadTestFile }: FtrProviderContext) {
  describe('management', () => {
    loadTestFile(require.resolve('./advanced_settings'));
    loadTestFile(require.resolve('./rollup'));
    loadTestFile(require.resolve('./index_lifecycle_management'));
    loadTestFile(require.resolve('./snapshot_restore'));
  });
}
