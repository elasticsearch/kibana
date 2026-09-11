/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import { tags } from '@kbn/scout-oblt';
import {
  apiTest,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import {
  saveMonitorInternal,
  testNowMonitor,
  triggerPrivateLocationCleanup,
} from '../../../common/fixtures/monitors';
import {
  deleteAllSyntheticsPackagePolicies,
  getSyntheticsPackagePolicies,
} from '../../../common/fixtures/fleet';
import { tryForTime } from '../../../common/fixtures/retry';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/clean_up_extra_package_policies.ts`.
 *
 * The FTR suite's two cumulative `it`s (create monitors, then orphan one and
 * clean up) are collapsed into a single self-contained test. Editor auth drives
 * the synthetics APIs; admin reads the Fleet package policies.
 */
apiTest.describe(
  'CleanUpExtraPackagePolicies',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth, apiClient, kbnClient }) => {
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey);
      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      // guarantee a clean Fleet baseline (other suites can leave orphaned policies)
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);
    });

    apiTest.afterAll(async ({ apiClient, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    });

    apiTest(
      'cleans up orphaned package policies',
      async ({ apiClient, apiServices, kbnClient }) => {
        const location = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();

        const firstRes = await saveMonitorInternal(apiClient, editorHeaders, {
          ...httpMonitorFixture,
          name: `first-monitor-${uuidv4()}`,
          locations: [location],
        });
        const newMonitorId = (firstRes.body as { config_id: string }).config_id;
        expect(await getSyntheticsPackagePolicies(apiClient, adminHeaders)).toHaveLength(1);

        const secondRes = await saveMonitorInternal(apiClient, editorHeaders, {
          ...httpMonitorFixture,
          name: 'second-monitor',
          locations: [location],
        });
        const secondMonitorId = (secondRes.body as { config_id: string }).config_id;
        expect(await getSyntheticsPackagePolicies(apiClient, adminHeaders)).toHaveLength(2);

        // delete only the saved object so its package policy becomes orphaned.
        // The monitor may be stored under either monitor SO type, so try both.
        let deleted = false;
        for (const type of SYNTHETICS_MONITOR_SO_TYPES) {
          try {
            await kbnClient.savedObjects.delete({ type, id: newMonitorId });
            deleted = true;
            break;
          } catch {
            // wrong type for this monitor — try the next
          }
        }
        expect(deleted).toBe(true);

        // a test-now run on the surviving monitor creates a temporary policy
        await testNowMonitor(apiClient, editorHeaders, secondMonitorId);
        expect(await getSyntheticsPackagePolicies(apiClient, adminHeaders)).toHaveLength(3);

        await triggerPrivateLocationCleanup(apiClient, editorHeaders);

        await tryForTime(30_000, async () => {
          const items = await getSyntheticsPackagePolicies(apiClient, adminHeaders);
          // 2 = surviving monitor's policy + the temporary test-now policy
          expect(items).toHaveLength(2);
          const names = items.map((item) => item.name);
          expect(names).toContain('LIGHTWEIGHT_SYNTHETICS_TEST_NOW_RUN');
          expect(
            names.filter((name) => name.includes('second-monitor-Test private location'))
          ).toHaveLength(1);
        });
      }
    );
  }
);
