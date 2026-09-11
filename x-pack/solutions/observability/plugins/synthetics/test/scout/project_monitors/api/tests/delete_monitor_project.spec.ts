/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Migrated from the FTR suite
 * `apis/synthetics/delete_monitor_project.ts` (`DeleteProjectMonitors`).
 *
 * Covers the project monitor bulk-delete endpoint: the 500-id request cap,
 * single-monitor delete, project isolation, space isolation, and Fleet
 * integration-policy cleanup on delete.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { syntheticsMonitorSavedObjectType } from '../../../../../common/types/saved_objects';
import { apiTest, mergeSyntheticsApiHeaders } from '../../../common/fixtures';
import { listMonitors } from '../../../common/fixtures/monitors';
import { deleteProjectMonitors, pushProjectMonitors } from '../../../common/fixtures/project';
import {
  deleteAllSyntheticsPackagePolicies,
  getPackagePolicyForMonitor,
} from '../../../common/fixtures/fleet';
import { tryForTime } from '../../../common/fixtures/retry';
import { projectBrowserMonitorFixture } from '../fixtures/data/project_browser_monitor';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';

const MONITOR_SO_TYPES = [
  'synthetics-private-location',
  syntheticsMonitorSavedObjectType,
  'ingest-package-policies',
];

// Per-test cleanup must not wipe `synthetics-private-location`: the location is
// created once in `beforeAll` and reused as a monitor target, so removing it
// between tests would force an agent-policy recreation on every test.
const PER_TEST_SO_TYPES = [syntheticsMonitorSavedObjectType, 'ingest-package-policies'];

apiTest.describe(
  'DeleteProjectMonitors',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;
    let privateLocation: ScoutPrivateLocation;

    /** A browser project monitor body bound to the test's private location. */
    const makeMonitor = (overrides: Record<string, any> = {}) => ({
      ...(JSON.parse(JSON.stringify(projectBrowserMonitorFixture.monitors[0])) as Record<
        string,
        any
      >),
      id: uuidv4(),
      locations: [],
      privateLocations: [privateLocation.label],
      ...overrides,
    });

    /** Lists monitors filtered by `project_id` for the (optional) space. */
    const listByProjectId = async (
      apiClient: ApiClientFixture,
      project: string,
      opts: { spaceId?: string } = {}
    ): Promise<{ total: number; monitors: Array<Record<string, any>> }> => {
      const filter = `${syntheticsMonitorSavedObjectType}.attributes.project_id: "${project}"`;
      const res = await listMonitors(
        apiClient,
        editorHeaders,
        `filter=${encodeURIComponent(filter)}`,
        opts
      );
      return res.body as { total: number; monitors: Array<Record<string, any>> };
    };

    const expectProjectTotal = async (
      apiClient: ApiClientFixture,
      project: string,
      expected: number,
      opts: { spaceId?: string } = {}
    ) => {
      await tryForTime(30_000, async () => {
        const { total } = await listByProjectId(apiClient, project, opts);
        expect(total).toBe(expected);
      });
    };

    apiTest.beforeAll(async ({ requestAuth, kbnClient, apiServices }) => {
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey, { Accept: 'application/json' });
      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);
      await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();
      // Created once and reused across tests (see PER_TEST_SO_TYPES note).
      privateLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
    });

    apiTest.beforeEach(async ({ apiClient, kbnClient }) => {
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);
      await kbnClient.savedObjects.clean({ types: PER_TEST_SO_TYPES });
    });

    apiTest.afterAll(async ({ apiClient, kbnClient, apiServices }) => {
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
      // Remove the shared agent policy created in `beforeAll`.
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    });

    apiTest('only allows 500 requests at a time', async ({ apiClient }) => {
      const project = `test-brower-suite-${uuidv4()}`;
      const monitors = [
        makeMonitor({ id: 'test-id-0', name: 'test-name-0' }),
        makeMonitor({ id: 'test-id-1', name: 'test-name-1' }),
      ];
      const realMonitorIds = monitors.map((m) => m.id);
      const fakeIds = Array.from({ length: 499 }, (_, i) => `fake-id-${i}`);
      const oversizedDeletePayload = [...realMonitorIds, ...fakeIds];

      try {
        await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
        await expectProjectTotal(apiClient, project, 2);

        const res = await deleteProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          oversizedDeletePayload,
          { statusCode: 400 }
        );
        expect((res.body as { message: string }).message).toBe(
          '[request body.monitors]: array size is [501], but cannot be greater than [500]'
        );
      } finally {
        await deleteProjectMonitors(apiClient, editorHeaders, project, realMonitorIds).catch(
          () => {}
        );
      }
    });

    apiTest('project monitors - handles browser monitors', async ({ apiClient }) => {
      const project = `test-brower-suite-${uuidv4()}`;
      const monitorToDelete = 'second-monitor-id';
      const monitors = [makeMonitor(), makeMonitor({ id: monitorToDelete })];

      try {
        await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
        await expectProjectTotal(apiClient, project, 2);

        const res = await deleteProjectMonitors(apiClient, editorHeaders, project, [
          monitorToDelete,
        ]);
        expect((res.body as { deleted_monitors: string[] }).deleted_monitors).toStrictEqual([
          monitorToDelete,
        ]);

        await expectProjectTotal(apiClient, project, 1);
      } finally {
        await deleteProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          monitors.map((m) => m.id)
        ).catch(() => {});
      }
    });

    apiTest('does not delete monitors from a different project', async ({ apiClient }) => {
      const project = `test-brower-suite-${uuidv4()}`;
      const secondProject = `second-project-${uuidv4()}`;
      const monitors = [makeMonitor()];
      const monitorIds = monitors.map((m) => m.id);

      try {
        await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
        await pushProjectMonitors(apiClient, editorHeaders, secondProject, monitors);

        await expectProjectTotal(apiClient, project, monitors.length);
        await expectProjectTotal(apiClient, secondProject, monitors.length);

        const res = await deleteProjectMonitors(apiClient, editorHeaders, project, monitorIds);
        expect((res.body as { deleted_monitors: string[] }).deleted_monitors).toStrictEqual(
          monitorIds
        );

        await expectProjectTotal(apiClient, project, 0);
        await expectProjectTotal(apiClient, secondProject, monitors.length);
      } finally {
        await deleteProjectMonitors(apiClient, editorHeaders, project, monitorIds).catch(() => {});
        await deleteProjectMonitors(apiClient, editorHeaders, secondProject, monitorIds).catch(
          () => {}
        );
      }
    });

    apiTest(
      'does not delete monitors from the same project in a different space project',
      async ({ apiClient, kbnClient, apiServices }) => {
        const project = `test-brower-suite-${uuidv4()}`;
        const spaceId = `test-space-${uuidv4()}`;
        await kbnClient.spaces.create({ id: spaceId, name: `test-space-name ${uuidv4()}` });
        const spaceLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(
          spaceId
        );

        const monitors = [makeMonitor()];
        const monitorIds = monitors.map((m) => m.id);

        try {
          await pushProjectMonitors(
            apiClient,
            editorHeaders,
            project,
            monitors.map((m) => ({ ...m, privateLocations: [privateLocation.label] }))
          );
          await pushProjectMonitors(
            apiClient,
            editorHeaders,
            project,
            monitors.map((m) => ({ ...m, privateLocations: [spaceLocation.label] })),
            { spaceId }
          );

          await expectProjectTotal(apiClient, project, monitors.length);
          await expectProjectTotal(apiClient, project, monitors.length, { spaceId });

          const res = await deleteProjectMonitors(apiClient, editorHeaders, project, monitorIds, {
            spaceId,
          });
          expect((res.body as { deleted_monitors: string[] }).deleted_monitors).toStrictEqual(
            monitorIds
          );

          await expectProjectTotal(apiClient, project, monitors.length);
          await expectProjectTotal(apiClient, project, 0, { spaceId });
        } finally {
          await deleteProjectMonitors(apiClient, editorHeaders, project, monitorIds, {
            spaceId,
          }).catch(() => {});
          await deleteProjectMonitors(apiClient, editorHeaders, project, monitorIds).catch(
            () => {}
          );
          await kbnClient.spaces.delete(spaceId).catch(() => {});
        }
      }
    );

    apiTest(
      'deletes integration policies when project monitors are deleted',
      async ({ apiClient }) => {
        const project = `test-brower-suite-${uuidv4()}`;
        const monitors = [makeMonitor()];
        const monitorIds = monitors.map((m) => m.id);

        try {
          await pushProjectMonitors(apiClient, editorHeaders, project, monitors);

          const { total, monitors: created } = await listByProjectId(apiClient, project);
          expect(total).toBe(monitors.length);

          const customHeartbeatId = created[0].custom_heartbeat_id as string;
          const policy = await getPackagePolicyForMonitor(
            apiClient,
            adminHeaders,
            customHeartbeatId,
            privateLocation.id
          );
          expect(policy?.policy_id).toBe(privateLocation.id);

          const res = await deleteProjectMonitors(apiClient, editorHeaders, project, monitorIds);
          expect((res.body as { deleted_monitors: string[] }).deleted_monitors).toStrictEqual(
            monitorIds
          );

          await expectProjectTotal(apiClient, project, 0);

          const policyAfter = await getPackagePolicyForMonitor(
            apiClient,
            adminHeaders,
            customHeartbeatId,
            privateLocation.id
          );
          expect(policyAfter).toBeUndefined();
        } finally {
          await deleteProjectMonitors(apiClient, editorHeaders, project, monitorIds).catch(
            () => {}
          );
        }
      }
    );
  }
);
