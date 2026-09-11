/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture, EsClient, ScoutTestConfig } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { findSessionCookie } from '@kbn/security-api-integration-helpers';
import {
  getSAMLRequestId,
  getSAMLResponse,
} from '@kbn/security-api-integration-helpers/saml/saml_tools';

export const SESSION_API_HEADERS = {
  'kbn-xsrf': 'xxx',
  'x-elastic-internal-origin': 'kibana',
} as const;

/** Custom session-server suites only run locally — the timeouts/SAML realm are not on Cloud. */
export const LOCAL_STATEFUL_TAGS = ['@local-stateful-classic'] as const;

const SESSION_INDEX = '.kibana_security_session*';

export function samlCallbackUrl(config: ScoutTestConfig): string {
  return new URL('/api/security/saml/callback', config.hosts.kibana).href;
}

export function extractSessionCookie(setCookieHeader: string | string[] | undefined): string {
  return findSessionCookie(setCookieHeader).cookieString();
}

export function basicAuthHeader(username: string, password: string): { Authorization: string } {
  return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
}

export function adminHeaders(config: ScoutTestConfig): Record<string, string> {
  return {
    ...SESSION_API_HEADERS,
    ...basicAuthHeader(config.auth.username, config.auth.password),
  };
}

function searchHitCount(result: { hits: { total?: number | { value: number } | null } }): number {
  const { total } = result.hits;
  if (total == null) {
    return 0;
  }
  return typeof total === 'number' ? total : total.value;
}

export async function ensureSessionIndexReady(esClient: EsClient): Promise<void> {
  await esClient.cluster.health({
    index: SESSION_INDEX,
    wait_for_status: 'green',
    expand_wildcards: 'all',
  });
}

const AUTHC_DEBUG_LOGGER = 'logger.org.elasticsearch.xpack.security.authc';

export async function enableSessionAuthcDebugLogs(esClient: EsClient): Promise<void> {
  await esClient.cluster.putSettings({
    persistent: { [AUTHC_DEBUG_LOGGER]: 'debug' },
  });
}

export async function disableSessionAuthcDebugLogs(esClient: EsClient): Promise<void> {
  await esClient.cluster.putSettings({
    persistent: { [AUTHC_DEBUG_LOGGER]: null },
  });
}

// Reads lag writes until the index refreshes; call `refreshSessionIndex` first or poll.
export async function getSessionCount(esClient: EsClient): Promise<number> {
  const result = await esClient.search({
    index: SESSION_INDEX,
    ignore_unavailable: true,
    expand_wildcards: 'all',
  });
  return searchHitCount(result);
}

export async function assertSessionCookie(
  apiClient: ApiClientFixture,
  cookie: string,
  username: string,
  provider: { type: string; name: string }
): Promise<void> {
  const response = await apiClient.get('/internal/security/me', {
    headers: { ...SESSION_API_HEADERS, Cookie: cookie },
  });
  expect(response).toHaveStatusCode(200);
  expect(response.body.username).toBe(username);
  expect(response.body.authentication_provider).toMatchObject(provider);
}

export async function assertSessionExpired(
  apiClient: ApiClientFixture,
  cookie: string
): Promise<void> {
  const response = await apiClient.get('/internal/security/me', {
    headers: { ...SESSION_API_HEADERS, Cookie: cookie },
  });
  expect(response).toHaveStatusCode(401);
}

export async function getSessionsCreatedAt(esClient: EsClient): Promise<number[]> {
  const result = await esClient.search({
    index: SESSION_INDEX,
    ignore_unavailable: true,
    expand_wildcards: 'all',
  });
  return result.hits.hits
    .map((hit) => {
      const source = hit._source as { createdAt?: number } | undefined;
      return source?.createdAt ?? 0;
    })
    .sort((a, b) => a - b);
}

type InvalidateSessionBody =
  | { match: 'all' }
  | {
      match: 'query';
      query: { provider: { type: string; name?: string }; username?: string };
    };

export async function postSessionInvalidate(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig,
  body: InvalidateSessionBody,
  headers: Record<string, string> = adminHeaders(config)
): Promise<{ statusCode: number; body: { total: number } }> {
  const response = await apiClient.post('/api/security/session/_invalidate', {
    headers,
    body,
  });
  return { statusCode: response.statusCode, body: { total: response.body.total } };
}

async function pollInvalidateUntilOk(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig,
  body: InvalidateSessionBody
): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await postSessionInvalidate(apiClient, config, body);
        return response.statusCode;
      },
      { timeout: 15000 }
    )
    .toBe(200);
}

// Sessions are written with `refresh: false`, so refresh before the delete-by-query and the count.
export async function clearAllSessions(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig,
  esClient: EsClient
): Promise<void> {
  await expect
    .poll(
      async () => {
        await refreshSessionIndex(apiClient, config);
        const response = await postSessionInvalidate(apiClient, config, { match: 'all' });
        if (response.statusCode !== 200) {
          return -1;
        }
        await refreshSessionIndex(apiClient, config);
        return getSessionCount(esClient);
      },
      { timeout: 15000 }
    )
    .toBe(0);
}

export async function invalidateMatchingSessions(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig,
  query: Extract<InvalidateSessionBody, { match: 'query' }>['query']
): Promise<void> {
  await pollInvalidateUntilOk(apiClient, config, { match: 'query', query });
}

export async function loginWithBasic(
  apiClient: ApiClientFixture,
  username: string,
  password: string,
  providerName = 'basic1'
): Promise<string> {
  const response = await apiClient.post('/internal/security/login', {
    headers: SESSION_API_HEADERS,
    body: {
      providerType: 'basic',
      providerName,
      currentURL: '/',
      params: { username, password },
    },
  });
  expect(response).toHaveStatusCode(200);
  return extractSessionCookie(response.headers['set-cookie']);
}

export async function startSAMLHandshake(
  apiClient: ApiClientFixture,
  providerName = 'saml1'
): Promise<{ cookie: string; location: string }> {
  const handshakeResponse = await apiClient.post('/internal/security/login', {
    headers: SESSION_API_HEADERS,
    body: { providerType: 'saml', providerName, currentURL: '' },
  });
  expect(handshakeResponse).toHaveStatusCode(200);
  return {
    cookie: extractSessionCookie(handshakeResponse.headers['set-cookie']),
    location: handshakeResponse.body.location,
  };
}

export async function finishSAMLHandshake(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig,
  handshakeCookie: string,
  handshakeLocation: string
): Promise<string> {
  const samlResponse = await getSAMLResponse({
    destination: samlCallbackUrl(config),
    sessionIndex: String(Math.floor(Math.random() * 1000000)),
    inResponseTo: await getSAMLRequestId(handshakeLocation),
  });

  const authResponse = await apiClient.post('/api/security/saml/callback', {
    headers: { ...SESSION_API_HEADERS, Cookie: handshakeCookie },
    body: { SAMLResponse: samlResponse },
  });
  expect(authResponse.statusCode).toBe(302);
  return extractSessionCookie(authResponse.headers['set-cookie']);
}

export async function loginWithSAML(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig,
  providerName = 'saml1'
): Promise<string> {
  const { cookie, location } = await startSAMLHandshake(apiClient, providerName);
  const sessionCookie = await finishSAMLHandshake(apiClient, config, cookie, location);
  // Flush the pre-auth doc deletion so callers polling getSessionCount see the
  // correct count without waiting for the next auto-refresh cycle.
  await refreshSessionIndex(apiClient, config);
  await assertSessionCookie(apiClient, sessionCookie, 'a@b.c', {
    type: 'saml',
    name: providerName,
  });
  return sessionCookie;
}

export async function loginWithAnonymous(apiClient: ApiClientFixture): Promise<string> {
  const response = await apiClient.post('/internal/security/login', {
    headers: SESSION_API_HEADERS,
    body: { providerType: 'anonymous', providerName: 'anonymous1', currentURL: '/' },
  });
  expect(response).toHaveStatusCode(200);
  return extractSessionCookie(response.headers['set-cookie']);
}

export async function runCleanupTask(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig
): Promise<void> {
  // runSoon() 500s if the periodic cleanup interval already claimed the task.
  await expect
    .poll(
      async () => {
        const response = await apiClient.post('/session/_run_cleanup', {
          headers: adminHeaders(config),
        });
        return response.statusCode;
      },
      { timeout: 30000 }
    )
    .toBe(200);
}

export async function refreshSessionIndex(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig
): Promise<void> {
  const response = await apiClient.post('/session/_refresh_session_index', {
    headers: adminHeaders(config),
  });
  expect(response).toHaveStatusCode(200);
}

export async function toggleSessionCleanupTask(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig,
  enabled: boolean
): Promise<void> {
  const response = await apiClient.post('/session/toggle_cleanup_task', {
    headers: adminHeaders(config),
    body: { enabled },
  });
  expect(response).toHaveStatusCode(200);
}

export async function removeSessionCreatedAt(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig,
  ids: string[]
): Promise<void> {
  const response = await apiClient.post('/session/_remove_created_at', {
    headers: adminHeaders(config),
    body: { ids },
  });
  expect(response).toHaveStatusCode(200);
}

export async function simulatePointInTimeFailure(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig,
  simulate: boolean
): Promise<void> {
  const response = await apiClient.post('/simulate_point_in_time_failure', {
    headers: adminHeaders(config),
    body: { simulateOpenPointInTimeFailure: simulate },
  });
  expect(response).toHaveStatusCode(200);
}

export async function getCleanupTaskStatus(
  apiClient: ApiClientFixture
): Promise<{ shardMissingCounter?: number }> {
  const response = await apiClient.get('/cleanup_task_status');
  expect(response).toHaveStatusCode(200);
  return response.body.state;
}

export async function resetCleanupTask(
  apiClient: ApiClientFixture,
  config: ScoutTestConfig
): Promise<void> {
  // Successful cleanup is what zeros the counter; leave simulation on and each poll increments it.
  await simulatePointInTimeFailure(apiClient, config, false);
  await expect
    .poll(
      async () => {
        await runCleanupTask(apiClient, config);
        const state = await getCleanupTaskStatus(apiClient);
        return state.shardMissingCounter ?? 0;
      },
      { timeout: 60000 }
    )
    .toBe(0);
}

export async function putNativeUser(
  esClient: EsClient,
  username: string,
  password: string,
  roles: string[],
  fullName: string
): Promise<void> {
  await esClient.security.putUser({
    username,
    password,
    roles,
    full_name: fullName,
  });
}

export async function deleteNativeUser(esClient: EsClient, username: string): Promise<void> {
  await esClient.security.deleteUser({ username }, { ignore: [404] });
}
