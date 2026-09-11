/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mlApiTest as apiTest } from '../../fixtures';
import { setupFleetPackages, removeFleetPackages } from '../../fixtures/fleet_helpers';
import { runSetupModuleTest } from '../../fixtures/setup_module_helpers';
import type { SetupModuleTestData } from '../../fixtures/setup_module_helpers';

const testDataList: SetupModuleTestData[] = [
  {
    moduleId: 'apache_data_stream',
    prefix: 'pf23_',
    indexPatternName: 'ft_module_apache_data_stream',
    startDatafeed: true,
    end: 1536933580000,
    expected: {
      responseCode: 200,
      jobs: [
        {
          jobId: 'pf23_low_request_rate_apache',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        {
          jobId: 'pf23_source_ip_request_rate_apache',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        {
          jobId: 'pf23_source_ip_url_count_apache',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        {
          jobId: 'pf23_status_code_rate_apache',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        { jobId: 'pf23_visitor_rate_apache', jobState: 'closed', datafeedState: 'stopped' },
      ],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
  {
    moduleId: 'nginx_data_stream',
    prefix: 'pf24_',
    indexPatternName: 'ft_module_nginx_data_stream',
    startDatafeed: true,
    end: 1542372260000,
    expected: {
      responseCode: 200,
      jobs: [
        {
          jobId: 'pf24_low_request_rate_nginx',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        {
          jobId: 'pf24_source_ip_request_rate_nginx',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        {
          jobId: 'pf24_source_ip_url_count_nginx',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        {
          jobId: 'pf24_status_code_rate_nginx',
          jobState: 'closed',
          datafeedState: 'stopped',
        },
        { jobId: 'pf24_visitor_rate_nginx', jobState: 'closed', datafeedState: 'stopped' },
      ],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
];

apiTest.describe(
  'setup_module: data stream modules with startDatafeed true (requires Fleet packages)',
  { tag: '@local-stateful-classic' },
  () => {
    apiTest.beforeAll(async ({ esArchiver, apiServices }) => {
      await setupFleetPackages(apiServices);

      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_apache_data_stream'
      );
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_nginx_data_stream'
      );

      await apiServices.dataViews.create({
        title: 'ft_module_apache_data_stream',
        timeFieldName: '@timestamp',
      });
      await apiServices.dataViews.create({
        title: 'ft_module_nginx_data_stream',
        timeFieldName: '@timestamp',
      });
    });

    apiTest.afterEach(async ({ apiServices }) => {
      await apiServices.ml.indices.cleanAnomalyDetection();
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await removeFleetPackages(apiServices);

      await apiServices.dataViews.deleteByTitle('ft_module_apache_data_stream');
      await apiServices.dataViews.deleteByTitle('ft_module_nginx_data_stream');
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
