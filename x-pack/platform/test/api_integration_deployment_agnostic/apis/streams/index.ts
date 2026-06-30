/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';

export default function ({ loadTestFile }: DeploymentAgnosticFtrProviderContext) {
  describe('Streams Endpoints', () => {
    loadTestFile(require.resolve('./basic'));
    loadTestFile(require.resolve('./enrichment'));
    loadTestFile(require.resolve('./classic'));
    loadTestFile(require.resolve('./flush_config'));
    loadTestFile(require.resolve('./attachments/attachments'));
    loadTestFile(require.resolve('./schema'));
    loadTestFile(require.resolve('./description_only_inheritance'));
    loadTestFile(require.resolve('./processing_date_suggestions'));
    loadTestFile(require.resolve('./processing_simulate'));
    loadTestFile(require.resolve('./processing_validation'));
    loadTestFile(require.resolve('./root_stream'));
    loadTestFile(require.resolve('./lifecycle'));
    loadTestFile(require.resolve('./lifecycle_retention'));
    loadTestFile(require.resolve('./failure_store'));
    // Significant events suites (significant_events, queries, features, content, snapshot_restore)
    // are gated behind the streams.significantEventsAvailable feature flag and run from the
    // dedicated significant_events.feature_flag configs instead of here.
    loadTestFile(require.resolve('./discover'));
    loadTestFile(require.resolve('./ingest_missing_data_stream'));
    loadTestFile(require.resolve('./migration_on_read'));
    loadTestFile(require.resolve('./metadata'));
    loadTestFile(require.resolve('./conflicts'));
    loadTestFile(require.resolve('./field_mappings'));
    loadTestFile(require.resolve('./permissions'));
    loadTestFile(require.resolve('./global_search'));
    loadTestFile(require.resolve('./settings'));
    loadTestFile(require.resolve('./doc_counts'));
    loadTestFile(require.resolve('./query_streams'));
    loadTestFile(require.resolve('./deferred_data_stream'));
    loadTestFile(require.resolve('./draft_streams'));
    loadTestFile(require.resolve('./otel_metrics_processing'));
  });
}
