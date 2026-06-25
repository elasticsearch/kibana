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
  setCustomRetention,
  RETENTION_TEST_IDS,
} from '../../../fixtures/data_lifecycle_helpers';

test.describe(
  'Stream data retention - display values',
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

    test('should show data phase count subtitle when custom retention is set', async ({ page }) => {
      await setCustomRetention(page, '7', 'd');
      await expect(page.getByTestId('retention-metric-subtitle')).toContainText('2 data phases');
    });

    test('should display retention metric prominently', async ({ page }) => {
      await setCustomRetention(page, '7', 'd');
      const retentionMetric = page.getByTestId(RETENTION_TEST_IDS.retentionMetric);
      await expect(retentionMetric).toBeVisible();
      await expect(retentionMetric).toContainText('7 days');
    });
  }
);
