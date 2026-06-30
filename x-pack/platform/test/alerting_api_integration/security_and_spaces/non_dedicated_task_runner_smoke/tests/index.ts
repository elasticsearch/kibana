/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../common/ftr_provider_context';
import { setupSpacesAndUsers, tearDown } from '../../setup';

export default function nonDedicatedTaskRunnerSmokeTests({
  loadTestFile,
  getService,
}: FtrProviderContext) {
  describe('alerting api integration security and spaces - non-dedicated task runner smoke test', () => {
    before(async () => {
      await setupSpacesAndUsers(getService);
    });

    after(async () => {
      await tearDown(getService);
    });

    // Verify that Kibana can schedule and execute tasks when useDedicatedTaskRunner: false
    loadTestFile(require.resolve('../../group3/tests/alerting/run_soon'));
  });
}
