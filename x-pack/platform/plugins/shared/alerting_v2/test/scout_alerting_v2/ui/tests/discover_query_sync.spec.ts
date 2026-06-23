/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { test } from '../fixtures';

const TEST_INDEX = 'test-discover-query-sync';
const INITIAL_INDEX = 'logs-*';
const UPDATED_QUERY = `FROM ${TEST_INDEX} | WHERE message != ""`;
const UPDATED_ALERT_CONDITION = 'WHERE message != ""';

/*
 * Custom-role auth (`browserAuth.loginWithCustomRole`) is not yet supported on
 * Elastic Cloud Hosted, so this suite only runs on local stateful (classic)
 * until ECH support lands.
 */
test.describe('Discover query sync — Rule flyout', { tag: '@local-stateful-classic' }, () => {
  test.beforeAll(async ({ esClient }) => {
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
  });

  test.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsAlertingV2Editor();
    await pageObjects.ruleForm.gotoDiscover();
  });

  test.afterAll(async ({ esClient }) => {
    await esClient.indices.delete({ index: TEST_INDEX }, { ignore: [404] });
  });

  test('flyout query updates when the Discover query changes', async ({ pageObjects }) => {
    await test.step('switch to ES|QL, run an initial query, and open rule flyout', async () => {
      await pageObjects.ruleForm.switchToEsqlMode();
      await pageObjects.discover.writeAndSubmitEsqlQuery(
        'FROM logs-* | WHERE message != "" | LIMIT 10'
      );
      await pageObjects.discover.waitUntilSearchingHasFinished();
      await pageObjects.ruleForm.openRulesFlyoutFromDiscover();
      await expect(pageObjects.ruleForm.flyout).toBeVisible();
    });

    await test.step('verify flyout reflects the initial Discover query', async () => {
      await expect(pageObjects.ruleForm.flyout).toContainText(`FROM ${INITIAL_INDEX}`);
      await expect(pageObjects.ruleForm.flyout).not.toContainText(TEST_INDEX);
    });

    await test.step('type the new query in Discover without submitting', async () => {
      await pageObjects.ruleForm.setDiscoverQueryWithFlyoutOpen(UPDATED_QUERY);
    });

    await test.step('verify flyout still reflects the initial query before submit', async () => {
      await expect(pageObjects.ruleForm.flyout).toContainText(`FROM ${INITIAL_INDEX}`);
      await expect(pageObjects.ruleForm.flyout).not.toContainText(TEST_INDEX);
    });

    await test.step('click search to submit the query', async () => {
      await pageObjects.ruleForm.submitDiscoverQuery();
      await pageObjects.discover.waitUntilSearchingHasFinished();
    });

    await test.step('verify flyout reflects the updated query', async () => {
      await expect(pageObjects.ruleForm.flyout).toContainText(`FROM ${TEST_INDEX}`, {
        timeout: 30_000,
      });
      await expect(pageObjects.ruleForm.flyout).toContainText(UPDATED_ALERT_CONDITION, {
        timeout: 30_000,
      });
    });
  });
});
