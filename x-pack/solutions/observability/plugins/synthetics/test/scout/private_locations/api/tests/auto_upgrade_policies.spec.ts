/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import semver from 'semver';
import { v4 as uuidv4 } from 'uuid';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';
import {
  apiTest,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import { addMonitor, deleteMonitors } from '../../../common/fixtures/monitors';
import { getPackagePolicyForMonitor } from '../../../common/fixtures/fleet';
import { tryForTime } from '../../../common/fixtures/retry';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

/**
 * Scout port of the FTR `apis/synthetics/auto_upgrade_policies.ts` suite.
 *
 * It downgrades the *global* synthetics Fleet package to an older version,
 * creates a monitor (whose package policy is pinned to that version),
 * reinstalls the latest package, and asserts the monitor's package policy is
 * auto-upgraded. Kept in its own file (separate from
 * `create_monitor_private_location.spec.ts`) because the global downgrade must
 * not interfere with sibling specs.
 *
 * The synthetics Scout API config runs serially (`workers: 1`,
 * `fullyParallel: false`), so the global package downgrade/restore is safe.
 *
 * Forcing a downgrade + upgrade and waiting out Fleet's policy auto-upgrade
 * sweep can take a few minutes, so the default 60s per-test timeout is raised.
 */
const TEST_TIMEOUT = 5 * 60 * 1000;

apiTest.describe(
  'AutoUpgradePolicies',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    const LOWER_VERSION = '1.1.1';

    let editorHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;
    let testPolicyId: string;
    let privateLocation: ScoutPrivateLocation;

    apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey);
      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);

      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();
      const { id: policyId } = await apiServices.syntheticsPrivateLocations.addFleetPolicy(
        `Fleet test server policy ${Date.now()}`
      );
      testPolicyId = policyId;
      [privateLocation] = await apiServices.syntheticsPrivateLocations.setTestLocations([
        testPolicyId,
      ]);
    });

    apiTest.afterAll(async ({ apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
      // Safety net: ensure the global package is back at the latest version even
      // if the test body's own restore did not run.
      await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();
    });

    const getPolicy = (
      apiClient: ApiClientFixture,
      monitorId: string,
      locationId: string
    ): Promise<PackagePolicy | undefined> =>
      getPackagePolicyForMonitor(apiClient, adminHeaders, monitorId, locationId);

    apiTest('handles auto upgrading policies', async ({ apiClient, apiServices }) => {
      apiTest.setTimeout(TEST_TIMEOUT);
      // The package-registry-verify-and-promote pipeline may run against a
      // registry that doesn't publish old versions — skip gracefully (mirrors
      // the FTR `this.skip()` on a 404) rather than failing the install loop.
      const pkgCheck = await apiClient.get(`api/fleet/epm/packages/synthetics/${LOWER_VERSION}`, {
        headers: adminHeaders,
        responseType: 'json',
      });
      apiTest.skip(
        pkgCheck.statusCode === 404,
        `synthetics ${LOWER_VERSION} not available in package registry`
      );

      // Force the global synthetics package down to an older version so the
      // monitor's package policy is created at that version.
      await apiServices.syntheticsPrivateLocations.installSyntheticsPackage({
        version: LOWER_VERSION,
      });

      let monitorId = '';
      try {
        const res = await addMonitor(apiClient, editorHeaders, {
          ...httpMonitorFixture,
          locations: [privateLocation],
          name: `Test monitor ${uuidv4()}`,
          namespace: 'default',
        });
        monitorId = (res.body as { id: string }).id;

        await tryForTime(30_000, async () => {
          const policy = await getPolicy(apiClient, monitorId, testPolicyId);
          expect(policy?.package?.version).toBe(LOWER_VERSION);
        });

        // Reinstall the package at the latest version, then trigger Fleet
        // setup. `installSyntheticsPackage` runs `POST /api/fleet/setup`
        // *before* the install, so the managed-policy upgrade sweep
        // (`setupUpgradeManagedPackagePolicies`) sees the old version and is a
        // no-op. An explicit setup *after* the upgrade detects the now-outdated
        // policy and schedules its upgrade — without it the test passively
        // waits on a ~5-minute scheduled task that never fires within 120s.
        await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();
        await apiServices.fleet.internal.setup();

        await tryForTime(120_000, async () => {
          const upgraded = await getPolicy(apiClient, monitorId, testPolicyId);
          const upgradedVersion = upgraded?.package?.version;
          expect(Boolean(upgradedVersion && semver.gt(upgradedVersion, LOWER_VERSION))).toBe(true);
        });
      } finally {
        if (monitorId) {
          await deleteMonitors(apiClient, editorHeaders, [monitorId], { spaceId: 'default' });
        }
        // Restore the latest package version — subsequent specs in this worker
        // assume the package is at the latest version.
        await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();
      }
    });
  }
);
