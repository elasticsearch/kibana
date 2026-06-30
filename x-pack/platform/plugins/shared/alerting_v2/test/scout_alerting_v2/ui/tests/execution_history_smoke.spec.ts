/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { test } from '../fixtures';

const SPACE_ID = 'exec-history-smoke';

/*
 * Custom-role auth (`browserAuth.loginWithCustomRole`) is not yet supported on
 * Elastic Cloud Hosted, so this suite only runs on local stateful (classic)
 * until ECH support lands.
 */
test.describe('Execution history — smoke', { tag: '@local-stateful-classic' }, () => {
  test.beforeAll(async ({ apiServices }) => {
    await apiServices.spaces.delete(SPACE_ID);
    await apiServices.spaces.create({ id: SPACE_ID, name: SPACE_ID });
  });

  test.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsAlertingV2Viewer();
  });

  test.afterAll(async ({ apiServices }) => {
    await apiServices.spaces.delete(SPACE_ID);
  });

  test('loads the page and shows the empty state when there are no events', async ({
    page,
    pageObjects,
  }) => {
    await pageObjects.executionHistory.goto(SPACE_ID);

    await test.step('URL is the execution_history app path', async () => {
      expect(page.url()).toContain(`/s/${SPACE_ID}/app/management/alertingV2/execution_history`);
    });

    await test.step('page header is visible', async () => {
      await expect(
        page.getByRole('heading', { name: /execution history/i, level: 1 })
      ).toBeVisible();
    });

    await test.step('empty state copy is visible', async () => {
      await expect(pageObjects.executionHistory.emptyPrompt).toBeVisible();
    });
  });
});
