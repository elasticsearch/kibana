/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../fixtures';

const TEST_TIMEOUT = 3 * 60 * 1000; // 3 minutes timeout, needed to wait for the SLOs to be created
/** Matches the SLO seeded by global.setup.ts via the worker-scoped sloData fixture. */
const SLO_NAME = 'Test Stack SLO';

test.describe(
  'SLOs Overview',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    // eslint-disable-next-line @kbn/eslint/scout_no_describe_configure
    test.describe.configure({ timeout: TEST_TIMEOUT });

    test.beforeEach(async ({ pageObjects, browserAuth }) => {
      await browserAuth.loginAsAdmin();
      await pageObjects.slo.goto();
    });

    test('Go to slos overview and validate data retention tab', async ({ page }) => {
      // Already navigated in beforeEach; assert the seeded SLO renders on the overview.
      await page.getByTestId('querySubmitButton').click();
      await expect(page.locator(`text=${SLO_NAME}`)).not.toHaveCount(0, { timeout: 30_000 });
    });
  }
);
