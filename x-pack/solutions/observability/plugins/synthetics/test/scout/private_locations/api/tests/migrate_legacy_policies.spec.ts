/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { ALL_SPACES_ID } from '@kbn/spaces-plugin/common/constants';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture, KbnClient } from '@kbn/scout-oblt';
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
  editMonitor,
  triggerPrivateLocationCleanup,
} from '../../../common/fixtures/monitors';
import {
  createLegacyPackagePolicy,
  deletePackagePolicyById,
  getSyntheticsPackagePolicies,
} from '../../../common/fixtures/fleet';
import { createDeadline, tryForTime } from '../../../common/fixtures/retry';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

/**
 * Total time any one test may spend polling Fleet, shared across every
 * `tryForTime` in that test so the sum always fits inside `TEST_TIMEOUT` with
 * room left for Fleet setup and teardown.
 */
const POLL_BUDGET = 3 * 60 * 1000;
const TEST_TIMEOUT = 5 * 60 * 1000;

/**
 * Asserts on synthetics package-policy ids by name, reporting every id that is
 * missing or lingering plus the full set that was actually found. A bare
 * `expect(policies.some(...)).toBe(true)` only says `false !== true`, which does
 * not distinguish "cleanup never ran" from "the recreate never landed".
 */
const expectPolicyIds = (
  policies: Array<{ id: string }>,
  { present = [], absent = [] }: { present?: string[]; absent?: string[] }
) => {
  const ids = policies.map((policy) => policy.id);
  expect(
    {
      missing: present.filter((id) => !ids.includes(id)),
      lingering: absent.filter((id) => ids.includes(id)),
    },
    `synthetics package policies found: [${ids.join(', ')}]`
  ).toStrictEqual({ missing: [], lingering: [] });
};

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/migrate_legacy_policies.ts`.
 *
 * Legacy package-policy ids carry a trailing `-${spaceId}`; the product migrates
 * them to the spaceless `${monitorId}-${locationId}` format on monitor edit and
 * via the cleanup task. Legacy policies are seeded directly through the Fleet
 * API (admin key); the monitor CRUD under test uses the editor key.
 *
 * The FTR file grouped cases under nested describes (edit / cleanup task /
 * format verification); Scout allows a single root describe, so the cases are
 * flat with a comment marking each original group.
 */
apiTest.describe(
  'MigrateLegacyPolicies',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;
    let privateLocation: ScoutPrivateLocation;
    let testFleetPolicyId: string;
    let syntheticsPackageVersion: string;

    const getPackagePolicies = (apiClient: ApiClientFixture) =>
      getSyntheticsPackagePolicies(apiClient, adminHeaders);

    const createMonitor = async (
      apiClient: ApiClientFixture,
      monitorId: string,
      extraFields: Record<string, unknown> = {}
    ): Promise<string> => {
      // Leftover package-policy seeds share the agent policy; Fleet can still
      // be deploying that write when the next monitor create runs, which 409s
      // (or 404s) the deterministic `${monitorId}-${locationId}` policy.
      return tryForTime(30_000, async () => {
        const res = await addMonitor(
          apiClient,
          editorHeaders,
          {
            ...httpMonitorFixture,
            locations: [privateLocation],
            name: uuidv4(),
            ...extraFields,
          },
          { id: monitorId }
        );
        return (res.body as { id: string }).id;
      });
    };

    const seedLegacyPolicy = (apiClient: ApiClientFixture, monitorId: string, spaceId: string) =>
      createLegacyPackagePolicy(apiClient, adminHeaders, {
        monitorId,
        locationId: privateLocation.id,
        spaceId,
        fleetPolicyId: testFleetPolicyId,
        packageVersion: syntheticsPackageVersion,
      });

    const createSpace = async (kbnClient: KbnClient) => {
      const spaceId = `test-space-${uuidv4().slice(0, 8)}`;
      await kbnClient.spaces.create({ id: spaceId, name: spaceId });
      return spaceId;
    };

    apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey);
      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);

      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();
      const { id } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Legacy Migration Test Policy ${uuidv4().slice(0, 8)}`,
        [ALL_SPACES_ID]
      );
      testFleetPolicyId = id;
      const locations = await apiServices.syntheticsPrivateLocations.setTestLocations(
        [testFleetPolicyId],
        [ALL_SPACES_ID]
      );
      privateLocation = locations[0];
      syntheticsPackageVersion =
        await apiServices.syntheticsPrivateLocations.fetchSyntheticsPackageVersion();
    });

    apiTest.afterAll(async ({ apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    });

    // --- Migration on monitor edit ---

    apiTest(
      'should migrate legacy policy to new format when monitor is edited',
      async ({ apiClient }) => {
        apiTest.setTimeout(TEST_TIMEOUT);
        const budget = createDeadline(POLL_BUDGET);
        const monitorId = uuidv4();
        const legacyPolicyId = await seedLegacyPolicy(apiClient, monitorId, 'default');

        const createdMonitorId = await createMonitor(apiClient, monitorId);
        expect(createdMonitorId).toBe(monitorId);

        await editMonitor(apiClient, editorHeaders, createdMonitorId, { name: uuidv4() });

        await tryForTime(budget.remaining(), async () => {
          const policies = await getPackagePolicies(apiClient);
          expectPolicyIds(policies, {
            present: [`${monitorId}-${privateLocation.id}`],
            absent: [legacyPolicyId],
          });
        });

        await deleteMonitors(apiClient, editorHeaders, [createdMonitorId]);
      }
    );

    apiTest(
      'should handle multiple legacy policies for same monitor in different spaces',
      async ({ apiClient, kbnClient }) => {
        apiTest.setTimeout(TEST_TIMEOUT);
        const budget = createDeadline(POLL_BUDGET);
        const monitorId = uuidv4();
        const space2 = await createSpace(kbnClient);
        try {
          const legacyPolicy1 = await seedLegacyPolicy(apiClient, monitorId, 'default');
          const legacyPolicy2 = await seedLegacyPolicy(apiClient, monitorId, space2);

          await createMonitor(apiClient, monitorId, { spaces: ['default', space2] });
          await editMonitor(apiClient, editorHeaders, monitorId, { name: uuidv4() });

          await tryForTime(budget.remaining(), async () => {
            const policies = await getPackagePolicies(apiClient);
            expectPolicyIds(policies, {
              present: [`${monitorId}-${privateLocation.id}`],
              absent: [legacyPolicy1, legacyPolicy2],
            });
          });

          await deleteMonitors(apiClient, editorHeaders, [monitorId]);
        } finally {
          await kbnClient.spaces.delete(space2).catch(() => {});
        }
      }
    );

    apiTest(
      'should clean up legacy policy from a space the monitor is no longer in',
      async ({ apiClient, kbnClient }) => {
        apiTest.setTimeout(TEST_TIMEOUT);
        const budget = createDeadline(POLL_BUDGET);
        const monitorAId = uuidv4();
        const monitorBId = uuidv4();
        const extraSpace = await createSpace(kbnClient);
        try {
          // Seed leftover before creating monitors so Fleet isn't mid-deploy on
          // the shared agent policy (create package_policies 404s while
          // agentPolicyService.get returns null). Same order as the multi-space
          // test above.
          const staleLegacyPolicyId = await seedLegacyPolicy(apiClient, monitorAId, extraSpace);
          await createMonitor(apiClient, monitorBId, { spaces: ['default', extraSpace] });
          await createMonitor(apiClient, monitorAId);

          await editMonitor(apiClient, editorHeaders, monitorAId, { name: uuidv4() });

          await tryForTime(budget.remaining(), async () => {
            const policies = await getPackagePolicies(apiClient);
            expectPolicyIds(policies, {
              present: [
                `${monitorAId}-${privateLocation.id}`,
                `${monitorBId}-${privateLocation.id}`,
              ],
              absent: [staleLegacyPolicyId],
            });
          });

          await deleteMonitors(apiClient, editorHeaders, [monitorAId]);
          await deleteMonitors(apiClient, editorHeaders, [monitorBId]);
        } finally {
          await kbnClient.spaces.delete(extraSpace).catch(() => {});
        }
      }
    );

    // --- Migration via cleanup task ---

    apiTest(
      'should clean up orphaned legacy policies via cleanup endpoint',
      async ({ apiClient }) => {
        apiTest.setTimeout(TEST_TIMEOUT);
        const budget = createDeadline(POLL_BUDGET);
        const monitorId = uuidv4();
        await createMonitor(apiClient, monitorId);

        const newFormatPolicyId = `${monitorId}-${privateLocation.id}`;
        await tryForTime(budget.remaining(), async () => {
          const policies = await getPackagePolicies(apiClient);
          expectPolicyIds(policies, { present: [newFormatPolicyId] });
        });

        const orphanedLegacyPolicyId = await seedLegacyPolicy(
          apiClient,
          monitorId,
          'orphaned-space'
        );

        await triggerPrivateLocationCleanup(apiClient, editorHeaders);

        await tryForTime(budget.remaining(), async () => {
          const policies = await getPackagePolicies(apiClient);
          expectPolicyIds(policies, {
            present: [newFormatPolicyId],
            absent: [orphanedLegacyPolicyId],
          });
        });

        await deleteMonitors(apiClient, editorHeaders, [monitorId]);
      }
    );

    // Skipped due to high failure rate in CI, see https://github.com/elastic/kibana/issues/288494
    apiTest.fixme(
      'should migrate legacy policies to new format when cleanup runs',
      async ({ apiClient }) => {
        apiTest.setTimeout(TEST_TIMEOUT);
        const budget = createDeadline(POLL_BUDGET);
        const monitorId = uuidv4();
        await createMonitor(apiClient, monitorId);

        const newFormatPolicyId = `${monitorId}-${privateLocation.id}`;
        await tryForTime(budget.remaining(), async () => {
          const policies = await getPackagePolicies(apiClient);
          expectPolicyIds(policies, { present: [newFormatPolicyId] });
        });

        await deletePackagePolicyById(apiClient, adminHeaders, newFormatPolicyId);

        const legacyPolicy1 = await seedLegacyPolicy(apiClient, monitorId, 'default');
        const legacyPolicy2 = await seedLegacyPolicy(apiClient, monitorId, 'space-2');

        await triggerPrivateLocationCleanup(apiClient, editorHeaders);

        // Cleanup deletes the legacy ids and the follow-up per-location sync
        // recreates the new-format one, so all three land in the same poll.
        await tryForTime(budget.remaining(), async () => {
          const policies = await getPackagePolicies(apiClient);
          expectPolicyIds(policies, {
            present: [newFormatPolicyId],
            absent: [legacyPolicy1, legacyPolicy2],
          });
        });

        await deleteMonitors(apiClient, editorHeaders, [monitorId]);
      }
    );

    apiTest(
      'should clean up legacy policies from spaces with no monitors',
      async ({ apiClient, kbnClient }) => {
        apiTest.setTimeout(TEST_TIMEOUT);
        const budget = createDeadline(POLL_BUDGET);
        const monitorId1 = uuidv4();
        const monitorId2 = uuidv4();
        const emptySpace1 = await createSpace(kbnClient);
        const emptySpace2 = await createSpace(kbnClient);
        try {
          const legacyPolicy1 = await seedLegacyPolicy(apiClient, monitorId1, emptySpace1);
          const legacyPolicy2 = await seedLegacyPolicy(apiClient, monitorId2, emptySpace2);

          await triggerPrivateLocationCleanup(apiClient, editorHeaders);

          await tryForTime(budget.remaining(), async () => {
            const policies = await getPackagePolicies(apiClient);
            expectPolicyIds(policies, { absent: [legacyPolicy1, legacyPolicy2] });
          });
        } finally {
          await kbnClient.spaces.delete(emptySpace1).catch(() => {});
          await kbnClient.spaces.delete(emptySpace2).catch(() => {});
        }
      }
    );

    // --- Policy ID format verification ---

    apiTest(
      'creates new monitors with new format policy ID (without spaceId)',
      async ({ apiClient }) => {
        apiTest.setTimeout(TEST_TIMEOUT);
        const monitorId = uuidv4();
        await createMonitor(apiClient, monitorId);

        await tryForTime(30_000, async () => {
          const policies = await getPackagePolicies(apiClient);
          expectPolicyIds(policies, {
            present: [`${monitorId}-${privateLocation.id}`],
            absent: [`${monitorId}-${privateLocation.id}-default`],
          });
        });

        await deleteMonitors(apiClient, editorHeaders, [monitorId]);
      }
    );
  }
);
