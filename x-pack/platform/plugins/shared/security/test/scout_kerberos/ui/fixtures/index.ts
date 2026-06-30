/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { test as baseTest } from '@kbn/scout';

import { SPNEGO_TOKEN } from './constants';

/**
 * This fixture is used to test the Kerberos authentication flow.
 * This allows us to send the SPNEGO token ONLY when the Kibana server challenges us to authenticate.
 */
export const test = baseTest.extend({
  page: async ({ page }, use) => {
    await page.route('**/*', async (route) => {
      const response = await route.fetch({ maxRedirects: 0 });
      if (
        response.status() === 401 &&
        response.headers()['www-authenticate']?.toLowerCase().includes('negotiate')
      ) {
        await route.fulfill({
          response: await route.fetch({
            maxRedirects: 0,
            headers: {
              ...route.request().headers(),
              authorization: `Negotiate ${SPNEGO_TOKEN}`,
            },
          }),
        });
        return;
      }
      await route.fulfill({ response });
    });
    await use(page);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  },
});
