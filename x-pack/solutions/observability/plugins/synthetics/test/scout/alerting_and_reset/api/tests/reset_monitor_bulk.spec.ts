/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';
import {
  apiTest,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import {
  addMonitor,
  bulkResetMonitors,
  deleteMonitors,
  getMonitor,
} from '../../../common/fixtures/monitors';
import {
  deletePackagePolicyById,
  getPackagePolicyForMonitor,
} from '../../../common/fixtures/fleet';
import { tryForTime } from '../../../common/fixtures/retry';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

interface BulkResetResult {
  id: string;
  reset: boolean;
  error?: string;
}

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/reset_monitor_bulk.ts`.
 *
 * Exercises `POST /internal/synthetics/monitors/_bulk_reset`: resetting many
 * monitors at once, Fleet policy revision bumps, partial recreation, idempotency,
 * config preservation, and per-monitor / authorization failure handling.
 */
apiTest.describe(
  'ResetMonitorBulkRoute',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;
    let viewerHeaders: Record<string, string>;
    let testPolicyId: string;
    let privateLocations: ScoutPrivateLocation[];

    const saveMonitor = async (apiClient: ApiClientFixture): Promise<string> => {
      const res = await addMonitor(apiClient, editorHeaders, {
        ...httpMonitorFixture,
        locations: [privateLocations[0]],
        name: `test-monitor-name-${uuidv4()}`,
      });
      return (res.body as { id: string }).id;
    };

    const cleanupMonitor = async (apiClient: ApiClientFixture, monitorId: string) => {
      await deleteMonitors(apiClient, editorHeaders, [monitorId], { spaceId: 'default' });
    };

    const getPolicy = (apiClient: ApiClientFixture, monitorId: string) =>
      getPackagePolicyForMonitor(apiClient, adminHeaders, monitorId, testPolicyId);

    const resultFor = (results: BulkResetResult[], id: string) =>
      results.find((result) => result.id === id);

    apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey);
      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);
      const { apiKeyHeader: viewerKey } = await requestAuth.getApiKey('viewer');
      viewerHeaders = mergeSyntheticsApiHeaders(viewerKey);

      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();
      const { id } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet test server policy ${Date.now()}`
      );
      testPolicyId = id;
      privateLocations = await apiServices.syntheticsPrivateLocations.setTestLocations([
        testPolicyId,
      ]);
    });

    apiTest.afterAll(async ({ apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    });

    // --- default mode ---

    apiTest('resets multiple healthy monitors', async ({ apiClient }) => {
      const mon1 = await saveMonitor(apiClient);
      const mon2 = await saveMonitor(apiClient);
      try {
        const res = await bulkResetMonitors(apiClient, editorHeaders, [mon1, mon2]);
        const results = (res.body as { result: BulkResetResult[] }).result;
        expect(results).toHaveLength(2);
        expect(resultFor(results, mon1)!.reset).toBe(true);
        expect(resultFor(results, mon2)!.reset).toBe(true);
      } finally {
        await cleanupMonitor(apiClient, mon1);
        await cleanupMonitor(apiClient, mon2);
      }
    });

    apiTest('bumps Fleet policy revision after bulk reset', async ({ apiClient }) => {
      const mon1 = await saveMonitor(apiClient);
      const mon2 = await saveMonitor(apiClient);
      try {
        let revision1Before = 0;
        let revision2Before = 0;
        await tryForTime(30_000, async () => {
          const policy1Before = await getPolicy(apiClient, mon1);
          const policy2Before = await getPolicy(apiClient, mon2);
          expect(policy1Before != null).toBe(true);
          expect(policy2Before != null).toBe(true);
          revision1Before = policy1Before!.revision;
          revision2Before = policy2Before!.revision;
        });

        await bulkResetMonitors(apiClient, editorHeaders, [mon1, mon2]);

        await tryForTime(30_000, async () => {
          const policy1After = await getPolicy(apiClient, mon1);
          const policy2After = await getPolicy(apiClient, mon2);
          expect(policy1After!.revision).toBeGreaterThan(revision1Before);
          expect(policy2After!.revision).toBeGreaterThan(revision2Before);
        });
      } finally {
        await cleanupMonitor(apiClient, mon1);
        await cleanupMonitor(apiClient, mon2);
      }
    });

    apiTest('recreates missing policy for one of multiple monitors', async ({ apiClient }) => {
      const mon1 = await saveMonitor(apiClient);
      const mon2 = await saveMonitor(apiClient);
      try {
        await deletePackagePolicyById(apiClient, adminHeaders, `${mon1}-${testPolicyId}`);

        await tryForTime(30_000, async () => {
          expect(await getPolicy(apiClient, mon1)).toBeUndefined();
        });

        const res = await bulkResetMonitors(apiClient, editorHeaders, [mon1, mon2]);
        const results = (res.body as { result: BulkResetResult[] }).result;
        expect(resultFor(results, mon1)!.reset).toBe(true);
        expect(resultFor(results, mon2)!.reset).toBe(true);

        await tryForTime(30_000, async () => {
          expect((await getPolicy(apiClient, mon1)) != null).toBe(true);
        });
      } finally {
        await cleanupMonitor(apiClient, mon1);
        await cleanupMonitor(apiClient, mon2);
      }
    });

    apiTest('single ID in bulk behaves like single endpoint', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient);
      try {
        const res = await bulkResetMonitors(apiClient, editorHeaders, [monitorId]);
        const results = (res.body as { result: BulkResetResult[] }).result;
        expect(results).toHaveLength(1);
        expect(results[0]).toStrictEqual({ id: monitorId, reset: true });
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    apiTest('is idempotent — calling bulk reset twice succeeds', async ({ apiClient }) => {
      const mon1 = await saveMonitor(apiClient);
      const mon2 = await saveMonitor(apiClient);
      try {
        await bulkResetMonitors(apiClient, editorHeaders, [mon1, mon2]);
        const secondRes = await bulkResetMonitors(apiClient, editorHeaders, [mon1, mon2]);
        const results = (secondRes.body as { result: BulkResetResult[] }).result;
        expect(results).toHaveLength(2);
        expect(results.every((result) => result.reset === true)).toBe(true);
      } finally {
        await cleanupMonitor(apiClient, mon1);
        await cleanupMonitor(apiClient, mon2);
      }
    });

    apiTest('preserves monitor configs after bulk reset', async ({ apiClient }) => {
      const mon1 = await saveMonitor(apiClient);
      const mon2 = await saveMonitor(apiClient);
      try {
        const before1 = await getMonitor(apiClient, editorHeaders, mon1);
        const before2 = await getMonitor(apiClient, editorHeaders, mon2);

        await bulkResetMonitors(apiClient, editorHeaders, [mon1, mon2]);

        const after1 = await getMonitor(apiClient, editorHeaders, mon1);
        const after2 = await getMonitor(apiClient, editorHeaders, mon2);

        for (const [before, after] of [
          [before1, after1],
          [before2, after2],
        ]) {
          for (const key of ['name', 'urls', 'schedule', 'locations', 'revision'] as const) {
            expect(after.rawBody[key]).toStrictEqual(before.rawBody[key]);
          }
        }
      } finally {
        await cleanupMonitor(apiClient, mon1);
        await cleanupMonitor(apiClient, mon2);
      }
    });

    // --- partial failure handling ---

    apiTest(
      'returns per-monitor errors when some monitors are not found',
      async ({ apiClient }) => {
        const validId = await saveMonitor(apiClient);
        const invalidId = 'non-existent-monitor-bulk';
        try {
          const res = await bulkResetMonitors(apiClient, editorHeaders, [validId, invalidId]);
          const results = (res.body as { result: BulkResetResult[] }).result;

          const validResult = resultFor(results, validId)!;
          const invalidResult = resultFor(results, invalidId)!;

          expect(validResult.reset).toBe(true);
          expect(invalidResult.reset).toBe(false);
          expect(invalidResult.error!).toContain('not found');
        } finally {
          await cleanupMonitor(apiClient, validId);
        }
      }
    );

    apiTest('returns 403 for viewer user', async ({ apiClient }) => {
      const mon1 = await saveMonitor(apiClient);
      const mon2 = await saveMonitor(apiClient);
      try {
        await bulkResetMonitors(apiClient, viewerHeaders, [mon1, mon2], { statusCode: 403 });
      } finally {
        await cleanupMonitor(apiClient, mon1);
        await cleanupMonitor(apiClient, mon2);
      }
    });

    apiTest('all monitors not found returns empty successful results', async ({ apiClient }) => {
      const res = await bulkResetMonitors(apiClient, editorHeaders, ['fake-id-1', 'fake-id-2']);
      const results = (res.body as { result: BulkResetResult[] }).result;
      expect(results).toHaveLength(2);
      expect(results.every((result) => result.reset === false)).toBe(true);
    });
  }
);
