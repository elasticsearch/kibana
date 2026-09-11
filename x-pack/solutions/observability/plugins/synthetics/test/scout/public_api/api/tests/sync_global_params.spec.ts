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
import { addMonitor, deleteMonitors } from '../../../common/fixtures/monitors';
import { bulkDeleteParams, createParam, getParams } from '../../../common/fixtures/params';
import {
  deleteAllSyntheticsPackagePolicies,
  getBrowserCompiledStream,
  getPackagePolicyForMonitor,
} from '../../../common/fixtures/fleet';
import { tryForTime } from '../../../common/fixtures/retry';
import { browserMonitorFixture } from '../../../common/fixtures/data/browser_monitor';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

const SYNTHETICS_PARAM_SO_TYPE = 'synthetics-param';

/**
 * Ported from FTR `apis/synthetics/sync_global_params.ts` (`SyncGlobalParams`),
 * the last of the synthetics API suites that kept the FTR config alive
 * (#263519). The FTR suite was a 10-step, order-dependent `it` chain sharing
 * mutable state; it is collapsed here into one self-contained test.
 *
 * Unique behavior preserved: a *global parameter* is synced into the backing
 * Fleet package policy of an already-created private-location monitor, and is
 * removed again when the parameter is deleted. (Selective re-sync on param
 * *update* is covered by `sync_global_params_for_filtered_monitors.spec.ts`.)
 * Instead of the FTR full golden-policy `comparePolicies` comparison — which is
 * tightly coupled to a hardcoded `Test private location 0` label and is not used
 * by any active Scout spec — we assert directly on the compiled-stream `params`,
 * the actual integration point (mirrors the `maintenance_windows` spec's
 * rationale).
 *
 * `@local-stateful-classic` + serverless: the FTR original was `skipCloud`
 * (mock synthetics service), which the Scout server config already provides, so
 * coverage is widened to serverless at no extra cost.
 */
apiTest.describe(
  'SyncGlobalParams',
  { tag: [...tags.local.stateful.classic, ...tags.local.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth, apiClient, kbnClient }) => {
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey);
      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);

      await kbnClient.savedObjects.clean({
        types: [...SYNTHETICS_MONITOR_SO_TYPES, SYNTHETICS_PARAM_SO_TYPE],
      });
      // Guarantee a clean Fleet baseline; sibling suites can leave orphaned policies.
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);
    });

    apiTest.afterAll(async ({ apiClient, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({
        types: [...SYNTHETICS_MONITOR_SO_TYPES, SYNTHETICS_PARAM_SO_TYPE],
      });
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    });

    apiTest(
      'syncs a global param into a private-location monitor policy and removes it on delete',
      async ({ apiClient, apiServices }) => {
        const location = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();

        // 1. A browser monitor in the private location — no params referenced yet.
        const browserRes = await addMonitor(apiClient, editorHeaders, {
          ...browserMonitorFixture,
          name: `Browser sync params ${uuidv4()}`,
          locations: [location],
        });
        const browserMonitorId = (browserRes.body as { id: string }).id;

        await tryForTime(30_000, async () => {
          const policy = await getPackagePolicyForMonitor(
            apiClient,
            adminHeaders,
            browserMonitorId,
            location.id
          );
          expect(policy?.policy_id).toBe(location.agentPolicyId);
        });

        // No params are compiled into the policy before any are created.
        const initialPolicy = await getPackagePolicyForMonitor(
          apiClient,
          adminHeaders,
          browserMonitorId,
          location.id
        );
        expect(getBrowserCompiledStream(initialPolicy)?.params).toBeUndefined();

        // 2. Creating a global param triggers an async re-sync of existing policies.
        await createParam(apiClient, editorHeaders, { key: 'test', value: 'http://proxy.com' });

        await tryForTime(60_000, async () => {
          const synced = await getPackagePolicyForMonitor(
            apiClient,
            adminHeaders,
            browserMonitorId,
            location.id
          );
          expect(getBrowserCompiledStream(synced)?.params).toStrictEqual({
            test: 'http://proxy.com',
          });
        });

        // 3. A new http monitor referencing the param resolves it in its compiled stream.
        const httpRes = await addMonitor(apiClient, editorHeaders, {
          ...httpMonitorFixture,
          name: `HTTP using param ${uuidv4()}`,
          locations: [location],
          proxy_url: '${test}',
        });
        const httpMonitorId = (httpRes.body as { id: string }).id;

        await tryForTime(60_000, async () => {
          const httpPolicy = await getPackagePolicyForMonitor(
            apiClient,
            adminHeaders,
            httpMonitorId,
            location.id
          );
          const httpInput = httpPolicy?.inputs.find((input) => input.type === 'synthetics/http');
          const compiled = httpInput?.streams?.[0]?.compiled_stream as
            | Record<string, unknown>
            | undefined;
          expect(compiled?.proxy_url).toBe('http://proxy.com');
        });

        // 4. Deleting all params re-syncs the policies and drops the compiled params.
        const params = (await getParams(apiClient, editorHeaders)).body as Array<{ id: string }>;
        await bulkDeleteParams(
          apiClient,
          editorHeaders,
          params.map((param) => param.id)
        );

        await tryForTime(60_000, async () => {
          const cleared = await getPackagePolicyForMonitor(
            apiClient,
            adminHeaders,
            browserMonitorId,
            location.id
          );
          expect(getBrowserCompiledStream(cleared)?.params).toBeUndefined();
        });

        await deleteMonitors(apiClient, editorHeaders, [browserMonitorId, httpMonitorId]);
      }
    );
  }
);
