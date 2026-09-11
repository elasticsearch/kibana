/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { KbnClient } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { apiTest, mergeSyntheticsApiHeaders } from '../../../common/fixtures';
import { addMonitor } from '../../../common/fixtures/monitors';

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration/apis/synthetics/sync_maintenance_windows.ts`
 * and `sync_maintenance_windows_non_default_space.ts`.
 *
 * The unique behavior these tests cover (not exercised by any other synthetics
 * suite) is that when a monitor references a maintenance window, the window is
 * synced into the backing Fleet package policy. Instead of the FTR
 * golden-policy `comparePolicies` comparison, we assert directly on the
 * `maintenance_windows` package-policy var, which is the actual integration
 * point — keeping the spec resilient to unrelated policy changes.
 *
 * The maintenance window is created with `kbnClient` (elevated) as setup; the
 * monitor under test is created with a scoped admin API key via `apiClient`.
 */

const MAINTENANCE_WINDOW_API = '/internal/alerting/rules/maintenance_window';
const SYNTHETICS_MONITOR_TYPES = ['synthetics-monitor', 'synthetics-monitor-multi-space'];
const MW_DURATION_MS = 60 * 60 * 1000;

interface MaintenanceWindow {
  id: string;
  duration: number;
  r_rule: { dtstart: string; tzid: string; freq: number; count: number };
}

interface PackagePolicyVar {
  type: string;
  value?: unknown;
}
interface PackagePolicyStream {
  vars?: Record<string, PackagePolicyVar>;
}
interface PackagePolicyInput {
  streams?: PackagePolicyStream[];
}
interface PackagePolicy {
  id: string;
  inputs?: PackagePolicyInput[];
}

interface FormattedMaintenanceWindow {
  dtstart: string;
  tzid: string;
  count: number;
  duration: string;
}

const spacePrefix = (spaceId?: string) => (spaceId && spaceId !== 'default' ? `/s/${spaceId}` : '');

const createMaintenanceWindow = async (
  kbnClient: KbnClient,
  spaceId?: string
): Promise<MaintenanceWindow> => {
  const { data } = await kbnClient.request<MaintenanceWindow>({
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

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

/**
 * Scans a package policy for the first non-empty `maintenance_windows` yaml var
 * (synthetics writes it onto every input stream via `commonVars`). The value is
 * the JSON-stringified output of the synthetics `formatMWs` helper.
 */
const parseMaintenanceWindowsVar = (
  pkgPolicy?: PackagePolicy
): FormattedMaintenanceWindow[] | undefined => {
  for (const input of pkgPolicy?.inputs ?? []) {
    for (const stream of input?.streams ?? []) {
      const value = stream?.vars?.maintenance_windows?.value;
      const parsed = typeof value === 'string' ? safeJsonParse(value) : value;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as FormattedMaintenanceWindow[];
      }
    }
  }
  return undefined;
};

const fetchSyntheticsPackagePolicies = async (
  kbnClient: KbnClient,
  spaceId?: string
): Promise<PackagePolicy[]> => {
  const { data } = await kbnClient.request<{ items?: PackagePolicy[] }>({
    method: 'GET',
    path: `${spacePrefix(spaceId)}/api/fleet/package_policies`,
    query: {
      page: 1,
      perPage: 2000,
      kuery: 'ingest-package-policies.package.name: synthetics',
    },
  });
  return data.items ?? [];
};

/**
 * Monitor creation synchronously syncs to Fleet, but allow a short window for
 * the package policy to settle before asserting on it.
 */
const waitForMonitorPackagePolicy = async (
  kbnClient: KbnClient,
  monitorId: string,
  locId: string,
  spaceId?: string
): Promise<PackagePolicy> => {
  const deadline = Date.now() + 30_000;
  let lastMatch: PackagePolicy | undefined;
  while (Date.now() < deadline) {
    const items = await fetchSyntheticsPackagePolicies(kbnClient, spaceId);
    const match = items.find((p) => p.id === `${monitorId}-${locId}`);
    if (match && parseMaintenanceWindowsVar(match)) {
      return match;
    }
    lastMatch = match ?? lastMatch;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (lastMatch) {
    return lastMatch;
  }
  throw new Error(`No synthetics package policy found for monitor ${monitorId}`);
};

const expectSyncedMaintenanceWindow = (pkgPolicy: PackagePolicy, mw: MaintenanceWindow) => {
  const synced = parseMaintenanceWindowsVar(pkgPolicy);
  expect(synced).toHaveLength(1);
  expect(synced![0]).toStrictEqual(
    expect.objectContaining({
      dtstart: mw.r_rule.dtstart,
      tzid: 'UTC',
      count: 1,
      duration: `${MW_DURATION_MS}ms`,
    })
  );
};

apiTest.describe(
  'SyncMaintenanceWindows',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    let adminHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_TYPES });
    });

    apiTest(
      'applies the maintenance window to a private-location package policy',
      async ({ apiClient, kbnClient, apiServices }) => {
        const privateLocation =
          await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();
        const mw = await createMaintenanceWindow(kbnClient);

        try {
          const res = await addMonitor(apiClient, adminHeaders, {
            type: 'http',
            name: `mw-monitor-${uuidv4()}`,
            urls: 'https://elastic.co',
            locations: [privateLocation],
            maintenance_windows: [mw.id],
          });
          const monitorId = (res.body as { id: string }).id;

          const pkgPolicy = await waitForMonitorPackagePolicy(
            kbnClient,
            monitorId,
            privateLocation.id
          );
          expectSyncedMaintenanceWindow(pkgPolicy, mw);
        } finally {
          await deleteMaintenanceWindow(kbnClient, mw.id);
        }
      }
    );

    apiTest(
      'applies the maintenance window to a package policy in a non-default space',
      async ({ apiClient, kbnClient, apiServices, log }) => {
        const spaceId = `mw-space-${uuidv4()}`;
        await kbnClient.spaces.create({ id: spaceId, name: spaceId });

        try {
          const privateLocation =
            await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(spaceId);
          const mw = await createMaintenanceWindow(kbnClient, spaceId);

          const res = await addMonitor(
            apiClient,
            adminHeaders,
            {
              type: 'http',
              name: `mw-monitor-${uuidv4()}`,
              urls: 'https://elastic.co',
              locations: [privateLocation],
              maintenance_windows: [mw.id],
            },
            { spaceId }
          );
          const monitorId = (res.body as { id: string }).id;

          const pkgPolicy = await waitForMonitorPackagePolicy(
            kbnClient,
            monitorId,
            privateLocation.id,
            spaceId
          );
          expectSyncedMaintenanceWindow(pkgPolicy, mw);
        } finally {
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
