/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

import { test } from '../fixtures';
import { KERBEROS_REALM_NAME, KIBANA_TLS_ORIGIN } from '../fixtures/constants';

test.describe('Kerberos authentication — with role mapping', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ esClient }) => {
    await esClient.security.putRoleMapping({
      name: 'kerb_admin',
      enabled: true,
      roles: ['kibana_admin'],
      rules: { field: { 'realm.name': KERBEROS_REALM_NAME } },
    });
  });

  test.afterAll(async ({ esClient }) => {
    await esClient.security.deleteRoleMapping({ name: 'kerb_admin' }, { ignore: [404] });
  });

  test('logs in via SPNEGO without the login form', async ({ page }) => {
    await page.goto(`${KIBANA_TLS_ORIGIN}/app/home`);
    await expect(page.testSubj.locator('userMenuButton')).toBeVisible();
    await expect(page.testSubj.locator('loginUsername')).toHaveCount(0);
  });
});
