/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { test } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

test.describe('dashboard as-code filters feature flag smoke', () => {
  test('loads dashboard listing with feature flag enabled', async ({ page, browserAuth }) => {
    await browserAuth.loginAsAdmin();
    await page.goto('/app/dashboards');

    await expect(page).toHaveURL(/app\/dashboards/);
  });
});
