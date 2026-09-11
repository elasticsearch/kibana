/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture, EsClient, ScoutTestConfig } from '@kbn/scout';
import { apiTest as test } from '@kbn/scout';
import { expect } from '@kbn/scout/api';

import {
  assertSessionCookie,
  assertSessionExpired,
  basicAuthHeader,
  clearAllSessions,
  deleteNativeUser,
  disableSessionAuthcDebugLogs,
  enableSessionAuthcDebugLogs,
  ensureSessionIndexReady,
  getSessionCount,
  LOCAL_STATEFUL_TAGS,
  loginWithBasic,
  loginWithSAML,
  postSessionInvalidate,
  putNativeUser,
  refreshSessionIndex,
  SESSION_API_HEADERS,
} from '../../../scout_session_management/helpers';

const TEST_USERNAME = 'invalidate_test_user';
const TEST_PASSWORD = 'changeme';
const BASIC_PROVIDER = { type: 'basic', name: 'basic1' } as const;
const SAML_PROVIDER = { type: 'saml', name: 'saml1' } as const;

async function createTestSessions(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig,
  esClient: EsClient
): Promise<{ basicCookie: string; samlCookie: string }> {
  const basicCookie = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
  const samlCookie = await loginWithSAML(apiClient, config);
  await refreshSessionIndex(apiClient, config);
  expect(await getSessionCount(esClient)).toBe(2);
  return { basicCookie, samlCookie };
}

test.describe('Session Invalidate', { tag: [...LOCAL_STATEFUL_TAGS] }, () => {
  test.beforeAll(async ({ esClient }) => {
    await putNativeUser(
      esClient,
      TEST_USERNAME,
      TEST_PASSWORD,
      ['kibana_admin'],
      'Invalidate Test User'
    );
  });

  test.beforeEach(async ({ apiClient, config, esClient }) => {
    await ensureSessionIndexReady(esClient);
    await enableSessionAuthcDebugLogs(esClient);
    await clearAllSessions(apiClient, config, esClient);
    await putNativeUser(
      esClient,
      TEST_USERNAME,
      TEST_PASSWORD,
      ['kibana_admin'],
      'Invalidate Test User'
    );
  });

  test.afterAll(async ({ esClient }) => {
    await disableSessionAuthcDebugLogs(esClient);
    await deleteNativeUser(esClient, TEST_USERNAME);
  });

  test('should be able to invalidate all sessions at once', async ({
    apiClient,
    config,
    esClient,
  }) => {
    const { basicCookie, samlCookie } = await createTestSessions(apiClient, config, esClient);

    const invalidateResponse = await postSessionInvalidate(apiClient, config, { match: 'all' });
    expect(invalidateResponse).toHaveStatusCode(200);
    expect(invalidateResponse.body.total).toBe(2);

    await assertSessionExpired(apiClient, basicCookie);
    await assertSessionExpired(apiClient, samlCookie);
  });

  test('should do nothing if specified provider type is not configured', async ({
    apiClient,
    config,
    esClient,
  }) => {
    const { basicCookie, samlCookie } = await createTestSessions(apiClient, config, esClient);

    const noopResponse = await postSessionInvalidate(apiClient, config, {
      match: 'query',
      query: { provider: { type: 'oidc' } },
    });
    expect(noopResponse).toHaveStatusCode(200);
    expect(noopResponse.body.total).toBe(0);

    await assertSessionCookie(apiClient, basicCookie, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, samlCookie, 'a@b.c', SAML_PROVIDER);
  });

  test('should be able to invalidate session only for a specific provider type', async ({
    apiClient,
    config,
    esClient,
  }) => {
    const { basicCookie, samlCookie } = await createTestSessions(apiClient, config, esClient);

    const invalidateBasic = await postSessionInvalidate(apiClient, config, {
      match: 'query',
      query: { provider: { type: 'basic' } },
    });
    expect(invalidateBasic).toHaveStatusCode(200);
    expect(invalidateBasic.body.total).toBe(1);

    await assertSessionExpired(apiClient, basicCookie);
    await assertSessionCookie(apiClient, samlCookie, 'a@b.c', SAML_PROVIDER);

    const invalidateSaml = await postSessionInvalidate(apiClient, config, {
      match: 'query',
      query: { provider: { type: 'saml' } },
    });
    expect(invalidateSaml).toHaveStatusCode(200);
    expect(invalidateSaml.body.total).toBe(1);

    await assertSessionExpired(apiClient, samlCookie);
  });

  test('should do nothing if specified provider name is not configured', async ({
    apiClient,
    config,
    esClient,
  }) => {
    const { basicCookie, samlCookie } = await createTestSessions(apiClient, config, esClient);

    const noop1 = await postSessionInvalidate(apiClient, config, {
      match: 'query',
      query: { provider: { type: 'basic', name: 'basic2' } },
    });
    expect(noop1).toHaveStatusCode(200);
    expect(noop1.body.total).toBe(0);

    const noop2 = await postSessionInvalidate(apiClient, config, {
      match: 'query',
      query: { provider: { type: 'saml', name: 'saml2' } },
    });
    expect(noop2).toHaveStatusCode(200);
    expect(noop2.body.total).toBe(0);

    await assertSessionCookie(apiClient, basicCookie, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, samlCookie, 'a@b.c', SAML_PROVIDER);
  });

  test('should be able to invalidate session only for a specific provider name', async ({
    apiClient,
    config,
    esClient,
  }) => {
    const { basicCookie, samlCookie } = await createTestSessions(apiClient, config, esClient);

    const invalidateSaml1 = await postSessionInvalidate(apiClient, config, {
      match: 'query',
      query: { provider: { type: 'saml', name: 'saml1' } },
    });
    expect(invalidateSaml1).toHaveStatusCode(200);
    expect(invalidateSaml1.body.total).toBe(1);

    await assertSessionCookie(apiClient, basicCookie, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionExpired(apiClient, samlCookie);

    const invalidateBasic1 = await postSessionInvalidate(apiClient, config, {
      match: 'query',
      query: { provider: { type: 'basic', name: 'basic1' } },
    });
    expect(invalidateBasic1).toHaveStatusCode(200);
    expect(invalidateBasic1.body.total).toBe(1);

    await assertSessionExpired(apiClient, basicCookie);
  });

  test('should do nothing if specified username does not have session', async ({
    apiClient,
    config,
    esClient,
  }) => {
    const { basicCookie, samlCookie } = await createTestSessions(apiClient, config, esClient);

    const noop1 = await postSessionInvalidate(apiClient, config, {
      match: 'query',
      query: { provider: { type: 'basic', name: 'basic1' }, username: `_${TEST_USERNAME}` },
    });
    expect(noop1).toHaveStatusCode(200);
    expect(noop1.body.total).toBe(0);

    const noop2 = await postSessionInvalidate(apiClient, config, {
      match: 'query',
      query: { provider: { type: 'saml', name: 'saml1' }, username: '_a@b.c' },
    });
    expect(noop2).toHaveStatusCode(200);
    expect(noop2.body.total).toBe(0);

    await assertSessionCookie(apiClient, basicCookie, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, samlCookie, 'a@b.c', SAML_PROVIDER);
  });

  test('should be able to invalidate session only for a specific user', async ({
    apiClient,
    config,
    esClient,
  }) => {
    const { basicCookie, samlCookie } = await createTestSessions(apiClient, config, esClient);

    const invalidateBasicUser = await postSessionInvalidate(apiClient, config, {
      match: 'query',
      query: { provider: { type: 'basic', name: 'basic1' }, username: TEST_USERNAME },
    });
    expect(invalidateBasicUser).toHaveStatusCode(200);
    expect(invalidateBasicUser.body.total).toBe(1);

    await assertSessionExpired(apiClient, basicCookie);
    await assertSessionCookie(apiClient, samlCookie, 'a@b.c', SAML_PROVIDER);

    const invalidateSamlUser = await postSessionInvalidate(apiClient, config, {
      match: 'query',
      query: { provider: { type: 'saml', name: 'saml1' }, username: 'a@b.c' },
    });
    expect(invalidateSamlUser).toHaveStatusCode(200);
    expect(invalidateSamlUser.body.total).toBe(1);

    await assertSessionExpired(apiClient, samlCookie);
  });

  test('only super users should be able to invalidate sessions', async ({
    apiClient,
    config,
    esClient,
  }) => {
    const isFips = process.env.TEST_FIPS_MODE === '1';
    test.skip(isFips, 'Skipped in FIPS mode');

    const { basicCookie, samlCookie } = await createTestSessions(apiClient, config, esClient);

    const testAuthHeaders = {
      ...SESSION_API_HEADERS,
      ...basicAuthHeader(TEST_USERNAME, TEST_PASSWORD),
    };

    const forbidden1 = await apiClient.post('/api/security/session/_invalidate', {
      headers: testAuthHeaders,
      body: { match: 'all' },
    });
    expect(forbidden1).toHaveStatusCode(403);

    const forbidden2 = await apiClient.post('/api/security/session/_invalidate', {
      headers: testAuthHeaders,
      body: { match: 'query', query: { provider: { type: 'basic' } } },
    });
    expect(forbidden2).toHaveStatusCode(403);

    const forbidden3 = await apiClient.post('/api/security/session/_invalidate', {
      headers: testAuthHeaders,
      body: {
        match: 'query',
        query: { provider: { type: 'basic' }, username: TEST_USERNAME },
      },
    });
    expect(forbidden3).toHaveStatusCode(403);

    await assertSessionCookie(apiClient, basicCookie, TEST_USERNAME, BASIC_PROVIDER);
    await assertSessionCookie(apiClient, samlCookie, 'a@b.c', SAML_PROVIDER);

    await putNativeUser(
      esClient,
      TEST_USERNAME,
      TEST_PASSWORD,
      ['superuser'],
      'Invalidate Test User'
    );

    const success = await postSessionInvalidate(
      apiClient,
      config,
      { match: 'all' },
      testAuthHeaders
    );
    expect(success).toHaveStatusCode(200);
    expect(success.body.total).toBe(2);

    await assertSessionExpired(apiClient, basicCookie);
    await assertSessionExpired(apiClient, samlCookie);

    await putNativeUser(
      esClient,
      TEST_USERNAME,
      TEST_PASSWORD,
      ['kibana_admin'],
      'Invalidate Test User'
    );
  });
});
