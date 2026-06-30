/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

import { test } from '../fixtures';
import { KIBANA_TLS_ORIGIN } from '../fixtures/constants';

test.describe('Kerberos authentication — no role mapping', { tag: tags.stateful.classic }, () => {
  test('redirects to the reset session page when the user has no privileges', async ({ page }) => {
    await page.goto(`${KIBANA_TLS_ORIGIN}/app/home`);
    await page.waitForURL(`${KIBANA_TLS_ORIGIN}/security/reset_session?next=%2Fapp%2Fhome`);
    await expect(page.testSubj.locator('promptPage')).toBeVisible();
  });
});
