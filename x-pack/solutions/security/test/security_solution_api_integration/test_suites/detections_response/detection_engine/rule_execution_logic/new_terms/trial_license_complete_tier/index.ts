/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../../../ftr_provider_context';

export default function ({ loadTestFile }: FtrProviderContext) {
  describe('New terms rule execution logic API', function () {
    loadTestFile(require.resolve('./new_terms'));
    loadTestFile(require.resolve('./new_terms_alert_suppression'));
    loadTestFile(require.resolve('./new_terms_metrics'));
    loadTestFile(require.resolve('./new_terms_esql_edge_cases'));
    loadTestFile(require.resolve('./new_terms_runtime_fields'));
    loadTestFile(require.resolve('./new_terms_logged_requests'));
  });
}
