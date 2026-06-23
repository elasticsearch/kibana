/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { RUNBOOK_ARTIFACT_TYPE } from '@kbn/alerting-v2-constants';
import { buildCreateRuleData, test } from '../fixtures';

// Importing @kbn/alerting-v2-rule-form transitively pulls in monaco-editor CSS,
// which Playwright's test-listing phase cannot handle. Mirror the value here.
// Source: x-pack/platform/packages/shared/response-ops/alerting-v2-rule-form/form/constants.ts
const DEFAULT_RULE_NAME = 'Untitled rule';

const TEST_INDEX = 'test-compose-discover';
const TEST_QUERY = `FROM ${TEST_INDEX} | LIMIT 10`;
const BASE_QUERY = `FROM ${TEST_INDEX} | STATS count = COUNT(*)`;
const ALERT_SEGMENT = '| WHERE count > 0';
const RULE_NAME = 'scout-compose-discover-create';
const EDIT_RULE_NAME = 'scout-compose-discover-edit';
const EDITED_RULE_NAME = 'scout-compose-discover-edited';
const RUNBOOK_TEXT = 'Investigate failed transactions';

test.describe(
  'ComposeDiscoverFlyout — create and edit flows',
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
            },
          },
        },
        { ignore: [400] }
      );
      await esClient.index({
        index: TEST_INDEX,
        document: { '@timestamp': new Date().toISOString(), message: 'hello' },
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

    test('create flow: open flyout, define query, step through, and submit', async ({
      page,
      pageObjects,
      apiServices,
    }) => {
      await test.step('open ComposeDiscoverFlyout via empty-state card', async () => {
        await pageObjects.composeDiscover.openCreateFlyout();
        await expect(pageObjects.composeDiscover.flyout).toBeVisible();
      });

      await test.step('sandbox opens automatically in create mode', async () => {
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeVisible();
      });

      await test.step('type query and apply', async () => {
        await pageObjects.composeDiscover.setSandboxQuery(
          `FROM ${TEST_INDEX} | STATS count = COUNT(*)`
        );
        await pageObjects.composeDiscover.setSandboxAlertCondition('| WHERE count > 0');
        await pageObjects.composeDiscover.clickApply();
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeHidden();
      });

      await test.step('alert is the default mode (base + alert condition split shown)', async () => {
        await expect(pageObjects.composeDiscover.editQueriesButton).toBeVisible();
      });

      await test.step('Next is enabled after query is committed', async () => {
        await expect(pageObjects.composeDiscover.nextButton).toBeEnabled();
      });

      await test.step('advance through Recovery Condition to the Details step', async () => {
        await pageObjects.composeDiscover.clickNext(); // Recovery Condition
        await pageObjects.composeDiscover.clickNext(); // Details
        await expect(page.testSubj.locator('ruleNameInput')).toBeVisible();
      });

      await test.step('fill rule name', async () => {
        await pageObjects.composeDiscover.setRuleName(RULE_NAME);
      });

      await test.step('add runbook and verify related dashboards field', async () => {
        await expect(pageObjects.composeDiscover.addRunbookButton).toBeVisible();
        await expect(pageObjects.composeDiscover.relatedDashboardsSelector).toBeVisible();
        await expect(pageObjects.composeDiscover.relatedDashboardsInput).toBeVisible();

        await pageObjects.composeDiscover.addRunbook(RUNBOOK_TEXT);
        await expect(pageObjects.composeDiscover.addRunbookButton).toBeHidden();
        await expect(pageObjects.composeDiscover.flyout.getByText(RUNBOOK_TEXT)).toBeVisible();
      });

      await test.step('advance to the Actions step (final step shows Submit)', async () => {
        await pageObjects.composeDiscover.clickNext(); // Actions
        await expect(pageObjects.composeDiscover.submitButton).toBeVisible();
      });

      await test.step('submit and verify rule created', async () => {
        await pageObjects.composeDiscover.clickSubmit();
        await expect(pageObjects.composeDiscover.flyout).toBeHidden({ timeout: 30_000 });

        await expect
          .poll(
            async () => {
              const { items } = await apiServices.alertingV2.rules.find({
                search: RULE_NAME,
              });
              return items[0]?.artifacts?.some(
                (artifact) =>
                  artifact.type === RUNBOOK_ARTIFACT_TYPE && artifact.value === RUNBOOK_TEXT
              );
            },
            { timeout: 30_000 }
          )
          .toBe(true);
      });
    });

    test('edit flow: pencil icon opens flyout with pre-populated name, save updates rule', async ({
      pageObjects,
      apiServices,
    }) => {
      let ruleId: string;

      await test.step('seed a rule via API', async () => {
        const rule = await apiServices.alertingV2.rules.create(
          buildCreateRuleData({
            kind: 'signal',
            state_transition: undefined,
            recovery_strategy: undefined,
            query: {
              format: 'standalone',
              breach: { query: 'FROM logs-* | LIMIT 10' },
            },
            metadata: { name: EDIT_RULE_NAME },
            artifacts: [
              {
                id: 'runbook-id',
                type: RUNBOOK_ARTIFACT_TYPE,
                value: RUNBOOK_TEXT,
              },
            ],
          })
        );
        ruleId = rule.id;
      });

      await test.step('refresh the rules list', async () => {
        await pageObjects.rulesList.goto();
        await expect(pageObjects.rulesList.rulesListTable).toBeVisible({ timeout: 60_000 });
      });

      await test.step('click pencil icon to open edit flyout', async () => {
        await pageObjects.composeDiscover.openEditFlyout(ruleId!);
        await expect(pageObjects.composeDiscover.flyout).toBeVisible();
      });

      await test.step('rule name is pre-populated', async () => {
        // In edit mode, step 0 shows the alert condition with queryCommitted: true.
        // Navigate to Details step to see the name input.
        await pageObjects.composeDiscover.clickNext();
        await expect(pageObjects.composeDiscover.ruleNameInput).toHaveValue(EDIT_RULE_NAME);
        await expect(pageObjects.composeDiscover.flyout.getByText(RUNBOOK_TEXT)).toBeVisible();
        await expect(pageObjects.composeDiscover.relatedDashboardsSelector).toBeVisible();
        await expect(pageObjects.composeDiscover.relatedDashboardsInput).toBeVisible();
      });

      await test.step('modify name and save', async () => {
        await pageObjects.composeDiscover.ruleNameInput.clear();
        await pageObjects.composeDiscover.setRuleName(EDITED_RULE_NAME);
        await pageObjects.composeDiscover.clickSubmit();
        await expect(pageObjects.composeDiscover.flyout).toBeHidden({ timeout: 30_000 });
      });

      await test.step('verify rule updated via API', async () => {
        await expect
          .poll(async () => (await apiServices.alertingV2.rules.get(ruleId!)).metadata.name, {
            timeout: 30_000,
          })
          .toBe(EDITED_RULE_NAME);
      });
    });

    test('step validation: Next disabled without query, name validation blocks advancement', async ({
      page,
      pageObjects,
    }) => {
      await test.step('open create flyout', async () => {
        await pageObjects.composeDiscover.openCreateFlyout();
        await expect(pageObjects.composeDiscover.flyout).toBeVisible();
      });

      await test.step('close sandbox without applying', async () => {
        await pageObjects.composeDiscover.sandboxCloseButton.click();
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeHidden();
      });

      await test.step('Next is disabled with tooltip when no query is committed', async () => {
        await expect(pageObjects.composeDiscover.nextButton).toBeDisabled();
      });

      await test.step('open sandbox, type query, and apply', async () => {
        await pageObjects.composeDiscover.openEditorButton.click();
        await pageObjects.composeDiscover.setSandboxQuery(`FROM ${TEST_INDEX}`);
        await pageObjects.composeDiscover.setSandboxAlertCondition('| WHERE message != ""');
        await pageObjects.composeDiscover.clickApply();
      });

      await test.step('Next is now enabled; advance through Recovery to the Details step', async () => {
        await expect(pageObjects.composeDiscover.nextButton).toBeEnabled();
        await pageObjects.composeDiscover.clickNext(); // Recovery Condition
        await pageObjects.composeDiscover.clickNext(); // Details
      });

      // Details is no longer the final step in the default (alert) flow, so name
      // validation gates Next rather than Submit — but the effect is the same:
      // you can't leave the Details step until a valid name is provided.
      await test.step('an empty name blocks advancing past Details', async () => {
        await expect(page.testSubj.locator('ruleNameInput')).toBeVisible();
        await pageObjects.composeDiscover.clickNext();
        await expect(page.testSubj.locator('ruleNameInput')).toBeVisible();
      });

      await test.step('clearing a name after typing it blocks advancement', async () => {
        await pageObjects.composeDiscover.setRuleName('Temporary name');
        await pageObjects.composeDiscover.ruleNameInput.clear();
        await pageObjects.composeDiscover.clickNext();
        await expect(page.testSubj.locator('ruleNameInput')).toBeVisible();
      });

      await test.step('"Untitled rule" placeholder text is rejected as a name', async () => {
        await pageObjects.composeDiscover.setRuleName(DEFAULT_RULE_NAME);
        await pageObjects.composeDiscover.clickNext();
        await expect(page.testSubj.locator('ruleNameInput')).toBeVisible();
      });

      await test.step('Back returns through Recovery to the Alert Condition step', async () => {
        await pageObjects.composeDiscover.backButton.click(); // Recovery Condition
        await pageObjects.composeDiscover.backButton.click(); // Alert Condition
        // Query was committed in alert mode (default), so the base + alert split
        // summary with "Edit queries" is shown.
        await expect(pageObjects.composeDiscover.editQueriesButton).toBeVisible();
        await expect(page.testSubj.locator('ruleNameInput')).toBeHidden();
      });
    });

    test('cancel: closing flyout via Cancel button dismisses without saving', async ({
      pageObjects,
    }) => {
      await test.step('open create flyout', async () => {
        await pageObjects.composeDiscover.openCreateFlyout();
        await expect(pageObjects.composeDiscover.flyout).toBeVisible();
      });

      await test.step('click Cancel — flyout closes without saving', async () => {
        await pageObjects.composeDiscover.cancelButton.click();
        await expect(pageObjects.composeDiscover.flyout).toBeHidden();
      });
    });

    test('sandbox: Apply commits query, closing without Apply discards changes', async ({
      pageObjects,
    }) => {
      await test.step('open create flyout (sandbox opens automatically)', async () => {
        await pageObjects.composeDiscover.openCreateFlyout();
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeVisible();
      });

      await test.step('type query and close sandbox without applying', async () => {
        await pageObjects.composeDiscover.setSandboxQuery(TEST_QUERY);
        await pageObjects.composeDiscover.sandboxCloseButton.click();
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeHidden();
      });

      await test.step('query is not committed — Next stays disabled', async () => {
        await expect(pageObjects.composeDiscover.nextButton).toBeDisabled();
      });

      await test.step('reopen sandbox, type query with alert condition, and click Apply', async () => {
        await pageObjects.composeDiscover.openEditorButton.click();
        await pageObjects.composeDiscover.setSandboxQuery(BASE_QUERY);
        await pageObjects.composeDiscover.setSandboxAlertCondition(ALERT_SEGMENT);
        await pageObjects.composeDiscover.clickApply();
      });

      await test.step('Apply closes sandbox and commits query', async () => {
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeHidden();
        await expect(pageObjects.composeDiscover.nextButton).toBeEnabled();
      });
    });

    test('breach query validation: Apply without typing anything disables Next', async ({
      pageObjects,
    }) => {
      await test.step('open create flyout (sandbox opens automatically)', async () => {
        await pageObjects.composeDiscover.openCreateFlyout();
        await expect(pageObjects.composeDiscover.flyout).toBeVisible();
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeVisible();
      });

      await test.step('click Apply without typing anything', async () => {
        await pageObjects.composeDiscover.clickApply();
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeHidden();
      });

      await test.step('Next button is disabled', async () => {
        await expect(pageObjects.composeDiscover.nextButton).toBeDisabled();
      });
    });

    test('breach query validation: base-only query shows callout and disables Next', async ({
      pageObjects,
    }) => {
      await test.step('open create flyout', async () => {
        await pageObjects.composeDiscover.openCreateFlyout();
        await expect(pageObjects.composeDiscover.flyout).toBeVisible();
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeVisible();
      });

      await test.step('apply only a base query (no alert condition)', async () => {
        await pageObjects.composeDiscover.applySandboxBaseQueryOnly(BASE_QUERY);
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeHidden();
      });

      await test.step('breach query missing callout is visible', async () => {
        await expect(pageObjects.composeDiscover.breachQueryMissingCallout).toBeVisible();
        await expect(pageObjects.composeDiscover.breachQueryMissingCallout).toContainText(
          'Alert condition required'
        );
      });

      await test.step('Next button is disabled', async () => {
        await expect(pageObjects.composeDiscover.nextButton).toBeDisabled();
      });
    });

    test('breach query validation: no callout when both base and alert condition are provided', async ({
      pageObjects,
    }) => {
      await test.step('open create flyout', async () => {
        await pageObjects.composeDiscover.openCreateFlyout();
        await expect(pageObjects.composeDiscover.flyout).toBeVisible();
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeVisible();
      });

      await test.step('apply base query and alert condition', async () => {
        await pageObjects.composeDiscover.setSandboxQuery(BASE_QUERY);
        await pageObjects.composeDiscover.setSandboxAlertCondition(ALERT_SEGMENT);
        await pageObjects.composeDiscover.clickApply();
        await expect(pageObjects.composeDiscover.sandboxApplyButton).toBeHidden();
      });

      await test.step('no callout is shown and Next is enabled', async () => {
        await expect(pageObjects.composeDiscover.breachQueryMissingCallout).toBeHidden();
        await expect(pageObjects.composeDiscover.nextButton).toBeEnabled();
      });
    });

    test('breach query validation: missing breach query keeps user on Alert Condition step', async ({
      page,
      pageObjects,
    }) => {
      await test.step('open create flyout and apply only a base query', async () => {
        await pageObjects.composeDiscover.openCreateFlyout();
        await expect(pageObjects.composeDiscover.flyout).toBeVisible();
        await pageObjects.composeDiscover.applySandboxBaseQueryOnly(BASE_QUERY);
      });

      await test.step('Next is disabled — verify we stay on Alert Condition step', async () => {
        await expect(pageObjects.composeDiscover.nextButton).toBeDisabled();
        await expect(pageObjects.composeDiscover.breachQueryMissingCallout).toBeVisible();
        await expect(page.testSubj.locator('ruleNameInput')).toBeHidden();
      });
    });
  }
);
