/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import { expect } from '@kbn/scout-oblt/api';
import { tags } from '@kbn/scout-oblt';
import {
  apiTest,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import { addMonitor } from '../../../common/fixtures/monitors';
import { createParam, updateParam } from '../../../common/fixtures/params';
import {
  deleteAllSyntheticsPackagePolicies,
  getSyntheticsPackagePolicies,
} from '../../../common/fixtures/fleet';
import { delay, tryForTime } from '../../../common/fixtures/retry';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

const MONITOR_WITH_PARAM_A = 'test-monitor-with-paramA';
const MONITOR_WITH_PARAM_B = 'test-monitor-with-paramB';
const MONITOR_WITH_BOTH_PARAMS = 'test-monitor-with-both-params';
const MONITOR_WITHOUT_PARAMS = 'test-monitor-without-params';

const findPolicyByMonitorName = (policies: PackagePolicy[], monitorName: string) =>
  policies.find((p) => p.name.startsWith(monitorName));

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/sync_global_params_for_filtered_monitors.ts`.
 *
 * The FTR suite was a four-step cumulative flow (create params → create
 * monitors → update one param → verify selective re-sync) sharing mutable
 * state across `it`s. It is collapsed here into a single self-contained test so
 * it stays parallel-safe. Editor auth drives params/monitors; admin auth reads
 * the Fleet package policies (the FTR used the elevated supertest for those).
 */
apiTest.describe(
  'SyncGlobalParamsForFilteredMonitors',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth, apiClient, kbnClient }) => {
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey);
      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);

      await kbnClient.savedObjects.clean({
        types: [...SYNTHETICS_MONITOR_SO_TYPES, 'synthetics-param'],
      });
      // guarantee a clean Fleet baseline (other suites can leave orphaned policies)
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);
    });

    apiTest.afterAll(async ({ apiClient, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({
        types: [...SYNTHETICS_MONITOR_SO_TYPES, 'synthetics-param'],
      });
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    });

    apiTest(
      'only re-syncs package policies for monitors that reference the modified param',
      async ({ apiClient, apiServices }) => {
        const location = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();

        // paramA / paramB
        const paramARes = await createParam(apiClient, editorHeaders, {
          key: 'paramA',
          value: 'valueA',
        });
        const paramAId = (paramARes.body as { id: string }).id;
        await createParam(apiClient, editorHeaders, { key: 'paramB', value: 'valueB' });

        // four monitors with different param references
        const createHttpMonitor = (name: string, urls: string) =>
          addMonitor(apiClient, editorHeaders, {
            ...httpMonitorFixture,
            name,
            urls,
            locations: [location],
          });

        await createHttpMonitor(MONITOR_WITH_PARAM_A, 'https://example.com/${paramA}/health');
        await createHttpMonitor(MONITOR_WITH_PARAM_B, 'https://example.com/${paramB}/health');
        await createHttpMonitor(
          MONITOR_WITH_BOTH_PARAMS,
          'https://example.com/${paramA}/${paramB}'
        );
        await createHttpMonitor(MONITOR_WITHOUT_PARAMS, 'https://example.com/static/health');

        await tryForTime(30_000, async () => {
          const policies = await getSyntheticsPackagePolicies(apiClient, adminHeaders);
          expect(policies).toHaveLength(4);
        });

        // allow the initial syncs to settle before capturing revisions
        await delay(10_000);

        const policiesBefore = await getSyntheticsPackagePolicies(apiClient, adminHeaders);
        expect(policiesBefore).toHaveLength(4);
        const revisionsBefore: Record<string, number> = {};
        for (const p of policiesBefore) {
          revisionsBefore[p.name] = p.revision;
        }
        for (const name of [
          MONITOR_WITH_PARAM_A,
          MONITOR_WITH_PARAM_B,
          MONITOR_WITH_BOTH_PARAMS,
          MONITOR_WITHOUT_PARAMS,
        ]) {
          expect(findPolicyByMonitorName(policiesBefore, name) != null).toBe(true);
        }

        // modify paramA only
        await updateParam(apiClient, editorHeaders, paramAId, {
          key: 'paramA',
          value: 'updatedValueA',
        });

        await tryForTime(60_000, async () => {
          const policiesAfter = await getSyntheticsPackagePolicies(apiClient, adminHeaders);
          const policyParamA = findPolicyByMonitorName(policiesAfter, MONITOR_WITH_PARAM_A)!;
          const policyBoth = findPolicyByMonitorName(policiesAfter, MONITOR_WITH_BOTH_PARAMS)!;
          expect(policyParamA.revision).toBeGreaterThan(revisionsBefore[policyParamA.name]);
          expect(policyBoth.revision).toBeGreaterThan(revisionsBefore[policyBoth.name]);
        });

        // the unaffected monitors must NOT be re-synced
        const policiesFinal = await getSyntheticsPackagePolicies(apiClient, adminHeaders);
        const policyParamB = findPolicyByMonitorName(policiesFinal, MONITOR_WITH_PARAM_B)!;
        const policyNoParams = findPolicyByMonitorName(policiesFinal, MONITOR_WITHOUT_PARAMS)!;
        expect(policyParamB.revision).toBe(revisionsBefore[policyParamB.name]);
        expect(policyNoParams.revision).toBe(revisionsBefore[policyNoParams.name]);

        // the updated value is resolved in the affected policy's compiled stream
        const policyParamA = findPolicyByMonitorName(policiesFinal, MONITOR_WITH_PARAM_A)!;
        const httpInput = policyParamA.inputs.find((i) => i.type === 'synthetics/http');
        const compiledStream = httpInput?.streams?.[0]?.compiled_stream as
          | Record<string, unknown>
          | undefined;
        expect(compiledStream != null).toBe(true);
        expect(compiledStream!.urls).toBe('https://example.com/updatedValueA/health');
      }
    );
  }
);
