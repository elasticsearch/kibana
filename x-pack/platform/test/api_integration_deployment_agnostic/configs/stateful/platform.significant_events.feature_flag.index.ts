/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';

export default function ({ loadTestFile }: DeploymentAgnosticFtrProviderContext) {
  // Significant events API suites. These hit routes guarded by the
  // streams.significantEventsAvailable feature flag, which the parent config forces on. They
  // cannot run in the default deployment-agnostic configs (the flag defaults to false there and
  // those configs cannot set it on ECH), so they live in this dedicated feature-flag config.
  describe('apis', () => {
    loadTestFile(require.resolve('../../apis/streams/significant_events'));
    loadTestFile(require.resolve('../../apis/streams/queries'));
    loadTestFile(require.resolve('../../apis/streams/features'));
    loadTestFile(require.resolve('../../apis/streams/content'));
    loadTestFile(require.resolve('../../apis/streams/snapshot_restore'));
  });
}
