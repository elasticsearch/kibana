/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../../fixtures';
import { ALERTS_TABLE_STORAGE_KEY } from '../../fixtures/constants';
import { generateObservabilityAlerts } from '../../fixtures/alerts_data';

// Default columns rendered by the Observability alerts table, keyed by the
// alerts-as-data field id used in each `dataGridHeaderCell-<id>` test subject.
const DEFAULT_COLUMN_IDS = [
  'kibana.alert.status',
  'kibana.alert.start',
  'kibana.alert.duration.us',
  'kibana.alert.rule.name',
  'kibana.alert.instance.id',
  'kibana.alert.evaluation.value',
  'kibana.alert.evaluation.threshold',
  'tags',
  'kibana.alert.workflow_tags',
  'kibana.alert.reason',
];

// A previously-persisted table configuration blob (mirrors the FTR fixture).
const PERSISTED_TABLE_CONFIG = JSON.stringify({
  columns: [
    {
      displayAsText: 'Alert Status',
      id: 'kibana.alert.status',
      initialWidth: 120,
      schema: 'string',
    },
    { displayAsText: 'Triggered', id: 'kibana.alert.start', initialWidth: 190, schema: 'datetime' },
    {
      displayAsText: 'Duration',
      id: 'kibana.alert.duration.us',
      initialWidth: 70,
      schema: 'numeric',
    },
    {
      displayAsText: 'Rule name',
      id: 'kibana.alert.rule.name',
      initialWidth: 150,
      schema: 'string',
    },
    { displayAsText: 'Group', id: 'kibana.alert.instance.id', initialWidth: 100, schema: 'string' },
    {
      displayAsText: 'Observed value',
      id: 'kibana.alert.evaluation.value',
      initialWidth: 100,
      schema: 'conflict',
    },
    {
      displayAsText: 'Threshold',
      id: 'kibana.alert.evaluation.threshold',
      initialWidth: 100,
      schema: 'numeric',
    },
    { displayAsText: 'Tags', id: 'tags', initialWidth: 150, schema: 'string' },
    { displayAsText: 'Reason', id: 'kibana.alert.reason', schema: 'string' },
  ],
  sort: [{ 'kibana.alert.start': { order: 'desc' } }],
  visibleColumns: [
    'kibana.alert.status',
    'kibana.alert.start',
    'kibana.alert.duration.us',
    'kibana.alert.rule.name',
    'kibana.alert.instance.id',
    'kibana.alert.evaluation.value',
    'kibana.alert.evaluation.threshold',
    'tags',
    'kibana.alert.reason',
  ],
});

// Ported from the FTR `Observability alerts table configuration` suite
// (x-pack/solutions/observability/test/observability_functional/apps/observability/pages/alerts/table_configuration.ts).
// Uses an admin session to match the FTR superuser so all row actions render.
test.describe(
  'Observability alerts - table configuration',
  { tag: [...tags.stateful.classic] },
  () => {
    test.beforeAll(async ({ esClient }) => {
      await generateObservabilityAlerts(esClient);
    });

    test.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsAdmin();
      await pageObjects.alertsTablePage.goto();
    });

    test('renders without error from a pre-existing persisted configuration', async ({
      page,
      pageObjects,
    }) => {
      const { alertsTablePage } = pageObjects;
      await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
        ALERTS_TABLE_STORAGE_KEY,
        PERSISTED_TABLE_CONFIG,
      ] as const);
      try {
        await alertsTablePage.goto();
        await expect(alertsTablePage.table).toBeVisible();
        await expect(alertsTablePage.errorPrompt).toBeHidden();
      } finally {
        await page.evaluate((key) => window.localStorage.removeItem(key), ALERTS_TABLE_STORAGE_KEY);
      }
    });

    test('renders the default columns', async ({ page, pageObjects }) => {
      await pageObjects.alertsTablePage.waitForTableToLoad();
      for (const columnId of DEFAULT_COLUMN_IDS) {
        await expect(page.testSubj.locator(`dataGridHeaderCell-${columnId}`)).toBeAttached();
      }
    });

    test('renders the group selector', async ({ pageObjects }) => {
      await pageObjects.alertsTablePage.waitForTableToLoad();
      await expect(pageObjects.alertsTablePage.groupSelector).toBeVisible();
    });

    test('renders the expected row actions', async ({ page, pageObjects }) => {
      await pageObjects.alertsTablePage.waitForTableToLoad();
      await pageObjects.alertsTablePage.openActionsMenuForRow(0);
      for (const action of [
        'add-to-existing-case-action',
        'add-to-new-case-action',
        'viewRuleDetails',
        'viewAlertDetailsPage',
        'untrackAlert',
        'alertSnoozePopoverTrigger',
      ]) {
        await expect(page.testSubj.locator(action)).toBeAttached();
      }
    });

    test('remembers hidden columns across navigations', async ({ page, pageObjects }) => {
      const { alertsTablePage } = pageObjects;
      await alertsTablePage.waitForTableToLoad();
      await alertsTablePage.dataGrid.doActionOnColumn('kibana.alert.duration.us', 'Hide column');

      await alertsTablePage.goto();
      await expect(
        page.testSubj.locator('dataGridHeaderCell-kibana.alert.duration.us')
      ).toBeHidden();
    });

    test('remembers sorting changes across navigations', async ({ page, pageObjects }) => {
      const { alertsTablePage } = pageObjects;
      await alertsTablePage.waitForTableToLoad();
      await alertsTablePage.dataGrid.doActionOnColumn('kibana.alert.start', 'Sort Old-New');

      await alertsTablePage.goto();
      await expect(page.testSubj.locator('dataGridHeaderCell-kibana.alert.start')).toHaveAttribute(
        'aria-sort',
        'ascending'
      );
    });
  }
);
