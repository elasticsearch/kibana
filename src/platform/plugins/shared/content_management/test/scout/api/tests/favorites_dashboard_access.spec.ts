/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RoleApiCredentials } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest, FAVORITES_API_PATH, INTERNAL_HEADERS } from '../fixtures';

const FAVORITE_TYPE = 'dashboard';

apiTest.describe(
  'content management - dashboard favorites: access control',
  { tag: tags.stateful.classic },
  () => {
    let adminCredentials: RoleApiCredentials;
    let user1CookieHeader: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth, samlAuth, config }) => {
      adminCredentials = await requestAuth.getApiKeyForAdmin();
      const privilegedRoleName =
        config.serverless && config.projectType === 'es' ? 'developer' : 'editor';
      ({ cookieHeader: user1CookieHeader } = await samlAuth.asInteractiveUser(privilegedRoleName));
    });

    apiTest('non-interactive user gets 403 on all favorites endpoints', async ({ apiClient }) => {
      const list = await apiClient.get(`${FAVORITES_API_PATH}/${FAVORITE_TYPE}`, {
        headers: { ...INTERNAL_HEADERS, ...adminCredentials.apiKeyHeader },
      });
      expect(list).toHaveStatusCode(403);

      const fav = await apiClient.post(`${FAVORITES_API_PATH}/${FAVORITE_TYPE}/some-id/favorite`, {
        headers: { ...INTERNAL_HEADERS, ...adminCredentials.apiKeyHeader },
      });
      expect(fav).toHaveStatusCode(403);

      const unfav = await apiClient.post(
        `${FAVORITES_API_PATH}/${FAVORITE_TYPE}/some-id/unfavorite`,
        { headers: { ...INTERNAL_HEADERS, ...adminCredentials.apiKeyHeader } }
      );
      expect(unfav).toHaveStatusCode(403);
    });

    apiTest('favoriting with an invalid type returns 400', async ({ apiClient }) => {
      const response = await apiClient.post(`${FAVORITES_API_PATH}/invalid/some-id/favorite`, {
        headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
      });
      expect(response).toHaveStatusCode(400);
    });

    apiTest(
      'providing metadata for a type that does not support it returns 400',
      async ({ apiClient }) => {
        await apiTest.step('non-empty metadata object', async () => {
          const r = await apiClient.post(
            `${FAVORITES_API_PATH}/${FAVORITE_TYPE}/some-id/favorite`,
            {
              headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
              body: { metadata: { foo: 'bar' } },
            }
          );
          expect(r).toHaveStatusCode(400);
        });

        await apiTest.step('empty metadata object', async () => {
          const r = await apiClient.post(
            `${FAVORITES_API_PATH}/${FAVORITE_TYPE}/some-id/favorite`,
            {
              headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
              body: { metadata: {} },
            }
          );
          expect(r).toHaveStatusCode(400);
        });
      }
    );
  }
);
