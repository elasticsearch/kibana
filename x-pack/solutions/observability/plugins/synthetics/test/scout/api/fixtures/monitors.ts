/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit, omitBy } from 'lodash';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import {
  removeMonitorEmptyValues,
  transformPublicKeys,
} from '../../../../server/routes/monitor_cruds/formatters/saved_object_to_monitor';
import { PUBLIC_API_VERSION } from './constants';

/** Gateway statuses the FTR monitor delete helper treats as retryable. */
const TRANSIENT_DELETE_STATUSES = [502, 503, 504];

const monitorsPath = (spaceId?: string) =>
  spaceId ? `s/${spaceId}/api/synthetics/monitors` : 'api/synthetics/monitors';

const withPublicApiVersion = (headers: Record<string, string>) => ({
  ...headers,
  'elastic-api-version': PUBLIC_API_VERSION,
});

/**
 * Thin wrapper around `POST /api/synthetics/monitors` for Scout API specs.
 *
 * Mirrors the FTR `addMonitorAPIHelper` from
 * `apis/synthetics/create_monitor.ts` but uses `apiClient` instead of
 * `supertest`. The caller supplies the auth headers (typically API key +
 * internal origin).
 *
 * The `elastic-api-version` header is required because this is a versioned
 * public API route (`router.versioned.post`).
 */
export async function addMonitor(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  monitor: Record<string, unknown>,
  opts: {
    gettingStarted?: boolean;
    savedObjectType?: string;
    id?: string;
    statusCode?: number;
    spaceId?: string;
  } = {}
) {
  const { gettingStarted, savedObjectType, id, statusCode = 200, spaceId } = opts;
  const qs: string[] = [];
  if (gettingStarted) qs.push('gettingStarted=true');
  if (savedObjectType) qs.push(`savedObjectType=${savedObjectType}`);
  if (id) qs.push(`id=${id}`);
  const path = `${monitorsPath(spaceId)}${qs.length ? `?${qs.join('&')}` : ''}`;

  const res = await apiClient.post(path, {
    headers: { ...headers, 'elastic-api-version': PUBLIC_API_VERSION },
    body: monitor,
    responseType: 'json',
  });
  expect(res).toHaveStatusCode(statusCode);
  return res;
}

/**
 * Thin wrapper around `PUT /api/synthetics/monitors/{id}` for Scout API specs.
 *
 * Mirrors the FTR `editMonitorAPIHelper` from the `edit_monitor_public_api*`
 * suites. The caller supplies the auth headers (typically API key + internal
 * origin) and the expected `statusCode`.
 */
export async function editMonitor(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  monitorId: string,
  monitor: unknown,
  opts: { statusCode?: number } = {}
) {
  const { statusCode = 200 } = opts;
  const res = await apiClient.put(`api/synthetics/monitors/${monitorId}`, {
    headers: { ...headers, 'elastic-api-version': PUBLIC_API_VERSION },
    body: monitor,
    responseType: 'json',
  });
  expect(res).toHaveStatusCode(statusCode);
  return res;
}

/**
 * Keys removed from the *expected* monitor input before comparing it against a
 * create/edit response. Ported verbatim from the FTR `create_monitor.ts`
 * `keyToOmitList`.
 */
export const keyToOmitList = [
  'created_at',
  'updated_at',
  'id',
  'config_id',
  'form_monitor_type',
  'spaceId',
  'private_locations',
];

/**
 * Normalizes an *expected* monitor input the same way the public API
 * serializes a monitor saved object: applies the public-key transform, drops
 * server-generated keys, then strips empty values. Mirrors `omitMonitorKeys`
 * from the FTR `create_monitor.ts` so migrated specs can assert deep equality.
 */
export const omitMonitorKeys = (monitor: Record<string, unknown>) =>
  omitBy(
    omit(transformPublicKeys(monitor as Parameters<typeof transformPublicKeys>[0]), keyToOmitList),
    removeMonitorEmptyValues
  );

const RESPONSE_OMIT_KEYS = ['created_at', 'updated_at', 'id', 'config_id', 'form_monitor_type'];

/**
 * Strips the server-generated fields from a create/edit response body so it
 * can be compared against `omitMonitorKeys(expectedInput)`. Mirrors the
 * response-side `omit(...)` in the FTR add/edit helpers.
 */
export const parseMonitorResponse = (body: Record<string, unknown>) =>
  omit(body, RESPONSE_OMIT_KEYS);

/** Drops only the server-generated timestamps. Ported from FTR `helpers/monitor.ts`. */
export const omitResponseTimestamps = (monitor: object) =>
  omit(monitor, ['created_at', 'updated_at']);

/**
 * Drops timestamps and re-adds `url` last so empty-vs-present `url` ordering
 * matches the create/edit response shape. Ported from FTR `helpers/monitor.ts`.
 */
export const omitEmptyValues = (monitor: object) => {
  const { url, ...rest } = omit(monitor, ['created_at', 'updated_at']) as Record<string, unknown>;
  return {
    ...rest,
    ...(url ? { url } : {}),
  };
};

/**
 * `POST /api/synthetics/monitors?internal=true` — saves a monitor and returns
 * the internal (UI-shaped) representation. Mirrors the `saveMonitor` helpers in
 * the FTR `edit_monitor*` / `get_monitor` suites.
 */
export async function saveMonitorInternal(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  monitor: Record<string, unknown>,
  opts: { spaceId?: string; savedObjectType?: string; statusCode?: number } = {}
) {
  const { spaceId, savedObjectType, statusCode = 200 } = opts;
  const query = `?internal=true${savedObjectType ? `&savedObjectType=${savedObjectType}` : ''}`;
  const res = await apiClient.post(`${monitorsPath(spaceId)}${query}`, {
    headers: withPublicApiVersion(headers),
    body: monitor,
    responseType: 'json',
  });
  expect(res).toHaveStatusCode(statusCode);
  return res;
}

/**
 * `PUT /api/synthetics/monitors/{id}?internal=true` — edits a monitor and
 * returns the internal representation. Mirrors the FTR `editMonitor` helper.
 */
export async function editMonitorInternal(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  monitorId: string,
  monitor: Record<string, unknown> | unknown,
  opts: { spaceId?: string; statusCode?: number } = {}
) {
  const { spaceId, statusCode = 200 } = opts;
  const res = await apiClient.put(`${monitorsPath(spaceId)}/${monitorId}?internal=true`, {
    headers: withPublicApiVersion(headers),
    body: monitor,
    responseType: 'json',
  });
  expect(res).toHaveStatusCode(statusCode);
  return res;
}

/**
 * `GET /api/synthetics/monitors/{id}` — fetches a single monitor. For a 200
 * response, validates the server-generated fields and returns both the raw
 * body and a `body` with those fields stripped, mirroring the FTR
 * `SyntheticsMonitorTestService.getMonitor` contract.
 */
export async function getMonitor(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  monitorId: string,
  opts: { space?: string; internal?: boolean; statusCode?: number } = {}
) {
  const { space, internal, statusCode = 200 } = opts;
  const path = `${monitorsPath(space)}/${monitorId}${internal ? '?internal=true' : ''}`;
  const res = await apiClient.get(path, {
    headers: withPublicApiVersion(headers),
    responseType: 'json',
  });
  expect(res).toHaveStatusCode(statusCode);

  if (statusCode !== 200) {
    return { rawBody: res.body, body: res.body };
  }

  const body = res.body as Record<string, unknown>;
  expect(Boolean(body.id)).toBe(true);
  expect(Boolean(body.config_id)).toBe(true);
  expect(Boolean(body.spaceId)).toBe(true);
  expect(Number.isNaN(new Date(body.created_at as string).getTime())).toBe(false);
  expect(Number.isNaN(new Date(body.updated_at as string).getTime())).toBe(false);

  return {
    rawBody: omit(body, ['spaceId']),
    body: omit(body, [
      'created_at',
      'updated_at',
      'id',
      'config_id',
      'form_monitor_type',
      'spaceId',
    ]),
  };
}

/**
 * `GET /api/synthetics/monitors?<query>` — lists monitors. Used by the
 * `get_monitor` paging/filtering specs.
 */
export async function listMonitors(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  query: string = '',
  opts: { spaceId?: string } = {}
) {
  const { spaceId } = opts;
  const res = await apiClient.get(`${monitorsPath(spaceId)}${query ? `?${query}` : ''}`, {
    headers: withPublicApiVersion(headers),
    responseType: 'json',
  });
  expect(res).toHaveStatusCode(200);
  return res;
}

/**
 * `DELETE /api/synthetics/monitors` with `{ ids }` body. For the 200 path it
 * retries transient gateway failures (mirrors the FTR 60s `retry.tryForTime`).
 */
export async function deleteMonitors(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  ids: string[],
  opts: { spaceId?: string; statusCode?: number } = {}
) {
  const { spaceId, statusCode = 200 } = opts;
  const path = monitorsPath(spaceId);
  const send = () =>
    apiClient.delete(path, {
      headers: withPublicApiVersion(headers),
      body: { ids },
      responseType: 'json',
    });

  if (statusCode !== 200) {
    const res = await send();
    expect(res).toHaveStatusCode(statusCode);
    return res;
  }

  const deadline = Date.now() + 60_000;
  let res = await send();
  while (TRANSIENT_DELETE_STATUSES.includes(res.statusCode) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    res = await send();
  }
  expect(res).toHaveStatusCode(statusCode);
  return res;
}

/**
 * `DELETE /api/synthetics/monitors/{id}` (id via path param). Same transient
 * retry semantics as {@link deleteMonitors}.
 */
export async function deleteMonitorByIdParam(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  monitorId: string,
  opts: { spaceId?: string; statusCode?: number } = {}
) {
  const { spaceId, statusCode = 200 } = opts;
  const path = `${monitorsPath(spaceId)}/${monitorId}`;
  const send = () =>
    apiClient.delete(path, {
      headers: withPublicApiVersion(headers),
      responseType: 'json',
    });

  if (statusCode !== 200) {
    const res = await send();
    expect(res).toHaveStatusCode(statusCode);
    return res;
  }

  const deadline = Date.now() + 60_000;
  let res = await send();
  while (TRANSIENT_DELETE_STATUSES.includes(res.statusCode) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    res = await send();
  }
  expect(res).toHaveStatusCode(statusCode);
  return res;
}

/**
 * `POST /api/synthetics/monitor/test/{id}` — triggers a manual test run.
 * Mirrors the FTR `testNowMonitor` helper.
 */
export async function testNowMonitor(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  monitorId: string,
  opts: { spaceId?: string; statusCode?: number } = {}
) {
  const { spaceId, statusCode = 200 } = opts;
  const base = spaceId ? `s/${spaceId}/api/synthetics/monitor/test` : 'api/synthetics/monitor/test';
  const res = await apiClient.post(`${base}/${monitorId}`, {
    headers: withPublicApiVersion(headers),
    responseType: 'json',
  });
  expect(res).toHaveStatusCode(statusCode);
  return res;
}

/**
 * `POST /api/synthetics/monitor/test/{id}` is for individual monitors; this is
 * `PUT /internal/synthetics/private_locations/_cleanup` — triggers the orphaned
 * package-policy cleanup. Mirrors the FTR `triggerCleanup` helper.
 */
export async function triggerPrivateLocationCleanup(
  apiClient: ApiClientFixture,
  headers: Record<string, string>
) {
  const res = await apiClient.put('internal/synthetics/private_locations/_cleanup', {
    headers,
    responseType: 'json',
  });
  expect(res).toHaveStatusCode(200);
  return res;
}

/**
 * `POST /internal/synthetics/monitors/{id}/_reset` — re-syncs a monitor's Fleet
 * package policies. Mirrors the FTR `resetMonitor` helper.
 */
export async function resetMonitor(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  monitorId: string,
  opts: { force?: boolean; spaceId?: string; statusCode?: number } = {}
) {
  const { force = false, spaceId, statusCode = 200 } = opts;
  const base = spaceId ? `s/${spaceId}/` : '';
  const res = await apiClient.post(
    `${base}internal/synthetics/monitors/${monitorId}/_reset?force=${force}`,
    { headers, responseType: 'json' }
  );
  expect(res).toHaveStatusCode(statusCode);
  return res;
}

/**
 * `POST /internal/synthetics/monitors/_bulk_reset` — re-syncs many monitors'
 * Fleet package policies in a single request. Mirrors the FTR `bulkResetMonitors`
 * helper.
 */
export async function bulkResetMonitors(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  ids: string[],
  opts: { spaceId?: string; statusCode?: number } = {}
) {
  const { spaceId, statusCode = 200 } = opts;
  const base = spaceId ? `s/${spaceId}/` : '';
  const res = await apiClient.post(`${base}internal/synthetics/monitors/_bulk_reset`, {
    headers,
    body: { ids },
    responseType: 'json',
  });
  expect(res).toHaveStatusCode(statusCode);
  return res;
}

/**
 * `PUT /api/synthetics/monitors/_bulk_update` — partial-update many monitors in
 * one request. Each `updates` entry carries its own `{ id, attributes }` patch,
 * so a single request can apply a different change per monitor. Public versioned
 * route, so we send `elastic-api-version` like the other monitor helpers; the
 * internal-origin header set by `mergeSyntheticsApiHeaders` is what actually lets
 * the versioned router resolve the call without per-call version negotiation.
 */
export async function bulkUpdateMonitors(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  body: { updates: Array<{ id: string; attributes: Record<string, unknown> }> },
  opts: { spaceId?: string; statusCode?: number } = {}
) {
  const { spaceId, statusCode = 200 } = opts;
  const path = `${monitorsPath(spaceId)}/_bulk_update`;
  const res = await apiClient.put(path, {
    headers: withPublicApiVersion(headers),
    body,
    responseType: 'json',
  });
  expect(res).toHaveStatusCode(statusCode);
  return res;
}

/**
 * `POST /internal/synthetics/service/monitor/inspect` — inspects a monitor and
 * returns the would-be Fleet policy. Mirrors the FTR
 * `SyntheticsMonitorTestService.inspectMonitor`: it strips the server-generated
 * `id` / `config_id` identifiers and per-run secrets (api_key, license info,
 * stack_version) so callers can assert against a stable shape.
 */
export async function inspectMonitor(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  monitor: Record<string, unknown>,
  opts: { hideParams?: boolean; statusCode?: number } = {}
) {
  const { hideParams = true, statusCode = 200 } = opts;
  const res = await apiClient.post(
    `internal/synthetics/service/monitor/inspect?hideParams=${hideParams}`,
    {
      headers,
      body: monitor,
      responseType: 'json',
    }
  );
  expect(res).toHaveStatusCode(statusCode);

  const body = res.body as {
    result: {
      publicConfigs?: Array<Record<string, any>>;
      privateConfig: any;
    };
    decodedCode: string;
    [key: string]: any;
  };

  const publicConfig = body.result?.publicConfigs?.[0];
  const monitor0 = publicConfig?.monitors?.[0];
  if (monitor0) {
    delete monitor0.id;
    delete monitor0.streams?.[0]?.id;
    delete monitor0.streams?.[0]?.config_id;
    if (monitor0.streams?.[0]?.fields) {
      delete monitor0.streams[0].fields.config_id;
    }
  }
  if (publicConfig) {
    delete publicConfig.output?.api_key;
    delete publicConfig.license_issued_to;
    delete publicConfig.stack_version;
  }

  return body;
}

/**
 * `PUT /internal/synthetics/service/enablement` — enables synthetics. Internal
 * route, so no `elastic-api-version` header (matching the FTR enablement call).
 */
export async function enableSynthetics(
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  opts: { spaceId?: string } = {}
) {
  const { spaceId } = opts;
  const base = spaceId
    ? `s/${spaceId}/internal/synthetics/service/enablement`
    : 'internal/synthetics/service/enablement';
  const res = await apiClient.put(base, { headers, responseType: 'json' });
  expect(res).toHaveStatusCode(200);
  return res;
}
