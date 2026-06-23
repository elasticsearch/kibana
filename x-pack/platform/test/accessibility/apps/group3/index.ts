/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../common/ftr_provider_context';

export default ({ loadTestFile }: FtrProviderContext): void => {
  describe('X-Pack Accessibility Tests - Group 3', function () {
    loadTestFile(require.resolve('./upgrade_assistant'));
    loadTestFile(require.resolve('./canvas'));
    loadTestFile(require.resolve('./maps'));
    loadTestFile(require.resolve('./graph'));
    loadTestFile(require.resolve('./ml_embeddables_in_dashboard'));
    loadTestFile(require.resolve('./rules_connectors'));
    loadTestFile(require.resolve('./remote_clusters'));
    loadTestFile(require.resolve('./reporting'));
    loadTestFile(require.resolve('./search_sessions'));

    loadTestFile(require.resolve('./license_management'));
    loadTestFile(require.resolve('./stack_monitoring'));

    // Deprecated features; scheduled for removal in v10
    loadTestFile(require.resolve('./rollup_jobs'));
  });
};
