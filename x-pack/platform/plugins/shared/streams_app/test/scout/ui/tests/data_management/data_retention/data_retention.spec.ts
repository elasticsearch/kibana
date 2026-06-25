/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type EsClient, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { omit } from 'lodash';
import { test } from '../../../fixtures';
import { generateLogsData } from '../../../fixtures/generators';
import {
  ensureDslLifecycle,
  openLifecycleMethodFlyout,
  removeDeletePhase,
  RETENTION_TEST_IDS,
  saveRetentionChanges,
  setCustomRetention,
  toggleInheritSwitch,
} from '../../../fixtures/data_lifecycle_helpers';

async function createTsdbIndexTemplate({
  esClient,
  templateName,
  pattern,
}: {
  esClient: EsClient;
  templateName: string;
  pattern: string;
}) {
  await esClient.indices.putIndexTemplate({
    name: templateName,
    index_patterns: [pattern],
    priority: 2000,
    data_stream: {},
    template: {
      settings: { 'index.mode': 'time_series' },
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          'host.name': { type: 'keyword', time_series_dimension: true },
          'service.name': { type: 'keyword', time_series_dimension: true },
          cpu_usage: { type: 'float', time_series_metric: 'gauge' },
          memory_usage: { type: 'float', time_series_metric: 'gauge' },
        },
      },
    },
  });
}

async function indexTsdbData({
  esClient,
  dataStreamName,
}: {
  esClient: EsClient;
  dataStreamName: string;
}) {
  const now = new Date().toISOString();
  await esClient.bulk({
    index: dataStreamName,
    operations: [
      { create: {} },
      {
        '@timestamp': now,
        'host.name': 'host-1',
        'service.name': 'service-1',
        cpu_usage: 1,
        memory_usage: 1,
      },
    ],
    refresh: true,
  });
}

async function cleanupTsdbResources({
  esClient,
  templateName,
  streamName,
}: {
  esClient: EsClient;
  templateName: string;
  streamName: string;
}) {
  await esClient.indices.deleteDataStream({ name: streamName }).catch(() => {});
  await esClient.indices.deleteIndexTemplate({ name: templateName }).catch(() => {});
}

test.describe(
  'Stream data retention - custom retention periods',
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

    test.afterAll(async ({ apiServices }) => {
      await apiServices.streams.clearStreamChildren('logs.otel');
    });

    // Smoke test: Verifies the complete retention UI workflow
    // Detailed retention value tests (7d, 30d, 90d, hours, etc.) are covered by API tests
    // in test/scout/api/tests/lifecycle_retention.spec.ts
    test('should set and reset retention policy', async ({ page }) => {
      // Set a specific retention period (DSL delete phase)
      await setCustomRetention(page, '7', 'd');
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('7 days');

      // Reset to indefinite retention by removing the delete phase
      await removeDeletePhase(page);
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('∞');
    });

    // Smoke test: Verifies persistence across page refresh (UI-specific behavior)
    test('should persist retention value across page refresh', async ({ page, pageObjects }) => {
      await setCustomRetention(page, '30', 'd');
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('30 days');

      // Refresh the page
      await pageObjects.streams.gotoDataRetentionTab('logs.otel.nginx');

      // Verify the value persists
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('30 days');
    });

    // Smoke test: Verifies classic stream retention UI workflow
    test('should set retention on classic stream', async ({
      page,
      pageObjects,
      logsSynthtraceEsClient,
      apiServices,
      config,
    }) => {
      await generateLogsData(logsSynthtraceEsClient)({ index: 'logs-generic-default' });
      await apiServices.streams.clearStreamProcessors('logs-generic-default');
      await pageObjects.streams.gotoDataRetentionTab('logs-generic-default');

      // Classic streams inherit their lifecycle from the backing index template,
      // which may resolve to ILM. Switch to DSL so a custom delete phase can be set.
      await ensureDslLifecycle(page);

      await setCustomRetention(page, '7', 'd', {
        expectOverrideConfirmation: config.serverless,
      });
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('7 days');
    });

    // Verifies the inherit lifecycle flyout flow
    test('should switch lifecycle to inherit from parent', async ({ page }) => {
      await setCustomRetention(page, '7', 'd');
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('7 days');

      // Switch to inherit via the lifecycle method flyout
      await openLifecycleMethodFlyout(page);
      await toggleInheritSwitch(page, true);
      await saveRetentionChanges(page);
      await expect(page.getByTestId(RETENTION_TEST_IDS.retentionMetric)).toContainText('∞');
    });

    test('should open DSL lifecycle phase popup and display phase details', async ({
      page,
      config,
    }) => {
      // Set a custom retention to have a DSL lifecycle with a delete phase
      await setCustomRetention(page, '30', 'd');

      // DSL phase label differs: 'Hot' in stateful, 'Successful ingest' in serverless
      // Click on the phase button using test ID
      await page
        .getByTestId(`lifecyclePhase-${config.serverless ? 'Successful ingest' : 'Hot'}-button`)
        .click();

      // Verify the popover opens and shows the expected content
      await expect(
        page.getByTestId(
          `lifecyclePhase-${config.serverless ? 'Successful ingest' : 'Hot'}-popoverTitle`
        )
      ).toBeVisible();
      await expect(
        page.getByTestId(
          `lifecyclePhase-${config.serverless ? 'Successful ingest' : 'Hot'}-popoverContent`
        )
      ).toBeVisible();

      // Close the popover by pressing Escape
      await page.keyboard.press('Escape');
    });

    test('should delete a downsampling step from a DSL lifecycle', async ({
      page,
      esClient,
      apiServices,
      pageObjects,
    }) => {
      // Downsampling UI is only available for TSDB (time_series) streams.
      const streamName = 'streams-dsl-tsdb-delete-step';
      const templateName = `${streamName}-template`;

      await cleanupTsdbResources({ esClient, templateName, streamName });

      try {
        await createTsdbIndexTemplate({
          esClient,
          templateName,
          pattern: `${streamName}*`,
        });
        await indexTsdbData({ esClient, dataStreamName: streamName });

        await expect
          .poll(
            async () => {
              try {
                await apiServices.streams.getStreamDefinition(streamName);
                return true;
              } catch {
                return false;
              }
            },
            { timeout: 15_000, message: `Expected ${streamName} stream definition to exist` }
          )
          .toBe(true);

        const streamDefinition = await apiServices.streams.getStreamDefinition(streamName);
        await apiServices.streams.updateStream(streamName, {
          ingest: {
            ...streamDefinition.stream.ingest,
            processing: omit(streamDefinition.stream.ingest.processing, 'updated_at'),
            lifecycle: {
              dsl: {
                data_retention: '30d',
                downsample: [{ after: '1d', fixed_interval: '1h' }],
              },
            },
          },
        });

        await pageObjects.streams.gotoDataRetentionTab(streamName);

        // Verify downsampling is rendered for the DSL lifecycle
        await expect(page.getByTestId('downsamplingBar-label')).toBeVisible();

        // Delete the downsampling step
        await page.getByTestId('downsamplingPhase-1h-label').click();
        await page.getByTestId('downsamplingPopover-step1-removeButton').click();

        await expect(page.getByTestId('downsamplingBar-emptyLabel')).toBeVisible();
        await expect(page.getByTestId('downsamplingBar-emptyLabel')).toContainText(
          'No downsampling'
        );
      } finally {
        await cleanupTsdbResources({ esClient, templateName, streamName });
      }
    });

    test('should edit a downsampling step in a DSL lifecycle', async ({
      page,
      esClient,
      apiServices,
      pageObjects,
    }) => {
      // Downsampling UI is only available for TSDB (time_series) streams.
      const streamName = 'streams-dsl-tsdb-edit-step';
      const templateName = `${streamName}-template`;

      await cleanupTsdbResources({ esClient, templateName, streamName });

      try {
        await createTsdbIndexTemplate({
          esClient,
          templateName,
          pattern: `${streamName}*`,
        });
        await indexTsdbData({ esClient, dataStreamName: streamName });

        await expect
          .poll(
            async () => {
              try {
                await apiServices.streams.getStreamDefinition(streamName);
                return true;
              } catch {
                return false;
              }
            },
            { timeout: 15_000, message: `Expected ${streamName} stream definition to exist` }
          )
          .toBe(true);

        const streamDefinition = await apiServices.streams.getStreamDefinition(streamName);
        await apiServices.streams.updateStream(streamName, {
          ingest: {
            ...streamDefinition.stream.ingest,
            processing: omit(streamDefinition.stream.ingest.processing, 'updated_at'),
            lifecycle: {
              dsl: {
                data_retention: '30d',
                downsample: [{ after: '1d', fixed_interval: '1h' }],
              },
            },
          },
        });

        await pageObjects.streams.gotoDataRetentionTab(streamName);

        // Open the downsampling step popover and edit the step
        await page.getByTestId('downsamplingPhase-1h-label').click();
        await page.getByTestId('downsamplingPopover-step1-editButton').click();

        await expect(page.getByTestId('streamsEditDslStepsFlyoutFromSummary')).toBeVisible();
        const stepPanel = page.getByTestId('streamsEditDslStepsFlyoutFromSummaryPanel-step-0');
        await expect(stepPanel).toBeVisible();

        await stepPanel
          .getByTestId('streamsEditDslStepsFlyoutFromSummaryFixedIntervalValue')
          .fill('2');
        await stepPanel
          .getByTestId('streamsEditDslStepsFlyoutFromSummaryFixedIntervalUnit')
          .selectOption('h');

        await page.getByTestId('streamsEditDslStepsFlyoutFromSummarySaveButton').click();

        await expect(page.getByTestId('streamsEditDslStepsFlyoutFromSummary')).toHaveCount(0);
        await expect(page.getByTestId('downsamplingPhase-2h-label')).toBeVisible();
        await expect(page.getByTestId('downsamplingPhase-1h-label')).toHaveCount(0);
      } finally {
        await cleanupTsdbResources({ esClient, templateName, streamName });
      }
    });
  }
);
