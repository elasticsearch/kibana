/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags, CUSTOM_QUERY_RULE, FULL_KIBANA_SECURITY_ROLE } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe('Run workflow alert action', { tag: [...tags.stateful.classic] }, () => {
  let ruleName: string;

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    // Enable the Workflows UI feature flag required for the "Run workflow" action to appear
    await scoutSpace.uiSettings.set({ 'workflows:ui:enabled': true });
  });

  spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }, testInfo) => {
    // Detection rule first-run can take a while under CI load before an alert lands.
    // This is for rule execution, not the workflow create API (that cold-start is
    // covered by StorageIndexAdapter.ensureReady in #283105).
    testInfo.setTimeout(testInfo.timeout + 90_000);

    ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
    await apiServices.detectionRule.createCustomQueryRule({
      ...CUSTOM_QUERY_RULE,
      name: ruleName,
    });

    // Wait for the rule to produce an alert before opening the browser. Without this,
    // navigation races task-manager first-run scheduling and the alerts table never loads.
    await apiServices.detectionAlerts.waitForAlerts(ruleName, 1, 90_000);

    // Use a custom role that includes workflowsManagement privileges (canExecuteWorkflow)
    // in addition to the security index privileges needed to view alerts
    await browserAuth.loginWithCustomRole(FULL_KIBANA_SECURITY_ROLE);
  });

  spaceTest.afterEach(async ({ apiServices }) => {
    await apiServices.detectionRule.deleteAll();
    await apiServices.detectionAlerts.deleteAll();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('workflows:ui:enabled');
  });

  spaceTest(
    'should show success toast with workflow link and open workflows app in new tab after executing',
    async ({ pageObjects, page, kbnUrl, scoutSpace }) => {
      const { alertsTablePage } = pageObjects;

      // Create a minimal alert-triggered workflow via REST API in the current space
      const workflowName = `Scout E2E Test Workflow ${Date.now()}`;
      const workflowYaml = [
        "version: '1'",
        `name: '${workflowName}'`,
        'enabled: true',
        'triggers:',
        '  - type: alert',
        'steps:',
        '  - name: log',
        '    type: console',
        '    with:',
        "      message: 'Alert received'",
      ].join('\n');

      const createResponse = await page.request.post(
        kbnUrl.get(`/s/${scoutSpace.id}/api/workflows/workflow`),
        {
          data: { yaml: workflowYaml },
          headers: { 'kbn-xsrf': 'true' },
        }
      );
      if (!createResponse.ok()) {
        throw new Error(
          `Failed to create workflow: ${createResponse.status()} ${await createResponse.text()}`
        );
      }
      const { id: workflowId } = await createResponse.json();

      try {
        await alertsTablePage.navigate();
        await alertsTablePage.waitForRuleAlert(ruleName);
        await alertsTablePage.openAlertContextMenu(ruleName);
        await alertsTablePage.runWorkflowMenuItem.click();

        await expect(alertsTablePage.workflowPanel).toBeVisible();

        // Select the created workflow from the list. The workflow selector renders a
        // secondary description alongside the name inside the option's label element,
        // which breaks selectOption()'s exact-label match, so filter on options instead.
        await page.components
          .selectable('workflowIdSelect')
          .options.filter({ hasText: workflowName })
          .click();

        await expect(alertsTablePage.executeWorkflowButton).toBeEnabled();
        await alertsTablePage.executeWorkflowButton.click();

        // Assert the success toast appears
        await expect(page.getByTestId('euiToastHeader__title')).toHaveText(
          'Workflow successfully started'
        );

        // Assert the "View workflow execution" link button is present in the toast
        const viewExecutionButton = page
          .locator('.euiToast')
          .getByRole('button', { name: 'View workflow execution' });
        await expect(viewExecutionButton).toBeVisible();

        // Clicking it should open the workflows app in a new tab
        const [newTab] = await Promise.all([
          page.context().waitForEvent('page'),
          viewExecutionButton.click(),
        ]);
        await expect(newTab).toHaveURL(/\/app\/workflows/);
      } finally {
        await page.request.delete(
          kbnUrl.get(`/s/${scoutSpace.id}/api/workflows/workflow/${workflowId}`),
          { headers: { 'kbn-xsrf': 'true' } }
        );
      }
    }
  );

  spaceTest(
    'should open the workflow selection panel when Run workflow is clicked',
    async ({ pageObjects }) => {
      const { alertsTablePage } = pageObjects;

      await alertsTablePage.navigate();
      await alertsTablePage.waitForRuleAlert(ruleName);
      await alertsTablePage.openAlertContextMenu(ruleName);

      await expect(alertsTablePage.runWorkflowMenuItem).toBeVisible();
      await alertsTablePage.runWorkflowMenuItem.click();

      await expect(alertsTablePage.workflowPanel).toBeVisible();
      await expect(alertsTablePage.executeWorkflowButton).toBeVisible();
      await expect(alertsTablePage.executeWorkflowButton).toBeDisabled();
    }
  );

  spaceTest(
    'should show Run workflow action in bulk actions and open the bulk panel',
    async ({ pageObjects }) => {
      const { alertsTablePage } = pageObjects;

      await alertsTablePage.navigate();
      await alertsTablePage.waitForRuleAlert(ruleName);

      // Prefer the page-object helper: a raw ancestor xpath can match nested
      // euiDataGridRow nodes and trip Playwright strict mode.
      await alertsTablePage.checkAlertRowCheckbox(ruleName);

      // Open the bulk-actions popover ("N selected" button) before clicking the menu item
      await alertsTablePage.selectedShowBulkActionsButton.click();

      await alertsTablePage.bulkRunWorkflowMenuItem.click();

      await expect(alertsTablePage.bulkWorkflowPanel).toBeVisible();
    }
  );
});
