/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ loadTestFile }: FtrProviderContext) {
  describe('Osquery Endpoints', () => {
    loadTestFile(require.resolve('./packs'));
    loadTestFile(require.resolve('./assets'));
    loadTestFile(require.resolve('./fleet_wrapper'));
    loadTestFile(require.resolve('./saved_queries'));
    loadTestFile(require.resolve('./privileges_check'));
    loadTestFile(require.resolve('./status'));
    loadTestFile(require.resolve('./live_queries'));
    loadTestFile(require.resolve('./history_tags'));
    loadTestFile(require.resolve('./unified_history'));
    loadTestFile(require.resolve('./scheduled_results'));
    loadTestFile(require.resolve('./scheduled_results_space_scoping'));
    loadTestFile(require.resolve('./action_results_space_scoping'));
    loadTestFile(require.resolve('./export_results'));
  });
}
