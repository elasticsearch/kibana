/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { KibanaRole } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import {
  apiTest,
  KIBANA_HEADERS,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import {
  addMonitor,
  deleteMonitors,
  enableSynthetics,
  listMonitors,
} from '../../../common/fixtures/monitors';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';
import { browserMonitorFixture } from '../../../common/fixtures/data/browser_monitor';

/** Elasticsearch privileges of the synthetics service writer (`getServiceApiKeyPrivileges(false)`). */
const SYNTHETICS_SERVICE_ES_PRIVILEGES = {
  cluster: ['monitor', 'read_pipeline', 'read_ilm'],
  indices: [
    {
      names: ['synthetics-*'],
      privileges: ['view_index_metadata', 'create_doc', 'auto_configure', 'read'],
    },
  ],
};

const UPTIME_ALL_ROLE: KibanaRole = {
  elasticsearch: SYNTHETICS_SERVICE_ES_PRIVILEGES,
  kibana: [{ base: [], feature: { uptime: ['all'] }, spaces: ['*'] }],
};

const UPTIME_READ_ROLE: KibanaRole = {
  elasticsearch: SYNTHETICS_SERVICE_ES_PRIVILEGES,
  kibana: [{ base: [], feature: { uptime: ['read'] }, spaces: ['*'] }],
};

/**
 * Ported from FTR `apis/synthetics/add_monitor.ts` (`AddNewMonitorsUI`).
 *
 * Covers the API-key/role permission paths, the private-location validation
 * rollback (no orphaned monitor), and the public-location timeout warnings —
 * behaviors not exercised by `create_monitor.spec.ts`.
 *
 * The FTR suite minted Kibana API keys with `kibana_role_descriptors` and
 * created bespoke ES users + basic auth. Scout resolves the equivalent scoped
 * credentials with `requestAuth.getApiKey` / `getApiKeyForCustomRole`. The
 * suite is `@local-stateful-classic` only: it depends on api-key/role auth and
 * public service locations that the FTR original tagged `skipCloud`.
 */
apiTest.describe(
  'AddNewMonitorsUI permissions and warnings',
  { tag: tags.local.stateful.classic },
  () => {
    let editorHeaders: Record<string, string>;
    let uptimeAllHeaders: Record<string, string>;
    let uptimeReadHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth, samlAuth, apiClient, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });

      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey, { Accept: 'application/json' });
      const { apiKeyHeader: allKey } = await requestAuth.getApiKeyForCustomRole(UPTIME_ALL_ROLE);
      uptimeAllHeaders = mergeSyntheticsApiHeaders(allKey, { Accept: 'application/json' });
      const { apiKeyHeader: readKey } = await requestAuth.getApiKeyForCustomRole(UPTIME_READ_ROLE);
      uptimeReadHeaders = mergeSyntheticsApiHeaders(readKey, { Accept: 'application/json' });

      // Enabling synthetics creates a nested service api key, which fails under
      // api-key auth — use an interactive admin (cookie) session instead.
      const { cookieHeader: adminCookie } = await samlAuth.asInteractiveUser('admin');
      await enableSynthetics(apiClient, { ...KIBANA_HEADERS, ...adminCookie });
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    });

    apiTest('can create monitor with API key with proper permissions', async ({ apiClient }) => {
      const monitor = {
        ...httpMonitorFixture,
        name: `monitor with api key ${uuidv4()}`,
        locations: ['dev'],
      };
      const res = await addMonitor(apiClient, uptimeAllHeaders, monitor);
      const { id } = res.body as { id: string };
      await deleteMonitors(apiClient, uptimeAllHeaders, [id]);
    });

    apiTest(
      'can not create monitor with API key without proper permissions',
      async ({ apiClient }) => {
        const monitor = {
          ...httpMonitorFixture,
          name: `monitor read key ${uuidv4()}`,
          locations: ['dev'],
        };
        const res = await addMonitor(apiClient, uptimeReadHeaders, monitor, { statusCode: 403 });
        expect((res.body as { message: string }).message).toBe(
          'API [POST /api/synthetics/monitors] is unauthorized for user, this action is granted by the Kibana privileges [uptime-write]'
        );
      }
    );

    apiTest(
      'rejects a monitor pointing at a missing private location and leaves no orphan',
      async ({ apiClient }) => {
        const name = `Monitor with private location ${uuidv4()}`;
        const res = await addMonitor(
          apiClient,
          uptimeAllHeaders,
          {
            name,
            type: 'http',
            urls: 'https://elastic.co',
            locations: [{ id: 'policy-id', label: 'Private Europe West', isServiceManaged: false }],
          },
          { statusCode: 400 }
        );
        expect((res.body as { message: string }).message).toBe(
          "Invalid locations specified. Private Location(s) 'policy-id' not found. No private location available to use."
        );

        // The monitor must not have been persisted.
        const listed = await listMonitors(
          apiClient,
          uptimeAllHeaders,
          `query=${encodeURIComponent(name)}`
        );
        expect((listed.body as { total: number }).total).toBe(0);
      }
    );

    apiTest('returns warning for browser timeout with public locations', async ({ apiClient }) => {
      const monitor = {
        ...browserMonitorFixture,
        name: `Browser timeout warning ${uuidv4()}`,
        locations: ['dev'],
        timeout: '30',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);
      const body = res.body as {
        id: string;
        warnings: Array<{ monitorId: string; message: string; publicLocationIds: string[] }>;
      };
      expect(body.warnings).toHaveLength(1);
      const [warning] = body.warnings;
      expect(warning.monitorId).toBe(body.id);
      expect(warning.message).toContain('timeout');
      expect(warning.message).toContain('running on public locations');
      expect(warning.message).toContain('The timeout will have no effect on these locations');
      expect(Array.isArray(warning.publicLocationIds)).toBe(true);
      expect(warning.publicLocationIds.length).toBeGreaterThan(0);

      await deleteMonitors(apiClient, editorHeaders, [body.id]);
    });

    apiTest('allows lightweight monitor timeout below 30s', async ({ apiClient }) => {
      const monitor = {
        ...httpMonitorFixture,
        name: `Lightweight timeout ${uuidv4()}`,
        locations: ['dev'],
        timeout: '1',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);
      const { id } = res.body as { id: string };
      await deleteMonitors(apiClient, editorHeaders, [id]);
    });
  }
);
