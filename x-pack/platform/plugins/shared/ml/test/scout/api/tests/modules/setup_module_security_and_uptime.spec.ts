/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mlApiTest as apiTest } from '../../fixtures';
import { runSetupModuleTest } from '../../fixtures/setup_module_helpers';
import type { SetupModuleTestData } from '../../fixtures/setup_module_helpers';

const testDataList: SetupModuleTestData[] = [
  {
    moduleId: 'security_packetbeat',
    prefix: 'pf12_',
    indexPatternName: 'ft_module_security_packetbeat',
    startDatafeed: true,
    end: 1588688580000,
    expected: {
      responseCode: 200,
      jobs: [
        {
          jobId: 'pf12_packetbeat_rare_server_domain_ea',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        {
          jobId: 'pf12_packetbeat_rare_urls_ea',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        {
          jobId: 'pf12_packetbeat_rare_user_agent_ea',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
      ],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
  {
    moduleId: 'uptime_heartbeat',
    prefix: 'pf13_',
    indexPatternName: 'ft_module_heartbeat',
    startDatafeed: true,
    end: 1584117860000,
    expected: {
      responseCode: 200,
      jobs: [{ jobId: 'pf13_high_latency_by_geo', jobState: 'closed', datafeedState: 'stopped' }],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
  {
    moduleId: 'security_cloudtrail',
    prefix: 'pf20_',
    indexPatternName: 'ft_module_security_cloudtrail',
    startDatafeed: true,
    end: 1594231870000,
    expected: {
      responseCode: 200,
      jobs: [
        {
          jobId: 'pf20_high_distinct_count_error_message',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        { jobId: 'pf20_rare_error_code', jobState: 'closed', datafeedState: 'stopped' },
        { jobId: 'pf20_rare_method_for_a_city', jobState: 'closed', datafeedState: 'stopped' },
        {
          jobId: 'pf20_rare_method_for_a_country',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        {
          jobId: 'pf20_rare_method_for_a_user_id_ea',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
      ],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
];

apiTest.describe(
  'setup_module: security and uptime modules with startDatafeed true',
  { tag: '@local-stateful-classic' },
  () => {
    apiTest.beforeAll(async ({ esArchiver, apiServices }) => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_security_packetbeat'
      );
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_heartbeat'
      );
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_security_cloudtrail'
      );
      await apiServices.dataViews.create({
        title: 'ft_module_security_packetbeat',
        timeFieldName: '@timestamp',
      });
      await apiServices.dataViews.create({
        title: 'ft_module_heartbeat',
        timeFieldName: '@timestamp',
      });
      await apiServices.dataViews.create({
        title: 'ft_module_security_cloudtrail',
        timeFieldName: '@timestamp',
      });
    });

    apiTest.afterEach(async ({ apiServices }) => {
      await apiServices.ml.indices.cleanAnomalyDetection();
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await apiServices.dataViews.deleteByTitle('ft_module_security_packetbeat');
      await apiServices.dataViews.deleteByTitle('ft_module_heartbeat');
      await apiServices.dataViews.deleteByTitle('ft_module_security_cloudtrail');
    });

    for (const data of testDataList) {
      // eslint-disable-next-line playwright/expect-expect
      apiTest(
        `sets up ${data.moduleId} module with datafeed and verifies states`,
        async ({ apiClient, samlAuth, apiServices, kbnClient }) => {
          await runSetupModuleTest(
            apiClient,
            {
              step: (title, fn) => apiTest.step(title, fn),
              setTimeout: (ms) => apiTest.setTimeout(ms),
              samlAuth,
              anomalyDetection: apiServices.ml.anomalyDetection,
              kbnClient,
            },
            data
          );
        }
      );
    }
  }
);
