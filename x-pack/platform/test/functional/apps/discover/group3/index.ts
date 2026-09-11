/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Migration recommendation: DELETE this index and ./config.ts once every file below is resolved.
 * The config adds no suite-specific server args on top of ../../../config.base.ts, and the Scout
 * targets (the Discover module's own configs and
 * src/platform/plugins/shared/discover/test/scout) already exist.
 *
 * Audit summary — see each file for the per-test rationale:
 * - saved_searches: DELETED (both tests were already ported to Scout)
 * - visualize_field: MIXED (12 tests; 2 delete, 2 hand to Lens, rest migrate)
 * - value_suggestions: DELETED (fully ported to Scout)
 * - value_suggestions_non_timebased: DELETED (fully ported to Scout)
 * - saved_search_embeddable: MIXED (1 delete, 1 cover with unit test, 3 migrate)
 */

import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ loadTestFile }: FtrProviderContext) {
  describe('discover - group 3', function () {
    loadTestFile(require.resolve('./visualize_field'));
    loadTestFile(require.resolve('./saved_search_embeddable'));
  });
}
