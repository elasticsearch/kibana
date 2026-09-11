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
  assertSessionCookie,
  assertSessionExpired,
  clearAllSessions,
  deleteNativeUser,
  disableSessionAuthcDebugLogs,
  enableSessionAuthcDebugLogs,
  ensureSessionIndexReady,
  finishSAMLHandshake,
  getSessionCount,
  LOCAL_STATEFUL_TAGS,
  loginWithAnonymous,
  loginWithBasic,
  loginWithSAML,
  putNativeUser,
  refreshSessionIndex,
  removeSessionCreatedAt,
  runCleanupTask,
  startSAMLHandshake,
} from '../../../scout_session_management/helpers';

const TEST_USERNAME = 'concurrent_test_user';
const TEST_PASSWORD = 'changeme';
const ANONYMOUS_USERNAME = 'anonymous_user';
const ANONYMOUS_PASSWORD = 'changeme';
const SAML_USERNAME = 'a@b.c';
const BASIC_PROVIDER = { type: 'basic', name: 'basic1' } as const;
const SAML_PROVIDER = { type: 'saml', name: 'saml1' } as const;
const ANONYMOUS_PROVIDER = { type: 'anonymous', name: 'anonymous1' } as const;
// Gives sessions distinct `createdAt` values so cleanup deterministically removes the oldest.
const CREATED_AT_SPACING_MS = 500;

test.describe('Session Concurrent Limit cleanup', { tag: [...LOCAL_STATEFUL_TAGS] }, () => {
  test.beforeAll(async ({ esClient }) => {
    await putNativeUser(
      esClient,
      TEST_USERNAME,
      TEST_PASSWORD,
      ['kibana_admin'],
      'Concurrent Test User'
    );
    await putNativeUser(esClient, ANONYMOUS_USERNAME, ANONYMOUS_PASSWORD, [], 'Guest');
  });

  test.beforeEach(async ({ apiClient, config, esClient }) => {
    await ensureSessionIndexReady(esClient);
    await enableSessionAuthcDebugLogs(esClient);
    await clearAllSessions(apiClient, config, esClient);
  });

  test.afterAll(async ({ esClient }) => {
    await disableSessionAuthcDebugLogs(esClient);
    await deleteNativeUser(esClient, TEST_USERNAME);
    await deleteNativeUser(esClient, ANONYMOUS_USERNAME);
  });

  test('should properly clean up sessions that exceeded concurrent session limit', async ({
    apiClient,
    config,
    esClient,
  }) => {
    test.setTimeout(100000);

    const cookieOne = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await setTimeoutAsync(CREATED_AT_SPACING_MS);
    const cookieTwo = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await setTimeoutAsync(CREATED_AT_SPACING_MS);
    const cookieThree = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(3);

    await runCleanupTask(apiClient, config);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 30000 }).toBe(2);

    await assertSessionExpired(apiClient, cookieOne);

    await assertSessionCookie(apiClient, cookieTwo, TEST_USERNAME, BASIC_PROVIDER);

    await assertSessionCookie(apiClient, cookieThree, TEST_USERNAME, BASIC_PROVIDER);
  });

  test('should properly clean up sessions that exceeded concurrent session limit even for multiple providers', async ({
    apiClient,
    config,
    esClient,
  }) => {
    test.setTimeout(160000);

    const basicCookieOne = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(1);

    const samlCookieOne = await loginWithSAML(apiClient, config);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(2);

    const basicCookieTwo = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(3);

    const samlCookieTwo = await loginWithSAML(apiClient, config);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(4);

    const basicCookieThree = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(5);

    const samlCookieThree = await loginWithSAML(apiClient, config);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(6);

    await runCleanupTask(apiClient, config);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 30000 }).toBe(4);

    await assertSessionExpired(apiClient, basicCookieOne);

    await assertSessionCookie(apiClient, basicCookieTwo, TEST_USERNAME, BASIC_PROVIDER);

    await assertSessionCookie(apiClient, basicCookieThree, TEST_USERNAME, BASIC_PROVIDER);

    await assertSessionExpired(apiClient, samlCookieOne);

    await assertSessionCookie(apiClient, samlCookieTwo, SAML_USERNAME, SAML_PROVIDER);

    await assertSessionCookie(apiClient, samlCookieThree, SAML_USERNAME, SAML_PROVIDER);
  });

  test('should properly clean up sessions that exceeded concurrent session limit when legacy sessions are present', async ({
    apiClient,
    config,
    esClient,
  }) => {
    test.setTimeout(100000);

    const basicCookieOne = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(1);

    const samlCookieOne = await loginWithSAML(apiClient, config);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(2);

    const basicCookieTwo = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(3);

    const samlCookieTwo = await loginWithSAML(apiClient, config);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(4);

    const basicCookieThree = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(5);

    const samlCookieThree = await loginWithSAML(apiClient, config);
    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(6);

    // Make every session document visible before picking the newest one per user and provider.
    await refreshSessionIndex(apiClient, config);
    const aggResponse = await esClient.search({
      index: '.kibana_security_session*',
      size: 0,
      expand_wildcards: 'all',
      ignore_unavailable: true,
      filter_path: 'aggregations.sessions.buckets.top.hits.hits._id',
      aggs: {
        sessions: {
          multi_terms: { terms: [{ field: 'usernameHash' }, { field: 'provider.type' }] },
          aggs: {
            top: { top_hits: { sort: [{ createdAt: { order: 'desc' as const } }], size: 1 } },
          },
        },
      },
    });

    const buckets =
      (
        aggResponse.aggregations as
          | {
              sessions?: {
                buckets?: Array<{ top?: { hits?: { hits?: Array<{ _id?: string }> } } }>;
              };
            }
          | undefined
      )?.sessions?.buckets ?? [];
    const sessionIds = buckets.flatMap((bucket) => {
      const id = bucket.top?.hits?.hits?.[0]?._id;
      return id ? [id] : [];
    });
    expect(sessionIds).toHaveLength(2);

    await removeSessionCreatedAt(apiClient, config, sessionIds);
    await runCleanupTask(apiClient, config);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 30000 }).toBe(4);

    await assertSessionCookie(apiClient, basicCookieOne, TEST_USERNAME, BASIC_PROVIDER);

    await assertSessionCookie(apiClient, basicCookieTwo, TEST_USERNAME, BASIC_PROVIDER);

    await assertSessionExpired(apiClient, basicCookieThree);

    await assertSessionCookie(apiClient, samlCookieOne, SAML_USERNAME, SAML_PROVIDER);

    await assertSessionCookie(apiClient, samlCookieTwo, SAML_USERNAME, SAML_PROVIDER);

    await assertSessionExpired(apiClient, samlCookieThree);
  });

  test('should not clean up session if the limit is not exceeded', async ({
    apiClient,
    config,
    esClient,
  }) => {
    test.setTimeout(100000);

    const cookieOne = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);
    const cookieTwo = await loginWithBasic(apiClient, TEST_USERNAME, TEST_PASSWORD);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(2);

    await runCleanupTask(apiClient, config);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 30000 }).toBe(2);

    await assertSessionCookie(apiClient, cookieOne, TEST_USERNAME, BASIC_PROVIDER);

    await assertSessionCookie(apiClient, cookieTwo, TEST_USERNAME, BASIC_PROVIDER);
  });

  test('should not clean up sessions of the anonymous users', async ({
    apiClient,
    config,
    esClient,
  }) => {
    test.setTimeout(100000);

    const cookieOne = await loginWithAnonymous(apiClient);
    const cookieTwo = await loginWithAnonymous(apiClient);
    const cookieThree = await loginWithAnonymous(apiClient);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(3);

    await runCleanupTask(apiClient, config);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 30000 }).toBe(3);

    for (const cookie of [cookieOne, cookieTwo, cookieThree]) {
      await assertSessionCookie(apiClient, cookie, ANONYMOUS_USERNAME, ANONYMOUS_PROVIDER);
    }
  });

  test('should not clean up unauthenticated sessions', async ({ apiClient, config, esClient }) => {
    test.setTimeout(100000);

    const handshakeOne = await startSAMLHandshake(apiClient);
    const handshakeTwo = await startSAMLHandshake(apiClient);
    const handshakeThree = await startSAMLHandshake(apiClient);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 20000 }).toBe(3);

    await runCleanupTask(apiClient, config);

    await expect.poll(async () => getSessionCount(esClient), { timeout: 30000 }).toBe(3);

    const samlCookieOne = await finishSAMLHandshake(
      apiClient,
      config,
      handshakeOne.cookie,
      handshakeOne.location
    );
    await setTimeoutAsync(CREATED_AT_SPACING_MS);
    const samlCookieTwo = await finishSAMLHandshake(
      apiClient,
      config,
      handshakeTwo.cookie,
      handshakeTwo.location
    );
    await setTimeoutAsync(CREATED_AT_SPACING_MS);
    const samlCookieThree = await finishSAMLHandshake(
      apiClient,
      config,
      handshakeThree.cookie,
      handshakeThree.location
    );

    await refreshSessionIndex(apiClient, config);

    await assertSessionExpired(apiClient, samlCookieOne);

    await assertSessionCookie(apiClient, samlCookieTwo, SAML_USERNAME, SAML_PROVIDER);

    await assertSessionCookie(apiClient, samlCookieThree, SAML_USERNAME, SAML_PROVIDER);
  });
});
