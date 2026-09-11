/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags, apiTest as test } from '@kbn/scout';
import { expect } from '@kbn/scout/api';

import {
  deleteNativeUser,
  invalidateMatchingSessions,
  loginWithBasic,
  putNativeUser,
  SESSION_API_HEADERS,
} from '../../../scout_session_management/helpers';

const TEST_USERNAME = 'session_cookie_test_user';
const TEST_PASSWORD = 'changeme';

test.describe('Session Cookie', { tag: [...tags.stateful.classic] }, () => {
  test.beforeAll(async ({ esClient }) => {
    await putNativeUser(
      esClient,
      TEST_USERNAME,
      TEST_PASSWORD,
      ['kibana_admin'],
      'Session Cookie Test'
    );
  });

  test.afterAll(async ({ apiClient, config, esClient }) => {
    await invalidateMatchingSessions(apiClient, config, {
      provider: { type: 'basic', name: 'cloud-basic' },
      username: config.auth.username,
    });
    await invalidateMatchingSessions(apiClient, config, {
      provider: { type: 'basic', name: 'cloud-basic' },
      username: TEST_USERNAME,
    });
    await deleteNativeUser(esClient, TEST_USERNAME);
  });

  test('should allow a single valid cookie', async ({ apiClient, config }) => {
    const cookie = await loginWithBasic(
      apiClient,
      config.auth.username,
      config.auth.password,
      'cloud-basic'
    );
    const response = await apiClient.get('/internal/security/me', {
      headers: { ...SESSION_API_HEADERS, Cookie: cookie },
    });
    expect(response).toHaveStatusCode(200);
  });

  test('should allow multiple cookies that are the same', async ({ apiClient, config }) => {
    const cookie = await loginWithBasic(
      apiClient,
      config.auth.username,
      config.auth.password,
      'cloud-basic'
    );
    const response = await apiClient.get('/internal/security/me', {
      headers: { ...SESSION_API_HEADERS, Cookie: `${cookie}; ${cookie}` },
    });
    expect(response).toHaveStatusCode(200);
  });

  test('should not allow multiple different cookies', async ({ apiClient, config }) => {
    const cookie1 = await loginWithBasic(
      apiClient,
      config.auth.username,
      config.auth.password,
      'cloud-basic'
    );
    const cookie2 = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD, 'cloud-basic');
    const response = await apiClient.get('/internal/security/me', {
      headers: { ...SESSION_API_HEADERS, Cookie: `${cookie1}; ${cookie2}` },
    });
    expect(response).toHaveStatusCode(401);
  });
});
