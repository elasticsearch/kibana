/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { sortBy } from 'lodash';
import type { ApiServicesFixture } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { INTERNAL_API_HEADERS } from './constants';
import { deleteSavedObject, assertSavedObjectExists } from './general_test_helpers';
import type { KbnRequestable } from './general_test_helpers';

export const ALL_MODULE_IDS = [
  'apache_data_stream',
  'apache_ecs',
  'apm_transaction',
  'auditbeat_process_docker_ecs',
  'logs_ui_analysis',
  'logs_ui_categories',
  'metricbeat_system_ecs',
  'metrics_ui_hosts',
  'metrics_ui_k8s',
  'nginx_data_stream',
  'nginx_ecs',
  'sample_data_ecommerce',
  'sample_data_weblogs',
  'security_auth',
  'security_azure_activitylogs',
  'security_cloudtrail',
  'security_gcp_audit',
  'security_host',
  'security_linux_v3',
  'security_network',
  'security_packetbeat',
  'security_windows_v3',
  'uptime_heartbeat',
];

export const SECURITY_MODULE_IDS = [
  'auditbeat_process_docker_ecs',
  'logs_ui_analysis',
  'logs_ui_categories',
  'security_auth',
  'security_azure_activitylogs',
  'security_cloudtrail',
  'security_gcp_audit',
  'security_host',
  'security_linux_v3',
  'security_network',
  'security_packetbeat',
  'security_windows_v3',
];

export interface SetupModuleJobExpected {
  jobId: string;
  jobState: string;
  datafeedState: string;
}

export interface SetupModuleExpected {
  responseCode: number;
  jobs: SetupModuleJobExpected[];
  searches: string[];
  visualizations: string[];
  dashboards: string[];
}

export interface SetupModuleTestData {
  moduleId: string;
  prefix: string;
  indexPatternName: string;
  startDatafeed: boolean;
  end?: number;
  estimateModelMemory?: boolean;
  expected: SetupModuleExpected;
}

interface ModuleApiClient {
  post(
    url: string,
    opts?: {
      headers?: Record<string, string>;
      responseType?: string;
      body?: unknown;
    }
  ): Promise<{ statusCode: number; body: Record<string, unknown> }>;
}

interface MlSamlAuth {
  asMlPoweruser(): Promise<{ cookieHeader: Record<string, string> }>;
}

export interface SetupModuleCtx {
  step: (title: string, fn: () => Promise<void>) => Promise<void>;
  setTimeout: (ms: number) => void;
  samlAuth: MlSamlAuth;
  anomalyDetection: ApiServicesFixture['ml']['anomalyDetection'];
  kbnClient: KbnRequestable;
}

/**
 * Runs a module setup POST and verifies the full response and job/datafeed states.
 *
 * `apiClient` is the first positional argument (not inside the ctx object) so that
 * the scout_require_api_client_in_api_test ESLint rule can detect its usage.
 */
export async function runSetupModuleTest(
  apiClient: ModuleApiClient,
  ctx: SetupModuleCtx,
  data: SetupModuleTestData
): Promise<void> {
  const { step, setTimeout: setTestTimeout, samlAuth, anomalyDetection, kbnClient } = ctx;

  if (data.startDatafeed) {
    setTestTimeout(5 * 60 * 1000);
  }

  const { cookieHeader } = await samlAuth.asMlPoweruser();
  const requestBody: Record<string, unknown> = {
    prefix: data.prefix,
    indexPatternName: data.indexPatternName,
    startDatafeed: data.startDatafeed,
  };
  if (data.end !== undefined) requestBody.end = data.end;
  if (data.estimateModelMemory !== undefined)
    requestBody.estimateModelMemory = data.estimateModelMemory;

  const res = await apiClient.post(`internal/ml/modules/setup/${data.moduleId}`, {
    headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
    responseType: 'json',
    body: requestBody,
  });

  expect(res).toHaveStatusCode(data.expected.responseCode);

  if (data.expected.jobs.length > 0) {
    await step('verify jobs in response', async () => {
      const expectedRspJobs = sortBy(
        data.expected.jobs.map(({ jobId }) => ({ id: jobId, success: true })),
        'id'
      );
      const actualRspJobs = sortBy(res.body.jobs as Array<{ id: string; success: boolean }>, 'id');
      expect(actualRspJobs).toStrictEqual(expectedRspJobs);
    });

    await step('verify datafeeds in response', async () => {
      const expectedRspDatafeeds = sortBy(
        data.expected.jobs.map(({ jobId }) => ({
          awaitingMlNodeAllocation: false,
          id: `datafeed-${jobId}`,
          success: true,
          started: data.startDatafeed,
        })),
        'id'
      );
      const actualRspDatafeeds = sortBy(
        res.body.datafeeds as Array<{
          awaitingMlNodeAllocation: boolean;
          id: string;
          success: boolean;
          started: boolean;
        }>,
        'id'
      );
      expect(actualRspDatafeeds).toStrictEqual(expectedRspDatafeeds);
    });

    if (
      data.expected.searches.length > 0 ||
      data.expected.visualizations.length > 0 ||
      data.expected.dashboards.length > 0
    ) {
      await step('verify kibana saved objects in response', async () => {
        const kibana = (res.body.kibana ?? {}) as Record<string, Array<{ id: string }>>;
        const actualSearches = sortBy(kibana.search ?? [], 'id');
        const actualViz = sortBy(kibana.visualization ?? [], 'id');
        const actualDashboards = sortBy(kibana.dashboard ?? [], 'id');

        expect(actualSearches).toStrictEqual(
          sortBy(
            data.expected.searches.map((id) => ({ id, success: true })),
            'id'
          )
        );
        expect(actualViz).toStrictEqual(
          sortBy(
            data.expected.visualizations.map((id) => ({ id, success: true })),
            'id'
          )
        );
        expect(actualDashboards).toStrictEqual(
          sortBy(
            data.expected.dashboards.map((id) => ({ id, success: true })),
            'id'
          )
        );
      });
    }

    await step('wait for jobs and datafeeds to reach expected state', async () => {
      for (const { jobId, jobState, datafeedState } of data.expected.jobs) {
        const datafeedId = `datafeed-${jobId}`;
        if (data.startDatafeed) {
          await anomalyDetection.waitForJobRecordCountToBePositive(jobId);
        }
        await anomalyDetection.waitForDatafeedState(datafeedId, datafeedState);
        await anomalyDetection.waitForJobState(jobId, jobState);
      }
    });

    await step('verify model memory limit is a valid size', async () => {
      for (const { jobId } of data.expected.jobs) {
        const mml = await anomalyDetection.getJobModelMemoryLimit(jobId);
        expect(mml).toMatch(/^\d+mb$/i);
      }
    });

    if (data.expected.searches.length > 0) {
      await step('verify saved searches exist', async () => {
        for (const id of data.expected.searches) {
          await assertSavedObjectExists(kbnClient, 'search', id);
        }
      });
    }
    if (data.expected.visualizations.length > 0) {
      await step('verify visualizations exist', async () => {
        for (const id of data.expected.visualizations) {
          await assertSavedObjectExists(kbnClient, 'visualization', id);
        }
      });
    }
    if (data.expected.dashboards.length > 0) {
      await step('verify dashboards exist', async () => {
        for (const id of data.expected.dashboards) {
          await assertSavedObjectExists(kbnClient, 'dashboard', id);
        }
      });
    }
  }
}

export async function cleanupModuleSavedObjects(
  kbnClient: KbnRequestable,
  expected: Pick<SetupModuleExpected, 'searches' | 'visualizations' | 'dashboards'>
): Promise<void> {
  for (const id of expected.searches) {
    await deleteSavedObject(kbnClient, 'search', id);
  }
  for (const id of expected.visualizations) {
    await deleteSavedObject(kbnClient, 'visualization', id);
  }
  for (const id of expected.dashboards) {
    await deleteSavedObject(kbnClient, 'dashboard', id);
  }
}
