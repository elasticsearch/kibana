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
import {
  disableInheritFailureStoreIfEnabled,
  saveFailureStoreChanges,
  setFailureStoreRetention,
  toggleFailureStore,
} from '../../../fixtures/retention_helpers';
import { setCustomRetention } from '../../../fixtures/data_lifecycle_helpers';

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
      enableBtnTag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
    },
    {
      label: 'wired streams',
      streamName: 'logs.otel.nginx' as const,
      enableBtnTag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
    },
  ];

  for (const { label, streamName } of STREAM_CONFIGS) {
    test(
      `should edit failure store successfully for ${label}`,
      { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
      async ({ page, pageObjects }) => {
        await pageObjects.streams.gotoDataRetentionTab(streamName);

        await setFailureStoreRetention(page, '7', 'd');
        await expect(page.getByTestId('failureStoreRetention-metric')).toContainText('7 days');
        await expect(page.getByTestId('failureStoreRetention-metric-subtitle')).toContainText(
          '2 data phases'
        );
      }
    );

    test(
      `should disable failure store for ${label}`,
      { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
      async ({ page, pageObjects }) => {
        await pageObjects.streams.gotoDataRetentionTab(streamName);

        await toggleFailureStore(page, false);
        await expect(
          page.getByTestId('disabledFailureStorePanel').getByText('Failure store disabled')
        ).toBeVisible();
      }
    );

    test(
      `should enable failure store for ${label}`,
      { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
      async ({ page, pageObjects }) => {
        await pageObjects.streams.gotoDataRetentionTab(streamName);

        // Ensure a consistent starting point (other tests may leave the failure store enabled).
        await toggleFailureStore(page, false);
        await toggleFailureStore(page, true);
        await expect(page.getByTestId('failureStoreRetention-metric')).toContainText('30 days');
        await expect(page.getByTestId('failureStoreRetention-metric-subtitle')).toContainText(
          '2 data phases'
        );
      }
    );

    test(
      `should be able to disable lifecycle for ${label}`,
      { tag: tags.stateful.classic },
      async ({ page, pageObjects }) => {
        await pageObjects.streams.gotoDataRetentionTab(streamName);

        // Ensure the failure store is enabled, otherwise lifecycle options are disabled.
        await toggleFailureStore(page, true);
        await page.getByTestId('streamFailureStoreEditRetention').click();

        // The disable lifecycle option should be visible on ESS
        await expect(page.getByTestId('disabledLifecycle')).toBeVisible();

        await disableInheritFailureStoreIfEnabled(page);

        // Enable disable lifecycle
        const disabledLifecycleButton = page.getByTestId('disabledLifecycle');
        await expect(disabledLifecycleButton).toBeEnabled();
        await disabledLifecycleButton.click();
        await saveFailureStoreChanges(page);

        // Verify infinite retention is shown
        await expect(page.getByTestId('failureStoreRetention-metric').getByText('∞')).toBeVisible();
        await expect(page.getByTestId('failureStoreRetention-metric-subtitle')).toContainText(
          '1 data phase'
        );
      }
    );

    test(
      `should inherit failure store for ${label}`,
      { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
      async ({ page, pageObjects }) => {
        await pageObjects.streams.gotoDataRetentionTab(streamName);

        // Enable inherit failure store
        await page.getByTestId('streamFailureStoreEditRetention').click();
        await page.getByTestId('inheritFailureStoreSwitch').click();
        await saveFailureStoreChanges(page);
        await expect(
          page.getByTestId('failureStoreRetention-metric').getByText('30 days')
        ).toBeVisible();
        await expect(page.getByTestId('failureStoreRetention-metric-subtitle')).toContainText(
          '2 data phases'
        );
      }
    );
  }

  test(
    'should not inherit failure store for root wired streams',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ page, pageObjects }) => {
      await pageObjects.streams.gotoDataRetentionTab('logs.otel');

      // Try to enable inherit failure store - the switch should not be visible for root streams
      await page.getByTestId('streamFailureStoreEditRetention').click();
      await expect(page.getByTestId('inheritFailureStoreSwitch')).toBeHidden();
    }
  );

  test(
    'should set failure store retention to different value than main retention',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ page, pageObjects, apiServices }) => {
      // Make the starting state deterministic regardless of other tests in this
      // suite (or a retry of this test): set an explicit empty DSL lifecycle so
      // DSL is already effective and there is no delete phase yet. A classic
      // stream accepts an explicit DSL override (see lifecycle API tests), so
      // the subsequent UI action does not need a confirmation modal and can add
      // the delete phase unconditionally.
      const definition = await apiServices.streams.getStreamDefinition('logs-generic-default');
      await apiServices.streams.updateStream('logs-generic-default', {
        ingest: {
          ...definition.stream.ingest,
          processing: omit(definition.stream.ingest.processing, 'updated_at'),
          lifecycle: { dsl: {} },
        },
      });

      await pageObjects.streams.gotoDataRetentionTab('logs-generic-default');

      await setCustomRetention(page, '30', 'd');
      await expect(page.getByTestId('retention-metric')).toContainText('30 days');

      // Set failure store retention to 7 days
      await setFailureStoreRetention(page, '7', 'd');

      // Verify both are set correctly
      await expect(page.getByTestId('retention-metric')).toContainText('30 days');
      await expect(page.getByTestId('failureStoreRetention-metric')).toContainText('7 days');
    }
  );

  test(
    'should persist failure store retention across page reload',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ page, pageObjects }) => {
      await pageObjects.streams.gotoDataRetentionTab('logs-generic-default');

      await setFailureStoreRetention(page, '21', 'd');

      // Reload page
      await pageObjects.streams.gotoDataRetentionTab('logs-generic-default');

      // Verify value persists
      await expect(page.getByTestId('failureStoreRetention-metric')).toContainText('21 days');
    }
  );

  test(
    'should cancel failure store retention edit',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ page, pageObjects }) => {
      await pageObjects.streams.gotoDataRetentionTab('logs-generic-default');

      // Get current value
      const initialRetention = await page.getByTestId('failureStoreRetention-metric').textContent();

      // Open modal and change value but cancel
      await page.getByTestId('streamFailureStoreEditRetention').click();
      await page.getByTestId('custom').click();
      const dialog = page.getByRole('dialog');
      await dialog.getByTestId('selectFailureStorePeriodValue').fill('99');
      await page.getByTestId('failureStoreModalCancelButton').click();

      // Verify value unchanged
      await expect(page.getByTestId('failureStoreRetention-metric')).toContainText(
        initialRetention || ''
      );
    }
  );

  test(
    'should show failure store disabled state',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ page, pageObjects }) => {
      await pageObjects.streams.gotoDataRetentionTab('logs-generic-default');

      await toggleFailureStore(page, false);

      await expect(page.getByTestId('disabledFailureStorePanel')).toBeVisible();
      await expect(page.getByText('Failure store disabled')).toBeVisible();
    }
  );
});
