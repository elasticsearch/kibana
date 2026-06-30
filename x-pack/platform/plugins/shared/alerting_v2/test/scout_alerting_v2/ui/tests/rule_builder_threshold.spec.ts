/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { buildCreateRuleData, test } from '../fixtures';

const TEST_INDEX = 'test-rule-builder';
const RULE_NAME = 'scout-rule-builder-create';
const EDIT_RULE_NAME = 'scout-rule-builder-edit';
const EDITED_RULE_NAME = 'scout-rule-builder-edited';

test.describe(
  'Rule Builder — threshold create and edit flows',
  { tag: '@local-stateful-classic' },
  () => {
    test.beforeAll(async ({ esClient, apiServices }) => {
      await apiServices.alertingV2.rules.cleanUp();
      await esClient.indices.create(
        {
          index: TEST_INDEX,
          mappings: {
            properties: {
              '@timestamp': { type: 'date' },
              message: { type: 'text' },
              latency: { type: 'float' },
              'host.name': { type: 'keyword' },
            },
          },
        },
        { ignore: [400] }
      );
      await esClient.index({
        index: TEST_INDEX,
        document: {
          '@timestamp': new Date().toISOString(),
          message: 'test event',
          latency: 42.5,
          'host.name': 'host-1',
        },
        refresh: 'wait_for',
      });
    });

    test.beforeEach(async ({ browserAuth, page, pageObjects }) => {
      await browserAuth.loginAsAlertingV2Editor();
      await pageObjects.rulesList.goto();
      await expect(page.testSubj.locator('rulesListLoading')).toBeHidden({ timeout: 60_000 });
    });

    test.afterAll(async ({ esClient, apiServices }) => {
      await apiServices.alertingV2.rules.cleanUp();
      await esClient.indices.delete({ index: TEST_INDEX }, { ignore: [404] });
    });

    test('create flow: configure threshold builder and submit', async ({
      pageObjects,
      apiServices,
    }) => {
      await test.step('open threshold builder flyout', async () => {
        await pageObjects.ruleBuilder.openCreateBuilderFlyout('threshold');
        await expect(pageObjects.composeDiscover.flyout).toBeVisible();
      });

      await test.step('builder form is visible with default stat', async () => {
        await expect(pageObjects.composeDiscover.modeSelect).toBeVisible();
        await expect(pageObjects.thresholdBuilder.addStatButton).toBeVisible();
        await expect(pageObjects.thresholdBuilder.statAggSelect(0)).toBeVisible();
      });

      await test.step('Next is disabled before index is selected', async () => {
        await expect(pageObjects.composeDiscover.nextButton).toBeDisabled();
      });

      await test.step('select index pattern', async () => {
        await pageObjects.thresholdBuilder.setIndex(TEST_INDEX);
      });

      await test.step('time field is auto-populated', async () => {
        await expect(pageObjects.thresholdBuilder.timeFieldSelect).toBeVisible();
        await expect(pageObjects.thresholdBuilder.timeFieldSelect).toHaveValue('@timestamp');
      });

      await test.step('set threshold condition value', async () => {
        await pageObjects.thresholdBuilder.setConditionThreshold(0, '5');
      });

      await test.step('Next is enabled after builder form is valid', async () => {
        await expect(pageObjects.composeDiscover.nextButton).toBeEnabled();
      });

      await test.step('advance through Recovery Condition step', async () => {
        await pageObjects.composeDiscover.clickNext();
      });

      await test.step('advance to Details step', async () => {
        await pageObjects.composeDiscover.clickNext();
        await expect(pageObjects.composeDiscover.ruleNameInput).toBeVisible();
      });

      await test.step('fill rule name', async () => {
        await pageObjects.composeDiscover.setRuleName(RULE_NAME);
      });

      await test.step('advance to Actions step and submit', async () => {
        await pageObjects.composeDiscover.clickNext();
        await expect(pageObjects.composeDiscover.submitButton).toBeVisible();
        await pageObjects.composeDiscover.clickSubmit();
        await expect(pageObjects.composeDiscover.flyout).toBeHidden({ timeout: 30_000 });
      });

      await test.step('verify rule created with builder_type metadata', async () => {
        await expect
          .poll(
            async () => {
              const { items } = await apiServices.alertingV2.rules.find({
                search: RULE_NAME,
              });
              return items[0]?.metadata?.builder_type;
            },
            { timeout: 30_000 }
          )
          .toBe('threshold');
      });
    });

    test('edit flow: open builder-created rule and modify', async ({
      pageObjects,
      apiServices,
    }) => {
      let ruleId: string;

      await test.step('seed a builder rule via API', async () => {
        const rule = await apiServices.alertingV2.rules.create(
          buildCreateRuleData({
            metadata: { name: EDIT_RULE_NAME, builder_type: 'threshold' },
            query: {
              format: 'composed',
              base: `FROM ${TEST_INDEX} | STATS count = COUNT(*)`,
              breach: { segment: '| WHERE count > 5' },
            },
            time_field: '@timestamp',
            recovery_strategy: undefined,
          })
        );
        ruleId = rule.id;
      });

      await test.step('refresh rules list', async () => {
        await pageObjects.rulesList.goto();
        await expect(pageObjects.rulesList.rulesListTable).toBeVisible({ timeout: 60_000 });
      });

      await test.step('open edit flyout', async () => {
        await pageObjects.composeDiscover.openEditFlyout(ruleId!);
        await expect(pageObjects.composeDiscover.flyout).toBeVisible();
      });

      await test.step('builder form is displayed in edit mode', async () => {
        await expect(pageObjects.thresholdBuilder.addStatButton).toBeVisible();
      });

      await test.step('navigate to Details step and modify name', async () => {
        await pageObjects.composeDiscover.clickNext();
        await pageObjects.composeDiscover.clickNext();
        await pageObjects.composeDiscover.ruleNameInput.clear();
        await pageObjects.composeDiscover.setRuleName(EDITED_RULE_NAME);
      });

      await test.step('advance to Actions step and submit', async () => {
        await pageObjects.composeDiscover.clickNext();
        await expect(pageObjects.composeDiscover.submitButton).toBeVisible();
        await pageObjects.composeDiscover.clickSubmit();
        await expect(pageObjects.composeDiscover.flyout).toBeHidden({ timeout: 30_000 });
      });

      await test.step('verify rule updated', async () => {
        await expect
          .poll(async () => (await apiServices.alertingV2.rules.get(ruleId!)).metadata.name, {
            timeout: 30_000,
          })
          .toBe(EDITED_RULE_NAME);
      });
    });

    test('permissions: viewer role cannot access create flow', async ({
      browserAuth,
      page,
      pageObjects,
    }) => {
      await test.step('login as viewer', async () => {
        await browserAuth.loginAsAlertingV2Viewer();
        await pageObjects.rulesList.goto();
        await expect(page.testSubj.locator('rulesListLoading')).toBeHidden({ timeout: 60_000 });
      });

      await test.step('create rule button is not visible', async () => {
        await expect(pageObjects.composeDiscover.createRulePopoverButton).toBeHidden();
      });
    });
  }
);
