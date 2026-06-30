/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Pins the exact document count of the ft_ihp_outlier fixture at the data layer.
 * The UI test (outlier_detection_creation.spec.ts) only confirms that the counts
 * section renders a digit — the exact value belongs here where it can fail fast
 * and without running a DFA job.
 */

import { expect } from '@kbn/scout/api';
import { mlApiTest as apiTest } from '../../fixtures';

apiTest.describe(
  'ihp_outlier source index document count',
  {
    tag: ['@local-stateful-classic'],
  },
  () => {
    apiTest.beforeAll(async ({ esArchiver }) => {
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/ihp_outlier');
    });

    apiTest('ft_ihp_outlier has exactly 1460 documents', async ({ esClient }) => {
      const result = await esClient.count({ index: 'ft_ihp_outlier' });
      expect(result.count).toBe(1460);
    });
  }
);
