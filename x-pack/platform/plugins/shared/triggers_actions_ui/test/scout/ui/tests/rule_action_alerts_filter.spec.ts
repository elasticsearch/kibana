/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient, ScoutPage } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import {
  test,
  defineIndexThresholdRule,
  THRESHOLD_TEST_INDEX,
  findRuleIdByName,
  deleteRuleById,
} from '../fixtures';

const STATEFUL_ALERTS_INDEX_PATTERN = '.internal.alerts-stack.alerts-*';
const INDEX_THRESHOLD_RULE_TYPE_ID = '.index-threshold';
const FILTER_FIELD = 'kibana.alert.action_group';
const FILTER_VALUES = ['value-one', 'value-two', 'value-three'];

interface BrowserFieldsResponse {
  fields: Array<{ name: string }>;
}

const waitForAlertsBrowserField = async (
  kbnClient: KbnClient,
  fieldName: string,
  ruleTypeId: string = INDEX_THRESHOLD_RULE_TYPE_ID
) => {
  await expect(async () => {
    const response = await kbnClient.request<BrowserFieldsResponse>({
      method: 'GET',
      path: `/internal/rac/alerts/browser_fields?ruleTypeIds=${encodeURIComponent(ruleTypeId)}`,
      headers: { 'kbn-xsrf': 'scout' },
    });
    const fieldNames = response.data?.fields?.map((field) => field.name) ?? [];
    expect(fieldNames).toContain(fieldName);
  }).toPass({ timeout: 90_000 });
};

const selectConnectorInRuleAction = async (page: ScoutPage, connectorName: string) => {
  await page.testSubj.click('ruleActionsAddActionButton');
  await expect(page.testSubj.locator('ruleActionsConnectorsModal')).toBeVisible();
  await page.testSubj
    .locator('ruleActionsConnectorsModal')
    .getByRole('button', { name: connectorName })
    .click();
};

test.describe('Rule action alerts filter', { tag: tags.stateful.classic }, () => {
  const createdConnectorIds: string[] = [];
  const createdRuleNames: string[] = [];
  let setupRuleId: string;

  test.beforeAll(async ({ esClient, apiServices, kbnClient }) => {
    test.setTimeout(180_000);
    await esClient.indices.create(
      {
        index: THRESHOLD_TEST_INDEX,
        mappings: { properties: { '@timestamp': { type: 'date' } } },
      },
      { ignore: [400] }
    );
    await esClient.index({
      index: THRESHOLD_TEST_INDEX,
      document: { '@timestamp': new Date().toISOString() },
    });
    await esClient.indices.refresh({ index: THRESHOLD_TEST_INDEX });

    const setupRule = await apiServices.alerting.rules.create({
      name: `scout-is-one-of-setup-${Date.now()}`,
      ruleTypeId: INDEX_THRESHOLD_RULE_TYPE_ID,
      consumer: 'stackAlerts',
      enabled: true,
      schedule: { interval: '1m' },
      actions: [],
      params: {
        aggType: 'count',
        termSize: 5,
        thresholdComparator: '>',
        timeWindowSize: 5,
        timeWindowUnit: 'm',
        groupBy: 'all',
        threshold: [0],
        index: [THRESHOLD_TEST_INDEX],
        timeField: '@timestamp',
      },
    });
    setupRuleId = setupRule.data.id;
    await apiServices.alerting.rules.runSoon(setupRuleId);
    await expect(async () => {
      const result = await esClient.search({
        index: STATEFUL_ALERTS_INDEX_PATTERN,
        query: {
          term: {
            'kibana.alert.rule.uuid': setupRuleId,
          },
        },
      });
      expect(result.hits.hits.length).toBeGreaterThan(0);
    }).toPass({ timeout: 90_000 });
    await esClient.indices.refresh({ index: STATEFUL_ALERTS_INDEX_PATTERN });
    await waitForAlertsBrowserField(kbnClient, FILTER_FIELD);
  });

  test.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsAdmin();
  });

  test.afterEach(async ({ kbnClient }) => {
    for (const name of createdRuleNames) {
      const id = await findRuleIdByName(kbnClient, name);
      if (id) {
        await deleteRuleById(kbnClient, id);
      }
    }
    createdRuleNames.length = 0;
  });

  test.afterAll(async ({ apiServices, esClient }) => {
    if (setupRuleId) {
      try {
        await esClient.deleteByQuery({
          index: STATEFUL_ALERTS_INDEX_PATTERN,
          refresh: true,
          conflicts: 'proceed',
          query: {
            term: {
              'kibana.alert.rule.uuid': setupRuleId,
            },
          },
        });
      } catch {
        // Continue cleanup even if alert deletion fails
      }

      try {
        await apiServices.alerting.rules.delete(setupRuleId);
      } catch {
        // Continue cleanup even if rule deletion fails
      }
    }
    await Promise.allSettled(
      createdConnectorIds.map((id) => apiServices.alerting.connectors.delete(id))
    );
    createdConnectorIds.length = 0;
    await esClient.indices.delete({ index: THRESHOLD_TEST_INDEX }, { ignore: [404] });
  });

  test('saves a rule with an is-one-of conditional action filter', async ({
    page,
    pageObjects,
    apiServices,
    kbnClient,
  }) => {
    test.setTimeout(120_000);
    const connectorName = `scout-is-one-of-${Date.now()}`;
    const created = await apiServices.alerting.connectors.create({
      name: connectorName,
      connectorTypeId: '.slack',
      config: {},
      secrets: { webhookUrl: 'https://test.com' },
    });
    createdConnectorIds.push(created.id);

    const ruleName = `scout-is-one-of-${Date.now()}`;
    createdRuleNames.push(ruleName);

    await page.gotoApp('rules');
    await defineIndexThresholdRule(page, ruleName);
    await selectConnectorInRuleAction(page, connectorName);

    const browserFieldsResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/internal/rac/alerts/browser_fields') && response.status() === 200
    );
    await page.testSubj.locator('alertsFilterQueryToggle').scrollIntoViewIfNeeded();
    await page.testSubj.click('alertsFilterQueryToggle');
    await browserFieldsResponse;
    await expect(page.testSubj.locator('addFilter')).toBeVisible();

    await pageObjects.filterBar.openFilterBuilder();
    await page.testSubj.click('filterFieldSuggestionList');
    await page.testSubj.typeWithDelay(
      'filterFieldSuggestionList > comboBoxSearchInput',
      FILTER_FIELD
    );
    await expect(page.testSubj.locator(`filterFieldOption-${FILTER_FIELD}`)).toBeVisible({
      timeout: 15_000,
    });
    await page.testSubj.click(`filterFieldOption-${FILTER_FIELD}`);
    await page.testSubj.typeWithDelay('filterOperatorList > comboBoxSearchInput', 'is one of');
    await page.testSubj.click('filterOperatorOption-is one of');

    const filterValueInput = page
      .locator('[data-test-subj="filter-0"]')
      .locator('[data-test-subj="filterParams"] input');
    for (const value of FILTER_VALUES) {
      await filterValueInput.fill(value);
      await filterValueInput.press('Enter');
    }
    await pageObjects.filterBar.saveAndCloseFilterBuilder();

    await page.testSubj.locator('queryInput').fill('_id: *');

    await page.testSubj.click('rulePageFooterSaveButton');
    await page.testSubj
      .locator('confirmModalConfirmButton')
      .click({ timeout: 3000 })
      .catch(() => {});

    await expect(page.testSubj.locator('euiToastHeader__title')).toContainText(
      `Created rule "${ruleName}"`
    );

    const ruleId = await findRuleIdByName(kbnClient, ruleName);
    expect(ruleId).toBeDefined();

    const saved = await apiServices.alerting.rules.get(ruleId!);
    const savedFilter = saved.data.actions[0].alerts_filter.query.filters[0];
    expect(savedFilter.meta.value).toBeUndefined();

    await page.gotoApp('rules');
    await page.testSubj.locator(`checkboxSelectRow-${ruleId}`).hover();
    await page.testSubj.click('editActionHoverButton');
    await expect(page.testSubj.locator('ruleForm')).toBeVisible();

    await page.testSubj.locator('alertsFilterQueryToggle').scrollIntoViewIfNeeded();
    await expect(page.testSubj.locator('alertsFilterQueryToggle')).toBeChecked();

    const filterLabels = await pageObjects.filterBar.getFiltersLabel();
    const filterLabel = filterLabels.find((label) => label.includes(FILTER_FIELD));
    expect(filterLabel).toBeDefined();
    if (!filterLabel) {
      throw new Error(`Expected filter label for ${FILTER_FIELD}`);
    }
    for (const value of FILTER_VALUES) {
      expect(filterLabel).toContain(value);
    }
  });
});
