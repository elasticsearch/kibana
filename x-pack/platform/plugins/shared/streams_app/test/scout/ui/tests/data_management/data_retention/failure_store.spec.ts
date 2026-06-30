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
import { generateLogsData } from '../../../fixtures/generators';
import { pinFailureStore } from '../../../fixtures/pin_failure_store';
import {
  openFailureStoreFlyout,
  removeFailureStoreDeletePhase,
  RETENTION_TEST_IDS,
  applyFailedLifecycleFlyout,
  setCustomRetention,
  setFailureStoreEnabled,
  setFailureStoreRetention,
} from '../../../fixtures/data_lifecycle_helpers';

test.describe('Stream data retention - updating failure store', () => {
  test.beforeAll(async ({ apiServices, logsSynthtraceEsClient, esClient }) => {
    await generateLogsData(logsSynthtraceEsClient)({ index: 'logs-generic-default' });
    await esClient.indices.putDataStreamOptions(
      {
        name: 'logs-generic-default',
        failure_store: {
          enabled: true,
        },
      },
      { meta: true }
    );
    // Ensure logs.otel has a backing data stream (deferred by default) so retention UI renders
    await apiServices.streams.restoreDataStream('logs.otel');
    // Start from a clean child state so a leftover fork from an interrupted run
    // doesn't make the fork below fail with a 409 Conflict.
    await apiServices.streams.clearStreamChildren('logs.otel');
    await apiServices.streams.forkStream('logs.otel', 'logs.otel.nginx', {
      field: 'service.name',
      eq: 'nginx',
    });
    await esClient.indices.putDataStreamOptions(
      {
        name: 'logs.otel.nginx',
        failure_store: {
          enabled: true,
        },
      },
      { meta: true }
    );
  });

  test.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsAdmin();
  });

  test.afterAll(async ({ logsSynthtraceEsClient, apiServices }) => {
    await apiServices.streams.clearStreamChildren('logs.otel');
    await logsSynthtraceEsClient.clean();
  });

  const STREAM_CONFIGS = [
    {
      label: 'classic streams',
      streamName: 'logs-generic-default' as const,
      isWired: false,
    },
    {
      label: 'wired streams',
      streamName: 'logs.otel.nginx' as const,
      isWired: true,
    },
  ];

  for (const { label, streamName, isWired } of STREAM_CONFIGS) {
    test(
      `should edit failure store successfully for ${label}`,
      { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
      async ({ page, pageObjects, apiServices, config }) => {
        // Pin the starting state.
        // - Serverless: a delete phase is always materialized, so start from enabled lifecycle.
        // - Stateful: start from disabled lifecycle so the "Add delete phase" entry point is available.
        await pinFailureStore(
          apiServices,
          streamName,
          config.serverless ? { lifecycle: { enabled: {} } } : { lifecycle: { disabled: {} } }
        );

        await pageObjects.streams.gotoDataRetentionTab(streamName);

        await setFailureStoreRetention(page, '7', 'd', { existingDeletePhase: config.serverless });
        await expect(
          page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetric)
        ).toContainText('7 days');
        await expect(
          page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetricSubtitle)
        ).toContainText('2 data phases');
      }
    );

    test(
      `should disable failure store for ${label}`,
      { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
      async ({ page, pageObjects, apiServices }) => {
        // Pin the starting state: failure store enabled.
        await pinFailureStore(apiServices, streamName, { lifecycle: { enabled: {} } });

        await pageObjects.streams.gotoDataRetentionTab(streamName);

        await setFailureStoreEnabled(page, false);
        await expect(
          page.getByTestId('disabledFailureStorePanel').getByText('Failure store disabled')
        ).toBeVisible();
      }
    );

    // Enabling the failure store without a custom retention persists exactly what the
    // preview shows. Serverless persists an empty enabled lifecycle
    // (`{ lifecycle: { enabled: {} } }`), so Elasticsearch materializes the default
    // delete phase (30 days / 2 phases).
    test(
      `should enable failure store with the default delete phase for ${label}`,
      { tag: tags.serverless.observability.complete },
      async ({ page, pageObjects, apiServices }) => {
        // Pin the starting state: failure store disabled.
        await pinFailureStore(apiServices, streamName, { disabled: {} });

        await pageObjects.streams.gotoDataRetentionTab(streamName);

        await setFailureStoreEnabled(page, true);

        await expect(
          page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetric)
        ).toContainText('30 days');
        await expect(
          page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetricSubtitle)
        ).toContainText('2 data phases');
      }
    );

    // Stateful persists a disabled lifecycle (`{ lifecycle: { disabled: {} } }`) to
    // match the preview (an empty enabled lifecycle would mean infinite retention there,
    // contradicting the materialized default), i.e. infinite retention / 1 data phase.
    test(
      `should enable failure store with infinite retention for ${label}`,
      { tag: tags.stateful.classic },
      async ({ page, pageObjects, apiServices }) => {
        // Pin the starting state: failure store disabled.
        await pinFailureStore(apiServices, streamName, { disabled: {} });

        await pageObjects.streams.gotoDataRetentionTab(streamName);

        await setFailureStoreEnabled(page, true);

        await expect(
          page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetric).getByText('∞')
        ).toBeVisible();
        await expect(
          page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetricSubtitle)
        ).toContainText('1 data phase');
      }
    );

    test(
      `should be able to disable lifecycle for ${label}`,
      { tag: tags.stateful.classic },
      async ({ page, pageObjects, apiServices }) => {
        // Pin the starting state: failure store enabled with a delete phase.
        await pinFailureStore(apiServices, streamName, {
          lifecycle: { enabled: { data_retention: '30d' } },
        });

        await pageObjects.streams.gotoDataRetentionTab(streamName);

        // Remove the delete phase -> indefinite retention (lifecycle disabled).
        await removeFailureStoreDeletePhase(page);

        // Verify infinite retention is shown
        await expect(
          page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetric).getByText('∞')
        ).toBeVisible();
        await expect(
          page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetricSubtitle)
        ).toContainText('1 data phase');
      }
    );

    if (isWired) {
      test(
        `should inherit failure store for ${label}`,
        { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
        async ({ page, pageObjects, apiServices }) => {
          // Pin the starting state: failure store enabled (not inheriting).
          await pinFailureStore(apiServices, streamName, { lifecycle: { enabled: {} } });

          await pageObjects.streams.gotoDataRetentionTab(streamName);

          // Enable inherit failure store (only wired non-root streams expose this checkbox).
          const flyout = await openFailureStoreFlyout(page);
          const inheritCheckbox = flyout.getByTestId(RETENTION_TEST_IDS.failedInheritCheckbox);
          await expect(inheritCheckbox).toBeVisible();
          await inheritCheckbox.check();
          await applyFailedLifecycleFlyout(page);

          // Inherits the parent's 30 day failure store retention.
          await expect(
            page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetric).getByText('30 days')
          ).toBeVisible();
          await expect(
            page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetricSubtitle)
          ).toContainText('2 data phases');
        }
      );
    }
  }

  test(
    'should not inherit failure store for root wired streams',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ page, pageObjects, apiServices }) => {
      // Pin the starting state: failure store enabled so the edit entry point is shown.
      await pinFailureStore(apiServices, 'logs.otel', { lifecycle: { enabled: {} } });

      await pageObjects.streams.gotoDataRetentionTab('logs.otel');

      // The inherit checkbox should not be visible for root streams
      const flyout = await openFailureStoreFlyout(page);
      await expect(flyout.getByTestId(RETENTION_TEST_IDS.failedInheritCheckbox)).toBeHidden();
    }
  );

  test(
    'should set failure store retention to different value than main retention',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ page, pageObjects, apiServices, config }) => {
      // Make the starting state deterministic regardless of other tests in this
      // suite (or a retry of this test): set an explicit empty DSL lifecycle so
      // DSL is already effective and there is no delete phase yet, and enable the
      // failure store with no delete phase. A classic stream accepts an explicit
      // DSL override (see lifecycle API tests), so the subsequent UI action does
      // not need a confirmation modal and can add the delete phase unconditionally.
      const definition = await apiServices.streams.getStreamDefinition('logs-generic-default');
      await apiServices.streams.updateStream('logs-generic-default', {
        ingest: {
          ...definition.stream.ingest,
          processing: omit(definition.stream.ingest.processing, 'updated_at'),
          lifecycle: { dsl: {} },
          failure_store: config.serverless
            ? { lifecycle: { enabled: {} } }
            : { lifecycle: { disabled: {} } },
        },
      });

      await pageObjects.streams.gotoDataRetentionTab('logs-generic-default');

      // Set main retention to 30 days
      await setCustomRetention(page, '30', 'd');
      await expect(page.getByTestId('retention-metric')).toContainText('30 days');

      // Set failure store retention to 7 days
      await setFailureStoreRetention(page, '7', 'd', { existingDeletePhase: config.serverless });

      // Verify both are set correctly
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('30 days');
      await expect(page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetric)).toContainText(
        '7 days'
      );
    }
  );

  test(
    'should persist failure store retention across page reload',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ page, pageObjects, apiServices, config }) => {
      // Pin the starting state.
      await pinFailureStore(
        apiServices,
        'logs-generic-default',
        config.serverless ? { lifecycle: { enabled: {} } } : { lifecycle: { disabled: {} } }
      );

      await pageObjects.streams.gotoDataRetentionTab('logs-generic-default');

      await setFailureStoreRetention(page, '21', 'd', { existingDeletePhase: config.serverless });

      // Reload page
      await pageObjects.streams.gotoDataRetentionTab('logs-generic-default');

      // Verify value persists
      await expect(page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetric)).toContainText(
        '21 days'
      );
    }
  );

  test(
    'should cancel failure store retention edit',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ page, pageObjects, apiServices }) => {
      // Pin the starting state: failure store enabled with a known delete phase so
      // the edit entry point is deterministic.
      await pinFailureStore(apiServices, 'logs-generic-default', {
        lifecycle: { enabled: { data_retention: '14d' } },
      });

      await pageObjects.streams.gotoDataRetentionTab('logs-generic-default');

      // Get current value
      const initialRetention = await page
        .getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetric)
        .textContent();

      // Open the delete phase flyout via the phase popover, change the value but cancel
      const deletePhaseFlyout = page.getByTestId(RETENTION_TEST_IDS.failedDeletePhaseFlyout);
      await page.getByTestId('failureStore-lifecyclePhase-delete-button').click();
      await page.getByTestId('lifecyclePhase-delete-editButton').click();
      await expect(deletePhaseFlyout).toBeVisible();
      await deletePhaseFlyout.getByTestId(RETENTION_TEST_IDS.failedDeletePhaseValue).fill('99');
      await page.getByTestId('streamsEditFailedDeletePhaseFlyoutCancelButton').click();
      await expect(deletePhaseFlyout).toBeHidden();

      // Verify value unchanged
      await expect(page.getByTestId(RETENTION_TEST_IDS.failureStoreRetentionMetric)).toContainText(
        initialRetention || ''
      );
    }
  );

  test(
    'should show failure store disabled state',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ page, pageObjects, apiServices }) => {
      // Pin the starting state: failure store disabled.
      await pinFailureStore(apiServices, 'logs-generic-default', { disabled: {} });

      await pageObjects.streams.gotoDataRetentionTab('logs-generic-default');

      await expect(page.getByTestId('disabledFailureStorePanel')).toBeVisible();
      await expect(page.getByText('Failure store disabled')).toBeVisible();
    }
  );
});
