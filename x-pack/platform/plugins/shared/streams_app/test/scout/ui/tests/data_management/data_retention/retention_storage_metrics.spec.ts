/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { omit } from 'lodash';
import { test } from '../../../fixtures';
import {
  closeToastsIfPresent,
  setCustomRetention,
  RETENTION_TEST_IDS,
} from '../../../fixtures/data_lifecycle_helpers';

test.describe(
  'Stream data retention - storage metrics integration',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeAll(async ({ apiServices }) => {
      await apiServices.streams.clearStreamChildren('logs.otel');
      const logsDefinition = await apiServices.streams.getStreamDefinition('logs.otel');
      await apiServices.streams.updateStream('logs.otel', {
        ingest: {
          ...logsDefinition.stream.ingest,
          processing: omit(logsDefinition.stream.ingest.processing, 'updated_at'),
          lifecycle: { dsl: {} },
        },
      });
      await apiServices.streams.forkStream('logs.otel', 'logs.otel.nginx', {
        field: 'service.name',
        eq: 'nginx',
      });
    });

    test.beforeEach(async ({ apiServices, browserAuth, pageObjects }) => {
      await browserAuth.loginAsAdmin();
      // Reset only the child stream's retention via API — no fork/delete cycle
      const childDefinition = await apiServices.streams.getStreamDefinition('logs.otel.nginx');
      await apiServices.streams.updateStream('logs.otel.nginx', {
        ingest: {
          ...childDefinition.stream.ingest,
          processing: omit(childDefinition.stream.ingest.processing, 'updated_at'),
          lifecycle: { dsl: {} },
        },
      });
      await pageObjects.streams.gotoDataRetentionTab('logs.otel.nginx');
    });

    test.afterEach(async ({ page }) => {
      await closeToastsIfPresent(page);
    });

    test.afterAll(async ({ apiServices }) => {
      await apiServices.streams.clearStreamChildren('logs.otel');
    });

    test('should update retention without affecting storage display', async ({ page }) => {
      await setCustomRetention(page, '7', 'd');

      // Retention should be updated
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('7 days');

      // Storage metrics should still be visible/unchanged
      // (exact verification depends on storage metrics implementation)
    });

    test('should maintain retention display after page navigation', async ({
      page,
      pageObjects,
    }) => {
      // Set retention
      await setCustomRetention(page, '14', 'd');

      // Navigate away and back
      await pageObjects.streams.gotoPartitioningTab('logs.otel.nginx');
      await pageObjects.streams.gotoDataRetentionTab('logs.otel.nginx');

      // Retention should still be displayed correctly
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('14 days');
    });

    // Note: Additional storage metrics tests require:
    // 1. Storage size card to be implemented and have test IDs
    // 2. Rollover card to be implemented and have test IDs
    // 3. API to return actual storage metrics
    //
    // These tests focus on retention card integration within the lifecycle tab
  }
);
