/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags, test } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

import { FIRST_CLIENT_P12, KIBANA_TLS_ORIGIN } from '../fixtures/constants';

test.use({
  clientCertificates: [{ origin: KIBANA_TLS_ORIGIN, pfx: FIRST_CLIENT_P12, passphrase: '' }],
});

test.describe('PKI authentication — with role mapping', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ esClient }) => {
    await esClient.security.putRoleMapping({
      name: 'first_client_pki',
      enabled: true,
      roles: ['kibana_admin'],
      rules: { field: { dn: 'CN=first_client' } },
    });
  });

  test.afterAll(async ({ esClient }) => {
    await esClient.security.deleteRoleMapping({ name: 'first_client_pki' }, { ignore: [404] });
  });

  test('logs in via client certificate without the login form', async ({ page }) => {
    await page.goto(`${KIBANA_TLS_ORIGIN}/app/home`);
    await expect(page.testSubj.locator('userMenuButton')).toBeVisible();
    await expect(page.testSubj.locator('loginUsername')).toHaveCount(0);
  });
});
