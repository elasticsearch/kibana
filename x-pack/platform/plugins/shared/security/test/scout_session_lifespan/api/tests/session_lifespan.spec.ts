/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest as test } from '@kbn/scout';
import { expect } from '@kbn/scout/api';

import {
  clearAllSessions,
  disableSessionAuthcDebugLogs,
  enableSessionAuthcDebugLogs,
  ensureSessionIndexReady,
  getSessionCount,
  LOCAL_STATEFUL_TAGS,
  loginWithBasic,
  loginWithSAML,
  SESSION_API_HEADERS,
} from '../../../scout_session_management/helpers';

test.describe('Session Lifespan cleanup', { tag: [...LOCAL_STATEFUL_TAGS] }, () => {
  test.beforeEach(async ({ apiClient, config, esClient }) => {
    await ensureSessionIndexReady(esClient);
    await enableSessionAuthcDebugLogs(esClient);
    await clearAllSessions(apiClient, config, esClient);
  });

  test.afterAll(async ({ esClient }) => {
    await disableSessionAuthcDebugLogs(esClient);
  });

  test('should properly clean up session expired because of lifespan', async ({
    apiClient,
    config,
    esClient,
  }) => {
    test.setTimeout(100000);

    const cookie = await loginWithBasic(apiClient, config.auth.username, config.auth.password);
    const meResponse = await apiClient.get('/internal/security/me', {
      headers: { ...SESSION_API_HEADERS, Cookie: cookie },
    });
    expect(meResponse.body.username).toBe(config.auth.username);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 5000 }).toBe(1);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 60000 }).toBe(0);

    const expiredResponse = await apiClient.get('/internal/security/me', {
      headers: { ...SESSION_API_HEADERS, Cookie: cookie },
    });
    expect(expiredResponse).toHaveStatusCode(401);
  });

  test('should properly clean up session expired because of lifespan when providers override global session config', async ({
    apiClient,
    config,
    esClient,
  }) => {
    test.setTimeout(100000);

    const samlDisableCookie = await loginWithSAML(apiClient, config, 'saml_disable');
    const samlOverrideCookie = await loginWithSAML(apiClient, config, 'saml_override');
    const samlFallbackCookie = await loginWithSAML(apiClient, config, 'saml_fallback');
    const basicCookie = await loginWithBasic(apiClient, config.auth.username, config.auth.password);

    const meBasic = await apiClient.get('/internal/security/me', {
      headers: { ...SESSION_API_HEADERS, Cookie: basicCookie },
    });
    expect(meBasic.body.username).toBe(config.auth.username);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 10000 }).toBe(4);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 60000 }).toBe(2);

    const basicExpired = await apiClient.get('/internal/security/me', {
      headers: { ...SESSION_API_HEADERS, Cookie: basicCookie },
    });
    expect(basicExpired).toHaveStatusCode(401);

    const fallbackExpired = await apiClient.get('/internal/security/me', {
      headers: { ...SESSION_API_HEADERS, Cookie: samlFallbackCookie },
    });
    expect(fallbackExpired).toHaveStatusCode(401);

    const overrideMe = await apiClient.get('/internal/security/me', {
      headers: { ...SESSION_API_HEADERS, Cookie: samlOverrideCookie },
    });
    expect(overrideMe).toHaveStatusCode(200);
    expect(overrideMe.body.authentication_provider).toStrictEqual({
      type: 'saml',
      name: 'saml_override',
    });

    const disableMe = await apiClient.get('/internal/security/me', {
      headers: { ...SESSION_API_HEADERS, Cookie: samlDisableCookie },
    });
    expect(disableMe).toHaveStatusCode(200);
    expect(disableMe.body.authentication_provider).toStrictEqual({
      type: 'saml',
      name: 'saml_disable',
    });
  });
});
