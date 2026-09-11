/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setTimeout as setTimeoutAsync } from 'timers/promises';

import { apiTest as test } from '@kbn/scout';
import { expect } from '@kbn/scout/api';

import { SESSION_ERROR_REASON_HEADER } from '../../../../common/constants';
import {
  clearAllSessions,
  ensureSessionIndexReady,
  LOCAL_STATEFUL_TAGS,
  loginWithBasic,
  refreshSessionIndex,
  SESSION_API_HEADERS,
} from '../../../scout_session_management/helpers';

test.describe('Session Idle expired', { tag: [...LOCAL_STATEFUL_TAGS] }, () => {
  test.beforeEach(async ({ apiClient, config, esClient }) => {
    await ensureSessionIndexReady(esClient);
    await clearAllSessions(apiClient, config, esClient);
  });

  test(`should return ${SESSION_ERROR_REASON_HEADER} header if session is expired`, async ({
    apiClient,
    config,
  }) => {
    test.setTimeout(100000);

    const cookie = await loginWithBasic(apiClient, config.auth.username, config.auth.password);
    await refreshSessionIndex(apiClient, config);

    // Wait out the idle timeout without touching the session — any authenticated
    // request would reset the idle clock, preventing the 401 from ever firing.
    await setTimeoutAsync(11000);

    const expiredResponse = await apiClient.get('/internal/security/me', {
      headers: { ...SESSION_API_HEADERS, Cookie: cookie },
    });
    expect(expiredResponse).toHaveStatusCode(401);
    expect(expiredResponse.headers[SESSION_ERROR_REASON_HEADER]).toBe('SESSION_IDLE_TIMEOUT');
  });
});
