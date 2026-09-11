/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ApiClientFixture, KbnClient, KibanaRole } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { apiTest, mergeSyntheticsApiHeaders } from '../../../common/fixtures';
import { addMonitor } from '../../../common/fixtures/monitors';

/**
 * Covers `GET /internal/synthetics/monitors/maintenance_windows`.
 *
 * This route resolves maintenance windows with the internal maintenance-window client, so a
 * Synthetics **read-only** user (who does not hold the `read-maintenance-window` privilege)
 * can still load them — previously the overview called the alerting endpoints directly and
 * got a 403. To keep that elevated read narrow, the route only returns windows **referenced
 * by a monitor in the caller's space**; it cannot be used to enumerate every window in the
 * space. These tests lock in that contract plus the small field projection.
 *
 * The unauthorized (no `uptime-read`) 403 case is already covered for every route by
 * `synthetics_api_security.spec.ts`.
 */

const MW_ROUTE = 'internal/synthetics/monitors/maintenance_windows';
const MAINTENANCE_WINDOW_API = '/internal/alerting/rules/maintenance_window';
const SYNTHETICS_MONITOR_TYPES = ['synthetics-monitor', 'synthetics-monitor-multi-space'];
const MW_DURATION_MS = 60 * 60 * 1000;
const EXPECTED_FIELDS = ['id', 'title', 'status', 'updatedAt'].sort();

const spacePrefix = (spaceId?: string) => (spaceId && spaceId !== 'default' ? `/s/${spaceId}` : '');
const routePath = (spaceId?: string) =>
  spaceId && spaceId !== 'default' ? `s/${spaceId}/${MW_ROUTE}` : MW_ROUTE;

interface CreatedMaintenanceWindow {
  id: string;
  title: string;
}

interface MaintenanceWindowResponseItem {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

const createMaintenanceWindow = async (
  kbnClient: KbnClient,
  spaceId?: string
): Promise<CreatedMaintenanceWindow> => {
  const { data } = await kbnClient.request<CreatedMaintenanceWindow>({
    method: 'POST',
    path: `${spacePrefix(spaceId)}${MAINTENANCE_WINDOW_API}`,
    body: {
      title: `test-maintenance-window-${uuidv4()}`,
      duration: MW_DURATION_MS,
      r_rule: { dtstart: new Date().toISOString(), tzid: 'UTC', freq: 0, count: 1 },
      category_ids: ['management'],
    },
  });
  return data;
};

const deleteMaintenanceWindow = async (kbnClient: KbnClient, id: string, spaceId?: string) => {
  await kbnClient.request({
    method: 'DELETE',
    path: `${spacePrefix(spaceId)}${MAINTENANCE_WINDOW_API}/${id}`,
    ignoreErrors: [404],
  });
};

const getMaintenanceWindows = async (
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  spaceId?: string
): Promise<MaintenanceWindowResponseItem[]> => {
  const res = await apiClient.get(routePath(spaceId), { headers, responseType: 'json' });
  expect(res.statusCode).toBe(200);
  return (res.body as { maintenanceWindows: MaintenanceWindowResponseItem[] }).maintenanceWindows;
};

apiTest.describe(
  'MaintenanceWindowsRoute',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let readHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_TYPES });

      // A Synthetics read-only user: `uptime: ['read']` maps to the `uptime-read` privilege
      // and grants no maintenance-window access.
      const readRole: KibanaRole = {
        elasticsearch: { cluster: [] },
        kibana: [{ base: [], feature: { uptime: ['read'] }, spaces: ['*'] }],
      };
      const { apiKeyHeader: readKey } = await requestAuth.getApiKeyForCustomRole(readRole);
      readHeaders = mergeSyntheticsApiHeaders(readKey);

      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey, { Accept: 'application/json' });
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_TYPES });
    });

    apiTest(
      'returns only monitor-referenced windows to a read-only user, projecting the UI fields',
      async ({ apiClient, kbnClient, apiServices }) => {
        const privateLocation =
          await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();
        const referencedMw = await createMaintenanceWindow(kbnClient);
        const unreferencedMw = await createMaintenanceWindow(kbnClient);

        try {
          await addMonitor(apiClient, adminHeaders, {
            type: 'http',
            name: `mw-route-monitor-${uuidv4()}`,
            urls: 'https://elastic.co',
            locations: [privateLocation],
            maintenance_windows: [referencedMw.id],
          });

          const maintenanceWindows = await getMaintenanceWindows(apiClient, readHeaders);
          const ids = maintenanceWindows.map((item) => item.id);

          expect(ids).toContain(referencedMw.id);
          // A window no monitor references must not be exposed.
          expect(ids).not.toContain(unreferencedMw.id);

          const referenced = maintenanceWindows.find((item) => item.id === referencedMw.id);
          expect(referenced!.title).toBe(referencedMw.title);

          // Guards against the projection silently widening to leak the full
          // maintenance-window object (scope query, rRule, category ids, ...).
          for (const item of maintenanceWindows) {
            expect(Object.keys(item).sort()).toStrictEqual(EXPECTED_FIELDS);
          }
        } finally {
          await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_TYPES });
          await deleteMaintenanceWindow(kbnClient, referencedMw.id);
          await deleteMaintenanceWindow(kbnClient, unreferencedMw.id);
        }
      }
    );

    apiTest(
      'only returns maintenance windows from the caller space',
      async ({ apiClient, kbnClient, apiServices, log }) => {
        const spaceId = `mw-route-space-${uuidv4()}`;
        await kbnClient.spaces.create({ id: spaceId, name: spaceId });

        const defaultMw = await createMaintenanceWindow(kbnClient);
        const spaceMw = await createMaintenanceWindow(kbnClient, spaceId);

        try {
          const defaultLocation =
            await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();
          const spaceLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(
            spaceId
          );

          await addMonitor(apiClient, adminHeaders, {
            type: 'http',
            name: `mw-route-monitor-${uuidv4()}`,
            urls: 'https://elastic.co',
            locations: [defaultLocation],
            maintenance_windows: [defaultMw.id],
          });
          await addMonitor(
            apiClient,
            adminHeaders,
            {
              type: 'http',
              name: `mw-route-monitor-${uuidv4()}`,
              urls: 'https://elastic.co',
              locations: [spaceLocation],
              maintenance_windows: [spaceMw.id],
            },
            { spaceId }
          );

          const defaultIds = (await getMaintenanceWindows(apiClient, readHeaders)).map(
            (item) => item.id
          );
          expect(defaultIds).toContain(defaultMw.id);
          expect(defaultIds).not.toContain(spaceMw.id);

          const spaceIds = (await getMaintenanceWindows(apiClient, readHeaders, spaceId)).map(
            (item) => item.id
          );
          expect(spaceIds).toContain(spaceMw.id);
          expect(spaceIds).not.toContain(defaultMw.id);
        } finally {
          await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_TYPES });
          await deleteMaintenanceWindow(kbnClient, defaultMw.id);
          await deleteMaintenanceWindow(kbnClient, spaceMw.id, spaceId);
          await kbnClient.spaces
            .delete(spaceId)
            .catch((err) =>
              log.warning(`Failed to delete test space ${spaceId}: ${err?.message ?? err}`)
            );
        }
      }
    );
  }
);
