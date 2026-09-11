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
    moduleId: 'metricbeat_system_ecs',
    prefix: 'pf17_',
    indexPatternName: 'ft_module_metricbeat',
    startDatafeed: true,
    end: 1554501720000,
    expected: {
      responseCode: 200,
      jobs: [
        { jobId: 'pf17_high_mean_cpu_iowait_ecs', jobState: 'closed', datafeedState: 'stopped' },
        { jobId: 'pf17_max_disk_utilization_ecs', jobState: 'closed', datafeedState: 'stopped' },
        { jobId: 'pf17_metricbeat_outages_ecs', jobState: 'closed', datafeedState: 'stopped' },
      ],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
  {
    moduleId: 'metrics_ui_hosts',
    prefix: 'pf18_',
    indexPatternName: 'ft_module_metrics_ui',
    startDatafeed: true,
    end: 1599762970000,
    expected: {
      responseCode: 200,
      jobs: [
        { jobId: 'pf18_hosts_memory_usage', jobState: 'closed', datafeedState: 'stopped' },
        { jobId: 'pf18_hosts_network_in', jobState: 'closed', datafeedState: 'stopped' },
        { jobId: 'pf18_hosts_network_out', jobState: 'closed', datafeedState: 'stopped' },
      ],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
  {
    moduleId: 'metrics_ui_k8s',
    prefix: 'pf19_',
    indexPatternName: 'ft_module_metrics_ui',
    startDatafeed: true,
    end: 1599763000000,
    expected: {
      responseCode: 200,
      jobs: [
        { jobId: 'pf19_k8s_memory_usage', jobState: 'closed', datafeedState: 'stopped' },
        { jobId: 'pf19_k8s_network_in', jobState: 'closed', datafeedState: 'stopped' },
        { jobId: 'pf19_k8s_network_out', jobState: 'closed', datafeedState: 'stopped' },
      ],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
];

apiTest.describe(
  'setup_module: metrics modules with startDatafeed true',
  { tag: '@local-stateful-classic' },
  () => {
    apiTest.beforeAll(async ({ esArchiver, apiServices }) => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_metricbeat'
      );
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_metrics_ui'
      );
      await apiServices.dataViews.create({
        title: 'ft_module_metricbeat',
        timeFieldName: '@timestamp',
      });
      await apiServices.dataViews.create({
        title: 'ft_module_metrics_ui',
        timeFieldName: '@timestamp',
      });
    });

    apiTest.afterEach(async ({ apiServices }) => {
      await apiServices.ml.indices.cleanAnomalyDetection();
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await apiServices.dataViews.deleteByTitle('ft_module_metricbeat');
      await apiServices.dataViews.deleteByTitle('ft_module_metrics_ui');
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
