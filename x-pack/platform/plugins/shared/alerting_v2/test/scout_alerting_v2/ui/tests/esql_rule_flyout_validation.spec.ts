/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test } from '../fixtures';

const SAMPLE_DATA_SET = 'ecommerce';

/**
 * ES|QL rule flyout validation — covers the ?param resolution logic in
 * alerting-v2-rule-form/utils/esql_rule_utils.ts. The unit-level coverage lives
 * in esql_rule_utils.test.ts; these tests verify the resulting UI state (callout
 * visibility, save button enabled/disabled) end-to-end in the browser.
 */
test.describe('ES|QL rule flyout — ?param validation', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ apiServices }) => {
    await apiServices.sampleData.install(SAMPLE_DATA_SET);
  });

  test.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsAlertingV2Editor();
    await pageObjects.discover.goto();
  });

  test.afterAll(async ({ apiServices }) => {
    await apiServices.sampleData.remove(SAMPLE_DATA_SET);
  });

  test('save button is enabled and no callout shown when query has no ?params', async ({
    pageObjects,
  }) => {
    await test.step('run a plain ES|QL query with no parameters', async () => {
      await pageObjects.discover.writeAndSubmitEsqlQuery(
        'FROM kibana_sample_data_ecommerce | WHERE true | LIMIT 10'
      );
      await pageObjects.discover.waitUntilSearchingHasFinished();
    });

    await test.step('open the Create ES|QL rule flyout', async () => {
      await pageObjects.ruleForm.openRulesFlyoutFromDiscover();
      await expect(pageObjects.ruleForm.flyout).toBeVisible();
    });

    await test.step('validation callout must not be visible', async () => {
      await expect(pageObjects.ruleForm.flyoutValidationCallout).toBeHidden();
    });

    await test.step('save button must be enabled', async () => {
      await expect(pageObjects.ruleForm.flyoutSaveButton).toBeEnabled();
    });
  });

  test('save button is disabled and callout lists unresolved ?param when no matching control exists', async ({
    pageObjects,
  }) => {
    await test.step('run an ES|QL query with an unresolved ?param', async () => {
      await pageObjects.discover.writeAndSubmitEsqlQuery(
        'FROM kibana_sample_data_ecommerce | WHERE true | LIMIT ?limit'
      );
      await pageObjects.discover.waitUntilSearchingHasFinished();
    });

    await test.step('open the Create ES|QL rule flyout', async () => {
      await pageObjects.ruleForm.openRulesFlyoutFromDiscover();
      await expect(pageObjects.ruleForm.flyout).toBeVisible();
    });

    await test.step('validation callout must be visible and mention ?limit', async () => {
      await expect(pageObjects.ruleForm.flyoutValidationCallout).toBeVisible();
      await expect(pageObjects.ruleForm.flyoutValidationCallout).toContainText('?limit');
    });

    await test.step('save button must be disabled', async () => {
      await expect(pageObjects.ruleForm.flyoutSaveButton).toBeDisabled();
    });
  });
});
