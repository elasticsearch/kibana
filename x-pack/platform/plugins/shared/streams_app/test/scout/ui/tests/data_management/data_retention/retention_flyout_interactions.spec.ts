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
  cancelRetentionChanges,
  closeToastsIfPresent,
  openLifecycleMethodFlyout,
  setCustomRetention,
  RETENTION_TEST_IDS,
} from '../../../fixtures/data_lifecycle_helpers';

test.describe(
  'Stream data retention - flyout interactions',
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

    test('should open and close the lifecycle method flyout', async ({ page }) => {
      const flyout = await openLifecycleMethodFlyout(page);
      await expect(flyout).toBeVisible();

      // Cancel button closes the flyout
      await cancelRetentionChanges(page);
      await expect(page.getByTestId(RETENTION_TEST_IDS.successfulLifecycleFlyout)).toBeHidden();
    });

    test('should preserve values on cancel and update on save', async ({ page }) => {
      // Set initial custom retention via the delete-phase flyout
      await setCustomRetention(page, '7', 'd');
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('7 days');

      // Open the delete-phase flyout, change the value but cancel - original preserved
      await page.getByTestId('lifecyclePhase-delete-button').click();
      await page.getByTestId('lifecyclePhase-delete-editButton').click();
      const deletePhaseFlyout = page.getByTestId(RETENTION_TEST_IDS.successfulDeletePhaseFlyout);
      await expect(deletePhaseFlyout).toBeVisible();
      await deletePhaseFlyout.getByTestId(RETENTION_TEST_IDS.successfulDeletePhaseValue).fill('14');
      await page.getByTestId(RETENTION_TEST_IDS.successfulDeletePhaseCancelButton).click();
      await expect(deletePhaseFlyout).toBeHidden();
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('7 days');

      // Set a new value and save - value updates
      await setCustomRetention(page, '30', 'd', { existing: true });
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('30 days');
    });
  }
);
