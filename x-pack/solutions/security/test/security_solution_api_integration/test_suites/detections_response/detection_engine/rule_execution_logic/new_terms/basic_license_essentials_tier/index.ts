/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../../../ftr_provider_context';

export default function ({ loadTestFile }: FtrProviderContext) {
  describe('New terms rule execution logic API - Basic License/Essentials Tier (aggregation path)', function () {
    // Reuses the trial-tier specs, but the basic-license config disables the ES|QL approach so the
    // rule runs the aggregation execution path instead.
    loadTestFile(require.resolve('../trial_license_complete_tier/new_terms'));
    loadTestFile(require.resolve('../trial_license_complete_tier/new_terms_esql_edge_cases'));
    loadTestFile(require.resolve('../trial_license_complete_tier/new_terms_metrics'));
    loadTestFile(require.resolve('./new_terms_logged_requests'));
  });
}
