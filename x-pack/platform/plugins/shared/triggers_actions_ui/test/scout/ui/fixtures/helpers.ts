/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient, ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

/**
 * Fills the mandatory fields of the .index-threshold rule form so the rule can
 * be saved without validation errors.
 *
 * Opens the index popover, picks the first index option after typing '.kibana',
 * waits for the time-field <select> to populate, and selects the first real
 * date field.
 */
export const fillIndexThresholdForm = async (page: ScoutPage, name: string) => {
  await page.testSubj.locator('ruleDetailsNameInput').fill(name);

  await page.testSubj.click('selectIndexExpression');

  // Type to trigger the debounced index search (250 ms debounce).
  const comboInput = page.testSubj.locator('thresholdIndexesComboBox').locator('input');
  await comboInput.fill('.kibana');

  // Wait for the listbox to appear; even if no real indices match, the "Choose…"
  // fallback group always renders the typed pattern as a selectable option.
  const listbox = page.locator('[role="listbox"]');
  await listbox.waitFor({ state: 'visible', timeout: 15_000 });
  await listbox.locator('[role="option"]:first-child').click();

  // After index selection the form calls getFieldsForWildcard async.
  // Wait for at least one real time-field option to appear (index 0 is the
  // "Select a field" placeholder, index 1 is the first real date field).
  const timeFieldSelect = page.testSubj.locator('thresholdAlertTimeFieldSelect');
  await expect(timeFieldSelect.locator('option:nth-child(2)')).toBeAttached({ timeout: 15_000 });

  const firstFieldValue = await timeFieldSelect
    .locator('option:nth-child(2)')
    .getAttribute('value');
  await timeFieldSelect.selectOption(firstFieldValue!);

  await page.testSubj.click('closePopover');
};

interface RuleFindResponse {
  data: Array<{ id: string; name: string }>;
}

export const findRuleIdByName = async (
  kbnClient: KbnClient,
  name: string
): Promise<string | undefined> => {
  const res = await kbnClient.request<RuleFindResponse>({
    method: 'GET',
    path: `/api/alerting/rules/_find?search=${encodeURIComponent(name)}&search_fields=name`,
    headers: { 'kbn-xsrf': 'scout' },
  });
  return res.data?.data?.find((r) => r.name === name)?.id;
};

export const deleteRuleById = async (kbnClient: KbnClient, id: string) => {
  await kbnClient.request({
    method: 'DELETE',
    path: `/api/alerting/rule/${id}`,
    headers: { 'kbn-xsrf': 'scout' },
    ignoreErrors: [404],
  });
};

export const deleteRulesByPrefix = async (kbnClient: KbnClient, prefix: string) => {
  const res = await kbnClient.request<RuleFindResponse>({
    method: 'GET',
    path: `/api/alerting/rules/_find?search=${encodeURIComponent(
      prefix
    )}&search_fields=name&per_page=100`,
    headers: { 'kbn-xsrf': 'scout' },
  });
  const stale = res.data?.data?.filter((r) => r.name.startsWith(prefix)) ?? [];
  await Promise.allSettled(stale.map((r) => deleteRuleById(kbnClient, r.id)));
};

export const THRESHOLD_TEST_INDEX = 'scout-threshold-rule-test';

// Fills the index-threshold rule form to a state where save is enabled:
// name + THRESHOLD_TEST_INDEX + time field (first non-placeholder option).
// Callers must create THRESHOLD_TEST_INDEX (with @timestamp mapping) in beforeAll.
// Used in both rules_create_flow.spec.ts and connector_slack.spec.ts.
export const defineIndexThresholdRule = async (
  page: ScoutPage,
  name: string,
  indexName: string = THRESHOLD_TEST_INDEX
) => {
  await page.testSubj.click('createRuleButton');
  await page.testSubj.locator('ruleTypeModal').waitFor({ state: 'visible' });
  await page.testSubj.click('.index-threshold-SelectOption');
  await page.testSubj.locator('ruleForm').waitFor({ state: 'visible' });

  await page.testSubj.locator('ruleDetailsNameInput').fill(name);

  await page.testSubj.click('selectIndexExpression');
  const indexCombo = page.testSubj.locator('thresholdIndexesComboBox');
  await indexCombo.waitFor({ state: 'visible' });

  await indexCombo.locator('[data-test-subj="comboBoxInput"]').click();

  // Type all but the last character so the "custom pattern" option gets
  // title = indexName.slice(0,-1), which differs from the real index title.
  // That makes .euiComboBoxOption[title="${indexName}"] match exactly one element.
  await indexCombo
    .locator('[data-test-subj="comboBoxSearchInput"]')
    .pressSequentially(indexName.slice(0, -1), { delay: 50 });
  const indexOption = page.testSubj.locator(`thresholdIndexOption-${indexName}`);
  await indexOption.waitFor({ state: 'visible', timeout: 30000 });
  await indexOption.click();

  const timeFieldSelect = page.testSubj.locator('thresholdAlertTimeFieldSelect');
  await timeFieldSelect.waitFor({ state: 'visible' });
  const firstOptionValue = await timeFieldSelect
    .locator('option:nth-child(2)')
    .getAttribute('value');
  if (!firstOptionValue) {
    throw new Error('No time-field options available on thresholdAlertTimeFieldSelect');
  }
  await timeFieldSelect.selectOption(firstOptionValue);

  await page.testSubj.click('closePopover');
};

export const makeEsQueryRule = (namePrefix: string) => ({
  name: `${namePrefix}-rule-${Date.now()}`,
  ruleTypeId: '.es-query',
  consumer: 'stackAlerts',
  params: {
    searchType: 'esQuery' as const,
    timeWindowSize: 5,
    timeWindowUnit: 'm',
    threshold: [0],
    thresholdComparator: '>',
    size: 100,
    esQuery: '{"query":{"match_all":{}}}',
    aggType: 'count',
    groupBy: 'all',
    termSize: 5,
    excludeHitsFromPreviousRun: false,
    sourceFields: [],
    index: ['.kibana'],
    timeField: 'updated_at',
  },
  schedule: { interval: '1m' },
  tags: [namePrefix],
});

export const makeIndexThresholdRule = (namePrefix: string) => ({
  name: `${namePrefix}-rule-${Date.now()}`,
  ruleTypeId: '.index-threshold',
  consumer: 'alerts',
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
    threshold: [1000],
    index: ['.kibana'],
    timeField: '@timestamp',
  },
});
