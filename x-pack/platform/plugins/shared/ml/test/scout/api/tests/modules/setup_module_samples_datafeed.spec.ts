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
    moduleId: 'sample_data_weblogs',
    prefix: 'pf2_',
    indexPatternName: 'ft_module_sample_logs',
    startDatafeed: true,
    end: 1585576710000,
    expected: {
      responseCode: 200,
      jobs: [
        { jobId: 'pf2_low_request_rate', jobState: 'closed', datafeedState: 'stopped' },
        { jobId: 'pf2_response_code_rates', jobState: 'closed', datafeedState: 'stopped' },
        { jobId: 'pf2_url_scanning', jobState: 'closed', datafeedState: 'stopped' },
      ],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
  {
    moduleId: 'sample_data_ecommerce',
    prefix: 'pf9_',
    indexPatternName: 'ft_module_sample_ecommerce',
    startDatafeed: true,
    end: 1585260210000,
    expected: {
      responseCode: 200,
      jobs: [{ jobId: 'pf9_high_sum_total_sales', jobState: 'closed', datafeedState: 'stopped' }],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
];

// TODO: Add @cloud-stateful-classic once ECH custom-role support lands (see get_filters.spec.ts TODO).
apiTest.describe(
  'setup_module: sample data modules with startDatafeed true',
  { tag: '@local-stateful-classic' },
  () => {
    apiTest.beforeAll(async ({ esArchiver, apiServices }) => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_sample_logs'
      );
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_sample_ecommerce'
      );
      await apiServices.dataViews.create({
        title: 'ft_module_sample_logs',
        timeFieldName: '@timestamp',
      });
      await apiServices.dataViews.create({
        title: 'ft_module_sample_ecommerce',
        timeFieldName: 'order_date',
      });
    });

    apiTest.afterEach(async ({ apiServices }) => {
      await apiServices.ml.indices.cleanAnomalyDetection();
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await apiServices.dataViews.deleteByTitle('ft_module_sample_logs');
      await apiServices.dataViews.deleteByTitle('ft_module_sample_ecommerce');
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
