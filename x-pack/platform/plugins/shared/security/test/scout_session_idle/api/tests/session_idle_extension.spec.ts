/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setTimeout as setTimeoutAsync } from 'timers/promises';

import { apiTest as test } from '@kbn/scout';
import { expect } from '@kbn/scout/api';

import {
  clearAllSessions,
  ensureSessionIndexReady,
  extractSessionCookie,
  getSessionsCreatedAt,
  LOCAL_STATEFUL_TAGS,
  loginWithBasic,
  refreshSessionIndex,
  SESSION_API_HEADERS,
} from '../../../scout_session_management/helpers';

test.describe('Session Idle extension', { tag: [...LOCAL_STATEFUL_TAGS] }, () => {
  let sessionCookie: string;

  test.beforeEach(async ({ apiClient, config, esClient }) => {
    await ensureSessionIndexReady(esClient);
    await clearAllSessions(apiClient, config, esClient);
    sessionCookie = await loginWithBasic(apiClient, config.auth.username, config.auth.password);
  });

  test('GET /internal/security/session should return current session information', async ({
    apiClient,
  }) => {
    const response = await apiClient.get('/internal/security/session', {
      headers: { ...SESSION_API_HEADERS, 'kbn-system-request': 'true', Cookie: sessionCookie },
    });
    expect(response).toHaveStatusCode(200);
    expect(typeof response.body.expiresInMs).toBe('number');
    expect(response.body.canBeExtended).toBe(true);
    expect(response.body.provider).toStrictEqual({ type: 'basic', name: 'basic1' });
  });

  test('GET /internal/security/session should not extend the session', async ({ apiClient }) => {
    const r1 = await apiClient.get('/internal/security/session', {
      headers: { ...SESSION_API_HEADERS, 'kbn-system-request': 'true', Cookie: sessionCookie },
    });
    expect(r1).toHaveStatusCode(200);
    const r2 = await apiClient.get('/internal/security/session', {
      headers: { ...SESSION_API_HEADERS, 'kbn-system-request': 'true', Cookie: sessionCookie },
    });
    expect(r2).toHaveStatusCode(200);
    expect(r2.body.expiresInMs).toBeLessThan(r1.body.expiresInMs);
  });

  test('POST /internal/security/session should redirect to GET', async ({ apiClient }) => {
    const response = await apiClient.post('/internal/security/session', {
      headers: { ...SESSION_API_HEADERS, Cookie: sessionCookie },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/internal/security/session');
  });

  test('POST /internal/security/session should extend the session', async ({
    apiClient,
    config,
    esClient,
  }) => {
    await refreshSessionIndex(apiClient, config);
    const allCreatedAtBefore = await getSessionsCreatedAt(esClient);
    expect(allCreatedAtBefore.every((value) => value > 0)).toBe(true);

    const getBeforeExtend = await apiClient.get('/internal/security/session', {
      headers: { ...SESSION_API_HEADERS, 'kbn-system-request': 'true', Cookie: sessionCookie },
    });
    expect(getBeforeExtend).toHaveStatusCode(200);

    await setTimeoutAsync(200);

    const extendResponse = await apiClient.post('/internal/security/session', {
      headers: { ...SESSION_API_HEADERS, Cookie: sessionCookie },
    });
    expect(extendResponse.statusCode).toBe(302);

    if (extendResponse.headers['set-cookie']) {
      sessionCookie = extractSessionCookie(extendResponse.headers['set-cookie']);
    }

    const getResponse = await apiClient.get('/internal/security/session', {
      headers: { ...SESSION_API_HEADERS, 'kbn-system-request': 'true', Cookie: sessionCookie },
    });
    expect(getResponse).toHaveStatusCode(200);
    expect(getResponse.body.expiresInMs).toBeGreaterThan(getBeforeExtend.body.expiresInMs);

    await refreshSessionIndex(apiClient, config);
    const allCreatedAtAfter = await getSessionsCreatedAt(esClient);
    expect(allCreatedAtAfter).toStrictEqual(allCreatedAtBefore);
  });
});
