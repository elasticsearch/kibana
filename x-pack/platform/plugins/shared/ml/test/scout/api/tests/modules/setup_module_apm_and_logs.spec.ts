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
    moduleId: 'apm_transaction',
    prefix: 'pf5_',
    indexPatternName: 'ft_module_apm_transaction',
    startDatafeed: true,
    end: 1632925220000,
    expected: {
      responseCode: 200,
      jobs: [{ jobId: 'pf5_apm_tx_metrics', jobState: 'closed', datafeedState: 'stopped' }],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
  {
    moduleId: 'logs_ui_analysis',
    prefix: 'pf6_',
    indexPatternName: 'ft_module_logs',
    startDatafeed: true,
    end: 1556570920000,
    expected: {
      responseCode: 200,
      jobs: [{ jobId: 'pf6_log-entry-rate', jobState: 'closed', datafeedState: 'stopped' }],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
  {
    moduleId: 'logs_ui_categories',
    prefix: 'pf7_',
    indexPatternName: 'ft_module_logs',
    startDatafeed: true,
    end: 1556570920000,
    expected: {
      responseCode: 200,
      jobs: [
        { jobId: 'pf7_log-entry-categories-count', jobState: 'closed', datafeedState: 'stopped' },
      ],
      searches: [],
      visualizations: [],
      dashboards: [],
    },
  },
];

apiTest.describe(
  'setup_module: apm and logs modules with startDatafeed true',
  { tag: '@local-stateful-classic' },
  () => {
    apiTest.beforeAll(async ({ esArchiver, apiServices }) => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_apm_transaction'
      );
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/module_logs');
      await apiServices.dataViews.create({
        title: 'ft_module_apm_transaction',
        timeFieldName: '@timestamp',
      });
      await apiServices.dataViews.create({
        title: 'ft_module_logs',
        timeFieldName: '@timestamp',
      });
    });

    apiTest.afterEach(async ({ apiServices }) => {
      await apiServices.ml.indices.cleanAnomalyDetection();
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await apiServices.dataViews.deleteByTitle('ft_module_apm_transaction');
      await apiServices.dataViews.deleteByTitle('ft_module_logs');
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
