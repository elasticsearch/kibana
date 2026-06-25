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
  openLifecycleMethodFlyout,
  RETENTION_TEST_IDS,
  saveRetentionChanges,
  selectIlmPolicy,
  toggleInheritSwitch,
} from '../../../fixtures/data_lifecycle_helpers';

test.describe('Stream data retention - ILM policy', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ apiServices }) => {
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

  test('should show ILM method card', async ({ page }) => {
    await openLifecycleMethodFlyout(page);
    await toggleInheritSwitch(page, false);
    await expect(page.getByTestId(RETENTION_TEST_IDS.methodCardIlm)).toBeVisible();
  });

  test('should select and save ILM policy', async ({ page }) => {
    await openLifecycleMethodFlyout(page);
    await toggleInheritSwitch(page, false);
    await selectIlmPolicy(page, '.alerts-ilm-policy');

    // Save changes
    await saveRetentionChanges(page);

    // Subtitle is phase/downsampling counts only (policy name is shown in the header badge).
    await expect
      .poll(async () => page.getByTestId('retention-metric-subtitle').textContent())
      .toMatch(/data phases?/);
  });

  test('should display selected ILM policy name', async ({ page }) => {
    await openLifecycleMethodFlyout(page);
    await toggleInheritSwitch(page, false);
    await selectIlmPolicy(page, '.alerts-ilm-policy');

    // Save changes
    await saveRetentionChanges(page);

    // Verify the policy name is displayed using the badge test ID
    await expect(page.getByTestId('lifecycleBadge-logs.otel.nginx')).toContainText(
      '.alerts-ilm-policy'
    );
  });

  test('should persist ILM policy selection across page reload', async ({ page, pageObjects }) => {
    await openLifecycleMethodFlyout(page);
    await toggleInheritSwitch(page, false);
    await selectIlmPolicy(page, '.alerts-ilm-policy');
    await saveRetentionChanges(page);

    // Reload page
    await pageObjects.streams.gotoDataRetentionTab('logs.otel.nginx');

    // Verify ILM policy persists (policy name in header badge; subtitle is phase/downsampling counts only)
    await expect
      .poll(async () => page.getByTestId('retention-metric-subtitle').textContent())
      .toMatch(/data phases?/);
    await expect(page.getByTestId('lifecycleBadge-logs.otel.nginx')).toContainText(
      '.alerts-ilm-policy'
    );
  });

  test('should open ILM lifecycle phase popup and display phase details', async ({ page }) => {
    // First set an ILM policy
    await openLifecycleMethodFlyout(page);
    await toggleInheritSwitch(page, false);
    await selectIlmPolicy(page, '.alerts-ilm-policy');
    await saveRetentionChanges(page);

    // Click on the hot phase button using test ID
    await page.getByTestId('lifecyclePhase-hot-button').click();

    // Verify the popover opens and shows the expected content
    await expect(page.getByTestId('lifecyclePhase-hot-popoverTitle')).toBeVisible();
    await expect(page.getByTestId('lifecyclePhase-hot-popoverContent')).toBeVisible();

    // Close the popover by pressing Escape
    await page.keyboard.press('Escape');
  });

  /* eslint-disable playwright/max-nested-describe */
  test.describe('downsampling tests', () => {
    const TSDB_STREAM = 'streams-ilm-downsampling-shared';
    const TSDB_OTHER_STREAM = `${TSDB_STREAM}-other`;
    const TSDB_TEMPLATE = `${TSDB_STREAM}-template`;

    test.beforeAll(async ({ esClient }) => {
      await esClient.indices.deleteDataStream({ name: TSDB_STREAM }).catch(() => {});
      await esClient.indices.deleteDataStream({ name: TSDB_OTHER_STREAM }).catch(() => {});
      await esClient.indices.deleteIndexTemplate({ name: TSDB_TEMPLATE }).catch(() => {});

      await esClient.indices.putIndexTemplate({
        name: TSDB_TEMPLATE,
        index_patterns: [`${TSDB_STREAM}*`],
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

      const now = new Date().toISOString();
      const operations = [
        { create: {} },
        {
          '@timestamp': now,
          'host.name': 'host-1',
          'service.name': 'service-1',
          cpu_usage: 1,
          memory_usage: 1,
        },
      ];

      await esClient.bulk({ index: TSDB_STREAM, operations, refresh: true });
      await esClient.bulk({ index: TSDB_OTHER_STREAM, operations, refresh: true });
    });

    test.beforeEach(async ({ apiServices }) => {
      // Reset TSDB_STREAM lifecycle between tests to prevent state from leaking
      // across the shared stream (e.g. ILM policy applied by a previous test)
      const streamDefinition = await apiServices.streams.getStreamDefinition(TSDB_STREAM);
      await apiServices.streams.updateStream(TSDB_STREAM, {
        ingest: {
          ...streamDefinition.stream.ingest,
          processing: omit(streamDefinition.stream.ingest.processing, 'updated_at'),
          lifecycle: { dsl: {} },
        },
      });
    });

    test.afterAll(async ({ esClient }) => {
      await esClient.indices.deleteDataStream({ name: TSDB_STREAM }).catch(() => {});
      await esClient.indices.deleteDataStream({ name: TSDB_OTHER_STREAM }).catch(() => {});
      await esClient.indices.deleteIndexTemplate({ name: TSDB_TEMPLATE }).catch(() => {});
    });

    test('should delete a downsampling step from an ILM policy', async ({
      page,
      esClient,
      pageObjects,
    }) => {
      const policyName = 'downsampling-policy';

      await esClient.ilm.deleteLifecycle({ name: policyName }).catch(() => {});
      await esClient.ilm.putLifecycle({
        name: policyName,
        policy: {
          phases: {
            hot: {
              actions: {
                rollover: { max_age: '30d' },
              },
            },
            warm: {
              min_age: '1d',
              actions: {
                downsample: { fixed_interval: '1h' },
              },
            },
            delete: {
              min_age: '7d',
              actions: {
                delete: {},
              },
            },
          },
        },
      });

      try {
        await esClient.indices.putDataStreamSettings({
          name: TSDB_OTHER_STREAM,
          settings: { 'index.lifecycle.name': policyName, 'index.lifecycle.prefer_ilm': true },
        });

        await pageObjects.streams.gotoDataRetentionTab(TSDB_STREAM);

        await openLifecycleMethodFlyout(page);
        await toggleInheritSwitch(page, false);
        await selectIlmPolicy(page, policyName);
        await saveRetentionChanges(page);

        // Verify downsampling is rendered for the policy
        await expect(page.getByTestId('downsamplingBar-label')).toBeVisible();

        // Delete the downsampling step from the policy
        await page.getByTestId('downsamplingPhase-1h-label').click();
        await page.getByTestId('downsamplingPopover-step1-removeButton').click();

        await expect(page.getByTestId('editPolicyModalTitle')).toBeVisible();
        await page.getByTestId('editPolicyModal-overwriteButton').click();

        await expect(page.getByTestId('lifecyclePhase-warm-button')).toBeVisible();
        await expect(page.getByTestId('downsamplingBar-emptyLabel')).toBeVisible();
        await expect(page.getByTestId('downsamplingBar-emptyLabel')).toContainText(
          'No downsampling'
        );
      } finally {
        await esClient.ilm.deleteLifecycle({ name: policyName }).catch(() => {});
      }
    });

    test('should create a new policy when deleting a downsampling step', async ({
      page,
      esClient,
      pageObjects,
    }) => {
      const policyName = 'downsampling-policy';
      const newPolicyName = `${policyName}-copy`;

      await esClient.ilm.deleteLifecycle({ name: policyName }).catch(() => {});
      await esClient.ilm.deleteLifecycle({ name: newPolicyName }).catch(() => {});
      await esClient.ilm.putLifecycle({
        name: policyName,
        policy: {
          phases: {
            hot: {
              actions: {
                rollover: { max_age: '30d' },
              },
            },
            warm: {
              min_age: '1d',
              actions: {
                downsample: { fixed_interval: '1h' },
              },
            },
            delete: {
              min_age: '7d',
              actions: {
                delete: {},
              },
            },
          },
        },
      });

      try {
        await esClient.indices.putDataStreamSettings({
          name: TSDB_OTHER_STREAM,
          settings: { 'index.lifecycle.name': policyName, 'index.lifecycle.prefer_ilm': true },
        });

        await pageObjects.streams.gotoDataRetentionTab(TSDB_STREAM);

        await openLifecycleMethodFlyout(page);
        await toggleInheritSwitch(page, false);
        await selectIlmPolicy(page, policyName);
        await saveRetentionChanges(page);

        // Verify downsampling is rendered for the policy
        await expect(page.getByTestId('downsamplingBar-label')).toBeVisible();

        // Delete the downsampling step from the policy
        await page.getByTestId('downsamplingPhase-1h-label').click();
        await page.getByTestId('downsamplingPopover-step1-removeButton').click();

        await expect(page.getByTestId('editPolicyModalTitle')).toBeVisible();
        await page.getByTestId('editPolicyModal-saveAsNewButton').click();

        await expect(page.getByTestId('createPolicyModalTitle')).toBeVisible();
        await page.getByTestId('createPolicyModal-policyNameInput').fill(newPolicyName);
        await page.getByTestId('createPolicyModal-saveButton').click();

        await expect(page.getByTestId(`lifecycleBadge-${TSDB_STREAM}`)).toContainText(
          newPolicyName
        );
        await expect(page.getByTestId('downsamplingBar-emptyLabel')).toBeVisible();
        await expect(page.getByTestId('downsamplingBar-emptyLabel')).toContainText(
          'No downsampling'
        );
      } finally {
        await esClient.ilm.deleteLifecycle({ name: policyName }).catch(() => {});
        await esClient.ilm.deleteLifecycle({ name: newPolicyName }).catch(() => {});
      }
    });

    test('should edit a policy phase, add downsampling, and save', async ({
      page,
      esClient,
      pageObjects,
    }) => {
      const policyName = 'downsampling-policy-edit';

      await esClient.ilm.deleteLifecycle({ name: policyName }).catch(() => {});
      await esClient.ilm.putLifecycle({
        name: policyName,
        policy: {
          phases: {
            hot: {
              actions: {
                rollover: { max_age: '30d' },
              },
            },
            warm: {
              min_age: '1d',
              actions: {},
            },
            delete: {
              min_age: '7d',
              actions: {
                delete: {},
              },
            },
          },
        },
      });

      try {
        await esClient.indices.putDataStreamSettings({
          name: TSDB_OTHER_STREAM,
          settings: { 'index.lifecycle.name': policyName, 'index.lifecycle.prefer_ilm': true },
        });

        await pageObjects.streams.gotoDataRetentionTab(TSDB_STREAM);

        await openLifecycleMethodFlyout(page);
        await toggleInheritSwitch(page, false);
        await selectIlmPolicy(page, policyName);
        await saveRetentionChanges(page);

        // Verify there is no downsampling step before editing (empty state is always rendered for TSDB)
        await expect(page.getByTestId('downsamplingBar-emptyLabel')).toBeVisible();
        await expect(page.getByTestId('downsamplingBar-emptyLabel')).toContainText(
          'No downsampling'
        );

        // Edit warm phase and enable downsampling
        await page.getByTestId('lifecyclePhase-warm-button').click();
        await expect(page.getByTestId('lifecyclePhase-warm-editButton')).toBeVisible();
        await page.getByTestId('lifecyclePhase-warm-editButton').click();

        const flyout = page.getByTestId('streamsEditIlmPhasesFlyoutFromSummary');
        await expect(flyout).toBeVisible();
        await page.getByTestId('streamsEditIlmPhasesFlyoutFromSummaryTab-warm').click();

        // Scope to the visible "Downsampling" section (hot/warm/cold all exist in the DOM)
        const downsamplingToggle = page.locator(
          '[data-test-subj="streamsEditIlmPhasesFlyoutFromSummaryDownsamplingSwitch"]:visible'
        );
        await expect(downsamplingToggle).toBeVisible();
        await downsamplingToggle.click();

        // Set an explicit interval to keep the rendered step deterministic
        const intervalValue = page.locator(
          '[data-test-subj="streamsEditIlmPhasesFlyoutFromSummaryDownsamplingIntervalValue"]:visible'
        );
        await expect(intervalValue).toBeVisible();
        await intervalValue.fill('1');

        const intervalUnit = page.locator(
          '[data-test-subj="streamsEditIlmPhasesFlyoutFromSummaryDownsamplingIntervalUnit"]:visible'
        );
        await intervalUnit.selectOption('d');

        await page.getByTestId('streamsEditIlmPhasesFlyoutFromSummarySaveButton').click();

        await expect(page.getByTestId('editPolicyModalTitle')).toBeVisible();
        await page.getByTestId('editPolicyModal-overwriteButton').click();

        // Verify downsampling is rendered after saving edits
        await expect(page.getByTestId('downsamplingBar-label')).toBeVisible();
        await expect(page.getByTestId('downsamplingPhase-1d-label')).toBeVisible();
      } finally {
        await esClient.ilm.deleteLifecycle({ name: policyName }).catch(() => {});
      }
    });
  });
});
