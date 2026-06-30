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

test.describe('Kerberos authentication — logout', { tag: tags.stateful.classic }, () => {
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

  test('lands on the logged out page after logging out', async ({ page }) => {
    await page.goto(`${KIBANA_TLS_ORIGIN}/app/home`);
    await expect(page.testSubj.locator('userMenuButton')).toBeVisible();

    // The `logged_out` route does not require authentication, so the always-present `Negotiate`
    // header does not silently re-authenticate the user — the logged out state stays observable.
    await page.goto(`${KIBANA_TLS_ORIGIN}/logout`);
    await page.waitForURL(`${KIBANA_TLS_ORIGIN}/security/logged_out**`);
    await expect(page.testSubj.locator('secAuthenticationStatePage')).toBeVisible();
  });
});
