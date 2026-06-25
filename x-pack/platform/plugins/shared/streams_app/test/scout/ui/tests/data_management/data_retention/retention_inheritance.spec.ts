/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { omit } from 'lodash';
import { test } from '../../../fixtures';
import {
  closeToastsIfPresent,
  openLifecycleMethodFlyout,
  saveRetentionChanges,
  setCustomRetention,
  toggleInheritSwitch,
  RETENTION_TEST_IDS,
} from '../../../fixtures/data_lifecycle_helpers';

test.describe(
  'Stream data retention - inheritance',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeEach(async ({ apiServices, browserAuth }) => {
      await browserAuth.loginAsAdmin();
      await apiServices.streams.clearStreamChildren('logs.otel');

      // Reset parent 'logs.otel' stream to default indefinite retention (DSL with no data_retention)
      const logsDefinition = await apiServices.streams.getStreamDefinition('logs.otel');
      await apiServices.streams.updateStream('logs.otel', {
        ingest: {
          ...logsDefinition.stream.ingest,
          processing: omit(logsDefinition.stream.ingest.processing, 'updated_at'),
          lifecycle: { dsl: {} },
        },
      });
    });

    test.afterEach(async ({ apiServices, page }) => {
      await closeToastsIfPresent(page);
      await apiServices.streams.clearStreamChildren('logs.otel');
    });

    test.afterAll(async ({ apiServices }) => {
      // Clear existing rules
      await apiServices.streams.clearStreamChildren('logs.otel');
    });

    test('should show inherit toggle and inherit by default', async ({
      apiServices,
      pageObjects,
      page,
    }) => {
      await apiServices.streams.forkStream('logs.otel', 'logs.otel.nginx', {
        field: 'service.name',
        eq: 'nginx',
      });
      await pageObjects.streams.gotoDataRetentionTab('logs.otel.nginx');

      // Child should inherit indefinite from parent by default
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('∞');

      // Should have inherit toggle
      await openLifecycleMethodFlyout(page);
      const inheritSwitch = page.getByTestId(RETENTION_TEST_IDS.successfulInheritCheckbox);
      await expect(inheritSwitch).toBeVisible();
      await expect(inheritSwitch).toBeChecked();
    });

    test('should toggle inherit mode on and off', async ({ apiServices, pageObjects, page }) => {
      await apiServices.streams.forkStream('logs.otel', 'logs.otel.nginx', {
        field: 'service.name',
        eq: 'nginx',
      });
      await pageObjects.streams.gotoDataRetentionTab('logs.otel.nginx');

      // Disable inherit - set custom retention (delete phase overrides inherited lifecycle)
      await setCustomRetention(page, '7', 'd');
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('7 days');

      // Re-enable inherit
      await openLifecycleMethodFlyout(page);
      await toggleInheritSwitch(page, true);
      await saveRetentionChanges(page);
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('∞');
    });

    test('should handle inherit for nested child streams', async ({
      apiServices,
      pageObjects,
      page,
    }) => {
      // Create parent child
      await apiServices.streams.forkStream('logs.otel', 'logs.otel.nginx', {
        field: 'service.name',
        eq: 'nginx',
      });

      // Create nested child
      await apiServices.streams.forkStream('logs.otel.nginx', 'logs.otel.nginx.access', {
        field: 'log.level',
        eq: 'info',
      });

      await pageObjects.streams.gotoDataRetentionTab('logs.otel.nginx.access');
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('∞');

      // Should have inherit toggle
      await openLifecycleMethodFlyout(page);
      await expect(page.getByTestId(RETENTION_TEST_IDS.successfulInheritCheckbox)).toBeVisible();
    });

    test('should allow override on nested child stream', async ({
      apiServices,
      pageObjects,
      page,
    }) => {
      await apiServices.streams.forkStream('logs.otel', 'logs.otel.nginx', {
        field: 'service.name',
        eq: 'nginx',
      });
      await apiServices.streams.forkStream('logs.otel.nginx', 'logs.otel.nginx.access', {
        field: 'log.level',
        eq: 'info',
      });

      await pageObjects.streams.gotoDataRetentionTab('logs.otel.nginx.access');

      // Override retention (delete phase overrides inherited lifecycle)
      await setCustomRetention(page, '14', 'd');
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('14 days');
    });

    test('should handle multiple child streams inheriting from same parent', async ({
      apiServices,
      pageObjects,
      page,
    }) => {
      await apiServices.streams.forkStream('logs.otel', 'logs.otel.nginx', {
        field: 'service.name',
        eq: 'nginx',
      });
      await apiServices.streams.forkStream('logs.otel', 'logs.otel.apache', {
        field: 'service.name',
        eq: 'apache',
      });

      // Both should inherit from logs
      await pageObjects.streams.gotoDataRetentionTab('logs.otel.nginx');
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('∞');

      await pageObjects.streams.gotoDataRetentionTab('logs.otel.apache');
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('∞');
    });

    test('should reflect parent retention changes in child when inheriting', async ({
      apiServices,
      pageObjects,
      page,
    }) => {
      await apiServices.streams.forkStream('logs.otel', 'logs.otel.nginx', {
        field: 'service.name',
        eq: 'nginx',
      });

      // Set parent retention
      await pageObjects.streams.gotoDataRetentionTab('logs.otel');
      await setCustomRetention(page, '30', 'd');

      // Check child inherits the value
      await pageObjects.streams.gotoDataRetentionTab('logs.otel.nginx');
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('30 days');
    });
  }
);
