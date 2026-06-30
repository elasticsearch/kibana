/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ loadTestFile }: FtrProviderContext) {
  describe('index management', () => {
    loadTestFile(require.resolve('./indices'));
    loadTestFile(require.resolve('./index_doc_count'));
    loadTestFile(require.resolve('./mapping'));
    loadTestFile(require.resolve('./settings'));
    loadTestFile(require.resolve('./stats'));
    loadTestFile(require.resolve('./data_streams'));
    loadTestFile(require.resolve('./data_streams_index_mode'));
    loadTestFile(require.resolve('./templates'));
    loadTestFile(require.resolve('./component_templates'));
    loadTestFile(require.resolve('./cluster_nodes'));
    loadTestFile(require.resolve('./index_details'));
    loadTestFile(require.resolve('./enrich_policies'));
    loadTestFile(require.resolve('./create_enrich_policy'));
    loadTestFile(require.resolve('./data_enrichers'));
    loadTestFile(require.resolve('./searchprofiler'));
    loadTestFile(require.resolve('./snapshot_repositories'));
  });
}
