/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture, KibanaRole } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import {
  syntheticsAppPublicRestApiRoutes,
  syntheticsAppRestApiRoutes,
} from '../../../../../server/routes';
import { SYNTHETICS_API_URLS as COMMON_API_URLS } from '../../../../../common/constants';
import { apiTest, mergeSyntheticsApiHeaders } from '../../../common/fixtures';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface SweepRoute {
  method: Method;
  path: string;
  writeAccess: boolean;
  anyRequiredPrivileges?: string[];
}

/**
 * GET routes that intentionally require `uptime-write` in addition to
 * `uptime-read`. Mirrors the FTR allow-list: any other GET route is expected to
 * be gated by `[uptime-read]` only, so the 403 message check below acts as a
 * tripwire against accidental `writeAccess: true` on a GET route.
 */
const GET_ROUTES_REQUIRING_WRITE_ACCESS: ReadonlySet<string> = new Set([
  COMMON_API_URLS.SYNTHETICS_DIAGNOSTICS,
]);

const allRoutes: SweepRoute[] = syntheticsAppRestApiRoutes
  .concat(syntheticsAppPublicRestApiRoutes)
  .map((routeFn) => {
    const route = routeFn();
    return {
      method: route.method as Method,
      path: route.path,
      writeAccess: route.writeAccess ?? true,
      anyRequiredPrivileges: route.anyRequiredPrivileges,
    };
  });

/** The Kibana privilege tag the authz layer reports in the 403 message. */
const expectedBodyTag = (route: SweepRoute, readUser: boolean): string => {
  const { method, path, writeAccess } = route;
  const isPrivateLocationWrite =
    (method === 'POST' || method === 'DELETE' || method === 'PUT') &&
    path.includes('private_locations');

  if (isPrivateLocationWrite) {
    return readUser
      ? '[private-location-write,uptime-write]'
      : '[uptime-read,private-location-write,uptime-write]';
  }

  // Routes with an OR-set (e.g. run-test: `uptime-write` OR `monitor-run-manually`). A read
  // user is missing every OR member; a no-access user is additionally missing `uptime-read`.
  if (route.anyRequiredPrivileges?.length) {
    const anyPrivs = route.anyRequiredPrivileges.join(',');
    return readUser ? `[${anyPrivs}]` : `[uptime-read,${anyPrivs}]`;
  }

  if (method === 'GET') {
    return GET_ROUTES_REQUIRING_WRITE_ACCESS.has(path)
      ? readUser
        ? '[uptime-write]'
        : '[uptime-read,uptime-write]'
      : '[uptime-read]';
  }

  if (!writeAccess) {
    return '[uptime-read]';
  }
  return readUser ? '[uptime-write]' : '[uptime-read,uptime-write]';
};

const request = (
  apiClient: ApiClientFixture,
  method: Method,
  path: string,
  headers: Record<string, string>
) => {
  const options = { headers, body: {}, responseType: 'json' as const };
  switch (method) {
    case 'GET':
      return apiClient.get(path, { headers, responseType: 'json' });
    case 'POST':
      return apiClient.post(path, options);
    case 'PUT':
      return apiClient.put(path, options);
    case 'DELETE':
      return apiClient.delete(path, options);
  }
};

apiTest.describe('SyntheticsAPISecurity', { tag: tags.stateful.classic }, () => {
  let spaceId: string;
  let noAccessHeaders: Record<string, string>;
  let readHeaders: Record<string, string>;

  apiTest.beforeAll(async ({ requestAuth, kbnClient }) => {
    spaceId = `test-space-${uuidv4()}`;
    await kbnClient.spaces.create({ id: spaceId, name: `test-space-name ${uuidv4()}` });

    const noAccessRole: KibanaRole = {
      elasticsearch: { cluster: [] },
      kibana: [{ base: [], feature: { slo: ['all'] }, spaces: ['*'] }],
    };
    const readRole: KibanaRole = {
      elasticsearch: { cluster: [] },
      kibana: [{ base: [], feature: { uptime: ['read'], slo: ['all'] }, spaces: ['*'] }],
    };

    const { apiKeyHeader: noAccessKey } = await requestAuth.getApiKeyForCustomRole(noAccessRole);
    noAccessHeaders = mergeSyntheticsApiHeaders(noAccessKey);
    const { apiKeyHeader: readKey } = await requestAuth.getApiKeyForCustomRole(readRole);
    readHeaders = mergeSyntheticsApiHeaders(readKey);
  });

  apiTest.afterAll(async ({ kbnClient }) => {
    if (spaceId) {
      await kbnClient.spaces.delete(spaceId).catch(() => {});
    }
  });

  const verifyForbiddenMessage = (
    body: { message?: string },
    route: SweepRoute,
    readUser: boolean
  ) => {
    const message = body?.message ?? '';
    // Index-privilege failures surface a different message that the FTR
    // original also skips.
    if (message.includes('MissingIndicesPrivileges:')) {
      return;
    }
    expect(decodeURIComponent(message)).toBe(
      `API [${route.method} ${
        route.path
      }] is unauthorized for user, this action is granted by the Kibana privileges ${expectedBodyTag(
        route,
        readUser
      )}`
    );
  };

  apiTest('throws permissions errors for un-auth user', async ({ apiClient }) => {
    for (const route of allRoutes) {
      const res = await request(
        apiClient,
        route.method,
        `s/${spaceId}${route.path}`,
        noAccessHeaders
      );
      expect(res.statusCode).toBe(403);
      verifyForbiddenMessage(res.body as { message?: string }, route, false);
    }
  });

  apiTest('throws permissions errors for read user', async ({ apiClient }) => {
    for (const route of allRoutes) {
      // Skip pure read routes, but keep OR-set routes (e.g. run-test) — a read user
      // still lacks every OR member and should be rejected.
      if (!route.writeAccess && !route.anyRequiredPrivileges?.length) {
        continue;
      }
      const res = await request(apiClient, route.method, `s/${spaceId}${route.path}`, readHeaders);
      expect([200, 403, 500, 400, 404]).toContain(res.statusCode);
      if (res.statusCode === 403) {
        verifyForbiddenMessage(res.body as { message?: string }, route, true);
      }
    }
  });
});
