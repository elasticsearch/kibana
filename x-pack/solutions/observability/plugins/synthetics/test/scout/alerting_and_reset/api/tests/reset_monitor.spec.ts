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
  deleteMonitors,
  getMonitor,
  resetMonitor,
} from '../../../common/fixtures/monitors';
import {
  deletePackagePolicyById,
  getPackagePolicyForMonitor,
} from '../../../common/fixtures/fleet';
import { tryForTime } from '../../../common/fixtures/retry';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/reset_monitor.ts`.
 *
 * Exercises `POST /internal/synthetics/monitors/{id}/_reset` (default and
 * `force=true` modes), Fleet package-policy recreation, idempotency, config
 * preservation, and authorization. Fleet reads/deletes use the admin API key
 * (the editor key lacks Fleet privileges); the route under test uses editor.
 *
 * The FTR file grouped cases under nested describes (default / force / multi
 * location / error handling); Scout allows a single root describe, so the two
 * Fleet test policies are provisioned once up front and the cases are flat.
 */
apiTest.describe(
  'ResetMonitorRoute',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;
    let viewerHeaders: Record<string, string>;
    let testPolicyId: string;
    let testPolicyId2: string;
    let privateLocations: ScoutPrivateLocation[];

    const saveMonitor = async (
      apiClient: ApiClientFixture,
      locations: ScoutPrivateLocation[]
    ): Promise<string> => {
      const res = await addMonitor(apiClient, editorHeaders, {
        ...httpMonitorFixture,
        locations,
        name: `test-monitor-name-${uuidv4()}`,
      });
      return (res.body as { id: string }).id;
    };

    const cleanupMonitor = async (apiClient: ApiClientFixture, monitorId: string) => {
      await deleteMonitors(apiClient, editorHeaders, [monitorId], { spaceId: 'default' });
    };

    const getPolicy = (apiClient: ApiClientFixture, monitorId: string, locationId: string) =>
      getPackagePolicyForMonitor(apiClient, adminHeaders, monitorId, locationId);

    const deletePolicy = (apiClient: ApiClientFixture, monitorId: string, locationId: string) =>
      deletePackagePolicyById(apiClient, adminHeaders, `${monitorId}-${locationId}`);

    const expectConfigPreserved = (
      before: { rawBody: Record<string, unknown> },
      after: { rawBody: Record<string, unknown> }
    ) => {
      for (const key of ['name', 'urls', 'schedule', 'locations', 'revision'] as const) {
        expect(after.rawBody[key]).toStrictEqual(before.rawBody[key]);
      }
    };

    apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey);
      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);
      const { apiKeyHeader: viewerKey } = await requestAuth.getApiKey('viewer');
      viewerHeaders = mergeSyntheticsApiHeaders(viewerKey);

      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();
      const { id: policyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet test server policy ${Date.now()}`
      );
      const { id: policyId2 } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet test server policy 2 ${Date.now()}`
      );
      testPolicyId = policyId;
      testPolicyId2 = policyId2;
      privateLocations = await apiServices.syntheticsPrivateLocations.setTestLocations([
        testPolicyId,
        testPolicyId2,
      ]);
    });

    apiTest.afterAll(async ({ apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    });

    // --- default mode (editMonitors) ---

    apiTest('resets a healthy monitor and returns success', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, [privateLocations[0]]);
      try {
        const res = await resetMonitor(apiClient, editorHeaders, monitorId);
        expect(res.body).toStrictEqual({ id: monitorId, reset: true });
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    apiTest('recreates missing Fleet package policy', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, [privateLocations[0]]);
      try {
        await tryForTime(30_000, async () => {
          expect((await getPolicy(apiClient, monitorId, testPolicyId)) != null).toBe(true);
        });

        await deletePolicy(apiClient, monitorId, testPolicyId);

        await tryForTime(30_000, async () => {
          expect(await getPolicy(apiClient, monitorId, testPolicyId)).toBeUndefined();
        });

        const res = await resetMonitor(apiClient, editorHeaders, monitorId);
        expect(res.body).toStrictEqual({ id: monitorId, reset: true });

        await tryForTime(30_000, async () => {
          const policyAfterReset = await getPolicy(apiClient, monitorId, testPolicyId);
          expect(policyAfterReset != null).toBe(true);
          expect(policyAfterReset!.policy_id).toBe(testPolicyId);
        });
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    apiTest('overwrites existing policy (handles corruption)', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, [privateLocations[0]]);
      try {
        let revisionBefore = 0;
        await tryForTime(30_000, async () => {
          const policyBefore = await getPolicy(apiClient, monitorId, testPolicyId);
          expect(policyBefore != null).toBe(true);
          revisionBefore = policyBefore!.revision;
        });

        const res = await resetMonitor(apiClient, editorHeaders, monitorId);
        expect(res.body).toStrictEqual({ id: monitorId, reset: true });

        await tryForTime(30_000, async () => {
          const policyAfter = await getPolicy(apiClient, monitorId, testPolicyId);
          expect(policyAfter != null).toBe(true);
          expect(policyAfter!.revision).toBeGreaterThan(revisionBefore);
        });
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    apiTest('is idempotent — calling reset multiple times succeeds', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, [privateLocations[0]]);
      try {
        await resetMonitor(apiClient, editorHeaders, monitorId);
        await resetMonitor(apiClient, editorHeaders, monitorId);
        const thirdReset = await resetMonitor(apiClient, editorHeaders, monitorId);
        expect(thirdReset.body).toStrictEqual({ id: monitorId, reset: true });

        await tryForTime(30_000, async () => {
          expect((await getPolicy(apiClient, monitorId, testPolicyId)) != null).toBe(true);
        });
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    apiTest('preserves monitor config — saved object is unchanged', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, [privateLocations[0]]);
      try {
        const before = await getMonitor(apiClient, editorHeaders, monitorId);
        await resetMonitor(apiClient, editorHeaders, monitorId);
        const after = await getMonitor(apiClient, editorHeaders, monitorId);
        expectConfigPreserved(before, after);
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    // --- force mode (delete + recreate) ---

    apiTest('resets a healthy monitor with force=true', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, [privateLocations[0]]);
      try {
        const res = await resetMonitor(apiClient, editorHeaders, monitorId, { force: true });
        expect(res.body).toStrictEqual({ id: monitorId, reset: true });

        await tryForTime(30_000, async () => {
          const policy = await getPolicy(apiClient, monitorId, testPolicyId);
          expect(policy != null).toBe(true);
          expect(policy!.policy_id).toBe(testPolicyId);
        });
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    apiTest('recreates missing Fleet package policy with force=true', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, [privateLocations[0]]);
      try {
        await deletePolicy(apiClient, monitorId, testPolicyId);

        await tryForTime(30_000, async () => {
          expect(await getPolicy(apiClient, monitorId, testPolicyId)).toBeUndefined();
        });

        const res = await resetMonitor(apiClient, editorHeaders, monitorId, { force: true });
        expect(res.body).toStrictEqual({ id: monitorId, reset: true });

        await tryForTime(30_000, async () => {
          const policyRestored = await getPolicy(apiClient, monitorId, testPolicyId);
          expect(policyRestored != null).toBe(true);
          expect(policyRestored!.policy_id).toBe(testPolicyId);
        });
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    apiTest('is idempotent with force=true', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, [privateLocations[0]]);
      try {
        await resetMonitor(apiClient, editorHeaders, monitorId, { force: true });
        const secondReset = await resetMonitor(apiClient, editorHeaders, monitorId, {
          force: true,
        });
        expect(secondReset.body).toStrictEqual({ id: monitorId, reset: true });
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    apiTest('preserves monitor config with force=true', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, [privateLocations[0]]);
      try {
        const before = await getMonitor(apiClient, editorHeaders, monitorId);
        await resetMonitor(apiClient, editorHeaders, monitorId, { force: true });
        const after = await getMonitor(apiClient, editorHeaders, monitorId);
        expectConfigPreserved(before, after);
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    // --- monitor with multiple private locations ---

    apiTest('recreates policies for all locations when one is missing', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, privateLocations);
      try {
        await tryForTime(30_000, async () => {
          expect((await getPolicy(apiClient, monitorId, testPolicyId)) != null).toBe(true);
          expect((await getPolicy(apiClient, monitorId, testPolicyId2)) != null).toBe(true);
        });

        await deletePolicy(apiClient, monitorId, testPolicyId);

        await tryForTime(30_000, async () => {
          expect(await getPolicy(apiClient, monitorId, testPolicyId)).toBeUndefined();
        });

        await resetMonitor(apiClient, editorHeaders, monitorId);

        await tryForTime(30_000, async () => {
          const policy1After = await getPolicy(apiClient, monitorId, testPolicyId);
          const policy2After = await getPolicy(apiClient, monitorId, testPolicyId2);
          expect(policy1After != null).toBe(true);
          expect(policy2After != null).toBe(true);
          expect(policy1After!.policy_id).toBe(testPolicyId);
          expect(policy2After!.policy_id).toBe(testPolicyId2);
        });
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    apiTest(
      'recreates all policies with force=true when all are missing',
      async ({ apiClient }) => {
        const monitorId = await saveMonitor(apiClient, privateLocations);
        try {
          await deletePolicy(apiClient, monitorId, testPolicyId);
          await deletePolicy(apiClient, monitorId, testPolicyId2);

          await tryForTime(30_000, async () => {
            expect(await getPolicy(apiClient, monitorId, testPolicyId)).toBeUndefined();
            expect(await getPolicy(apiClient, monitorId, testPolicyId2)).toBeUndefined();
          });

          const res = await resetMonitor(apiClient, editorHeaders, monitorId, { force: true });
          expect(res.body).toStrictEqual({ id: monitorId, reset: true });

          await tryForTime(30_000, async () => {
            expect((await getPolicy(apiClient, monitorId, testPolicyId)) != null).toBe(true);
            expect((await getPolicy(apiClient, monitorId, testPolicyId2)) != null).toBe(true);
          });
        } finally {
          await cleanupMonitor(apiClient, monitorId);
        }
      }
    );

    // --- error handling ---

    apiTest('returns 404 for non-existent monitor', async ({ apiClient }) => {
      const invalidId = 'non-existent-monitor-id';
      const res = await resetMonitor(apiClient, editorHeaders, invalidId, { statusCode: 404 });
      expect((res.body as { message: string }).message).toContain(invalidId);
    });

    apiTest('returns 404 for non-existent monitor with force=true', async ({ apiClient }) => {
      const invalidId = 'non-existent-monitor-id-force';
      const res = await resetMonitor(apiClient, editorHeaders, invalidId, {
        force: true,
        statusCode: 404,
      });
      expect((res.body as { message: string }).message).toContain(invalidId);
    });

    apiTest('returns 403 for viewer user (default mode)', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, [privateLocations[0]]);
      try {
        await resetMonitor(apiClient, viewerHeaders, monitorId, { statusCode: 403 });
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });

    apiTest('returns 403 for viewer user (force mode)', async ({ apiClient }) => {
      const monitorId = await saveMonitor(apiClient, [privateLocations[0]]);
      try {
        await resetMonitor(apiClient, viewerHeaders, monitorId, {
          force: true,
          statusCode: 403,
        });
      } finally {
        await cleanupMonitor(apiClient, monitorId);
      }
    });
  }
);
