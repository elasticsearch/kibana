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
import { addMonitor, deleteMonitors, listMonitors } from '../../../common/fixtures/monitors';
import { bulkDeleteParams, createParam, getParams } from '../../../common/fixtures/params';
import {
  deleteAllSyntheticsPackagePolicies,
  getBrowserCompiledStream,
  getPackagePolicyForMonitor,
  getSyntheticsPackagePolicies,
} from '../../../common/fixtures/fleet';
import { tryForTime } from '../../../common/fixtures/retry';
import { browserMonitorFixture } from '../../../common/fixtures/data/browser_monitor';

const SYNTHETICS_PARAM_SO_TYPE = 'synthetics-param';

/**
 * Ported from FTR `apis/synthetics/sync_global_params_spaces.ts`
 * (`SyncGlobalParamsSpaces`) — the last FTR synthetics API spec, retired with
 * the config under #263519. The FTR suite was a 9-step, order-dependent `it`
 * chain sharing mutable state; it is collapsed here into one self-contained
 * test.
 *
 * Unique behavior preserved beyond `sync_global_params.spec.ts`: global params
 * are *space-scoped* — a param created in a non-default space syncs into that
 * space's monitor policy only — and the number of synthetics Fleet package
 * policies stays in lock-step with the number of monitors across spaces. As in
 * the sibling spec, params are asserted directly on the compiled stream rather
 * than via the brittle full golden-policy `comparePolicies` comparison.
 *
 * `@local-stateful-classic` + serverless: the FTR original was `skipCloud`.
 */
apiTest.describe(
  'SyncGlobalParamsSpaces',
  { tag: [...tags.local.stateful.classic, ...tags.local.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;
    let spaceId: string;

    apiTest.beforeAll(async ({ requestAuth, apiClient, kbnClient }) => {
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey);
      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);

      await kbnClient.savedObjects.clean({
        types: [...SYNTHETICS_MONITOR_SO_TYPES, SYNTHETICS_PARAM_SO_TYPE],
      });
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);

      spaceId = `test-space-${uuidv4()}`;
      await kbnClient.spaces.create({ id: spaceId, name: `test-space-name ${uuidv4()}` });
    });

    apiTest.afterAll(async ({ apiClient, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({
        types: [...SYNTHETICS_MONITOR_SO_TYPES, SYNTHETICS_PARAM_SO_TYPE],
      });
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
      if (spaceId) {
        await kbnClient.spaces.delete(spaceId).catch(() => {});
      }
    });

    apiTest(
      'syncs space-scoped params into the right monitor policy and keeps policy/monitor counts in lock-step',
      async ({ apiClient, apiServices }) => {
        // A private location shared with the test space + default, and a
        // default-only one, so the two monitors land on distinct agent policies.
        const locWithSpace = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation([
          spaceId,
          'default',
        ]);
        const defaultLocation =
          await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();

        // Monitor in the test space, on the shared private location.
        const spaceMonitorRes = await addMonitor(
          apiClient,
          editorHeaders,
          {
            ...browserMonitorFixture,
            name: `Space browser monitor ${uuidv4()}`,
            locations: [locWithSpace],
            spaces: [spaceId, 'default'],
          },
          { spaceId }
        );
        const spaceMonitorId = (spaceMonitorRes.body as { id: string }).id;

        // Monitor in the default space, on the default-only private location.
        const defaultMonitorRes = await addMonitor(apiClient, editorHeaders, {
          ...browserMonitorFixture,
          name: `Default browser monitor ${uuidv4()}`,
          locations: [defaultLocation],
        });
        const defaultMonitorId = (defaultMonitorRes.body as { id: string }).id;

        await tryForTime(30_000, async () => {
          const policy = await getPackagePolicyForMonitor(
            apiClient,
            adminHeaders,
            spaceMonitorId,
            locWithSpace.id,
            { spaceId }
          );
          expect(policy?.policy_id).toBe(locWithSpace.agentPolicyId);
        });

        // Params created in the test space must sync into the space monitor's policy.
        await createParam(
          apiClient,
          editorHeaders,
          { key: 'test', value: 'http://proxy.com' },
          { spaceId }
        );
        await createParam(
          apiClient,
          editorHeaders,
          { key: 'username', value: 'elastic' },
          { spaceId }
        );

        await tryForTime(60_000, async () => {
          const synced = await getPackagePolicyForMonitor(
            apiClient,
            adminHeaders,
            spaceMonitorId,
            locWithSpace.id,
            { spaceId }
          );
          expect(getBrowserCompiledStream(synced)?.params).toStrictEqual({
            test: 'http://proxy.com',
            username: 'elastic',
          });
        });

        // Deleting the space's params re-syncs and drops the compiled params.
        const spaceParams = (await getParams(apiClient, editorHeaders, { spaceId })).body as Array<{
          id: string;
        }>;
        await bulkDeleteParams(
          apiClient,
          editorHeaders,
          spaceParams.map((param) => param.id),
          { spaceId }
        );

        await tryForTime(60_000, async () => {
          const cleared = await getPackagePolicyForMonitor(
            apiClient,
            adminHeaders,
            spaceMonitorId,
            locWithSpace.id,
            { spaceId }
          );
          expect(getBrowserCompiledStream(cleared)?.params).toBeUndefined();
        });

        // One synthetics package policy per monitor, across all spaces.
        const policies = await getSyntheticsPackagePolicies(apiClient, adminHeaders);
        const allMonitors = await listMonitors(
          apiClient,
          adminHeaders,
          'page=1&perPage=2000&showFromAllSpaces=true'
        );
        expect(policies).toHaveLength((allMonitors.body as { total: number }).total);

        await deleteMonitors(apiClient, editorHeaders, [spaceMonitorId], { spaceId });
        await deleteMonitors(apiClient, editorHeaders, [defaultMonitorId]);
      }
    );
  }
);
