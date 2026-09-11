/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest as test } from '@kbn/scout';
import { expect } from '@kbn/scout/api';

import {
  assertSessionCookie,
  assertSessionExpired,
  clearAllSessions,
  deleteNativeUser,
  disableSessionAuthcDebugLogs,
  enableSessionAuthcDebugLogs,
  ensureSessionIndexReady,
  LOCAL_STATEFUL_TAGS,
  loginWithAnonymous,
  loginWithBasic,
  loginWithSAML,
  putNativeUser,
  refreshSessionIndex,
  SESSION_API_HEADERS,
  toggleSessionCleanupTask,
} from '../../../scout_session_management/helpers';

const TEST_USERNAME = 'concurrent_test_user';
const TEST_PASSWORD = 'changeme';
const ANONYMOUS_USERNAME = 'anonymous_user';
const ANONYMOUS_PASSWORD = 'changeme';
const SAML_USERNAME = 'a@b.c';
const BASIC_PROVIDER = { type: 'basic', name: 'basic1' } as const;
const SAML_PROVIDER = { type: 'saml', name: 'saml1' } as const;
const ANONYMOUS_PROVIDER = { type: 'anonymous', name: 'anonymous1' } as const;

test.describe('Session Concurrent Limit global', { tag: [...LOCAL_STATEFUL_TAGS] }, () => {
  test.beforeAll(async ({ apiClient, config, esClient }) => {
    await putNativeUser(
      esClient,
      TEST_USERNAME,
      TEST_PASSWORD,
      ['kibana_admin'],
      'Concurrent Test User'
    );
    await putNativeUser(esClient, ANONYMOUS_USERNAME, ANONYMOUS_PASSWORD, [], 'Guest');
    await toggleSessionCleanupTask(apiClient, config, false);
  });

  test.beforeEach(async ({ apiClient, config, esClient }) => {
    await refreshSessionIndex(apiClient, config);
    await ensureSessionIndexReady(esClient);
    await enableSessionAuthcDebugLogs(esClient);
    await clearAllSessions(apiClient, config, esClient);
  });

  test.afterAll(async ({ apiClient, config, esClient }) => {
    await toggleSessionCleanupTask(apiClient, config, true);
    await disableSessionAuthcDebugLogs(esClient);
    await deleteNativeUser(esClient, TEST_USERNAME);
    await deleteNativeUser(esClient, ANONYMOUS_USERNAME);
  });

  test('should properly enforce session limit with single provider', async ({
    apiClient,
    config,
  }) => {
    const cookieOne = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await assertSessionCookie(apiClient, cookieOne, TEST_USERNAME, BASIC_PROVIDER);

    const cookieTwo = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await assertSessionCookie(apiClient, cookieOne, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, cookieTwo, TEST_USERNAME, BASIC_PROVIDER);

    const cookieThree = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await refreshSessionIndex(apiClient, config);
    await assertSessionExpired(apiClient, cookieOne);
    await assertSessionCookie(apiClient, cookieTwo, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, cookieThree, TEST_USERNAME, BASIC_PROVIDER);

    const cookieFour = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await refreshSessionIndex(apiClient, config);
    await assertSessionExpired(apiClient, cookieTwo);
    await assertSessionCookie(apiClient, cookieThree, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, cookieFour, TEST_USERNAME, BASIC_PROVIDER);
  });

  test('should properly enforce session limit with single provider and multiple users', async ({
    apiClient,
    config,
  }) => {
    const adminUsername = config.auth.username;
    const c1 = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    const c2 = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    const c3 = await loginWithBasic(apiClient, adminUsername, config.auth.password);
    const c4 = await loginWithBasic(apiClient, adminUsername, config.auth.password);

    await assertSessionCookie(apiClient, c1, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, c2, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, c3, adminUsername, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, c4, adminUsername, BASIC_PROVIDER);

    const c5 = await loginWithBasic(apiClient, adminUsername, config.auth.password);
    await refreshSessionIndex(apiClient, config);
    await assertSessionCookie(apiClient, c1, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, c2, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionExpired(apiClient, c3);
    await assertSessionCookie(apiClient, c4, adminUsername, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, c5, adminUsername, BASIC_PROVIDER);

    const c6 = await loginWithBasic(apiClient, adminUsername, config.auth.password);
    await refreshSessionIndex(apiClient, config);
    await assertSessionCookie(apiClient, c1, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, c2, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionExpired(apiClient, c4);
    await assertSessionCookie(apiClient, c5, adminUsername, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, c6, adminUsername, BASIC_PROVIDER);

    const c7 = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await refreshSessionIndex(apiClient, config);
    await assertSessionExpired(apiClient, c1);
    await assertSessionCookie(apiClient, c2, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, c5, adminUsername, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, c6, adminUsername, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, c7, TEST_USERNAME, BASIC_PROVIDER);
  });

  test('should properly enforce session limit even for multiple concurrent logins', async ({
    apiClient,
    config,
  }) => {
    const cookies = await Promise.all(
      Array.from({ length: 10 }).map(() => loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD))
    );

    const statusCodes: number[] = [];
    for (const cookie of cookies) {
      await refreshSessionIndex(apiClient, config);
      const response = await apiClient.get('/internal/security/me', {
        headers: { ...SESSION_API_HEADERS, Cookie: cookie },
      });
      statusCodes.push(response.statusCode);
    }

    expect(statusCodes.filter((status) => status === 200)).toHaveLength(2);
    expect(statusCodes.filter((status) => status === 401)).toHaveLength(8);
  });

  test('should properly enforce session limit with multiple providers', async ({
    apiClient,
    config,
  }) => {
    const basicCookieOne = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    const basicCookieTwo = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    const samlCookieOne = await loginWithSAML(apiClient, config);
    const samlCookieTwo = await loginWithSAML(apiClient, config);

    await refreshSessionIndex(apiClient, config);
    await assertSessionCookie(apiClient, basicCookieOne, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, basicCookieTwo, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, samlCookieOne, SAML_USERNAME, SAML_PROVIDER);
    await assertSessionCookie(apiClient, samlCookieTwo, SAML_USERNAME, SAML_PROVIDER);

    const samlCookieThree = await loginWithSAML(apiClient, config);
    await refreshSessionIndex(apiClient, config);
    await assertSessionCookie(apiClient, basicCookieOne, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, basicCookieTwo, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionExpired(apiClient, samlCookieOne);
    await assertSessionCookie(apiClient, samlCookieTwo, SAML_USERNAME, SAML_PROVIDER);
    await assertSessionCookie(apiClient, samlCookieThree, SAML_USERNAME, SAML_PROVIDER);

    const basicCookieThree = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await refreshSessionIndex(apiClient, config);
    await assertSessionExpired(apiClient, basicCookieOne);
    await assertSessionCookie(apiClient, basicCookieTwo, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, basicCookieThree, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, samlCookieTwo, SAML_USERNAME, SAML_PROVIDER);
    await assertSessionCookie(apiClient, samlCookieThree, SAML_USERNAME, SAML_PROVIDER);
  });

  test('should not enforce session limit for anonymous users', async ({ apiClient, config }) => {
    // Create every session first so the oldest is checked after the limit would have displaced it.
    const cookies = [
      await loginWithAnonymous(apiClient),
      await loginWithAnonymous(apiClient),
      await loginWithAnonymous(apiClient),
      await loginWithAnonymous(apiClient),
    ];
    await refreshSessionIndex(apiClient, config);

    for (const cookie of cookies) {
      await assertSessionCookie(apiClient, cookie, ANONYMOUS_USERNAME, ANONYMOUS_PROVIDER);
    }
  });
});
