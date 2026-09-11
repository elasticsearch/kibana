/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mlApiTest as apiTest } from '../../fixtures';
import { runSetupModuleTest, cleanupModuleSavedObjects } from '../../fixtures/setup_module_helpers';
import type { SetupModuleExpected } from '../../fixtures/setup_module_helpers';

const SOURCE_ARCHIVE = 'x-pack/platform/test/fixtures/es_archives/ml/module_nginx';
const MODULE_ID = 'nginx_ecs';
const DATA_VIEW = { name: 'ft_module_nginx', timeField: '@timestamp' };

// nginx_ecs creates the same Kibana saved object IDs as apache_ecs.
// These two modules must run in separate files to avoid conflicts when both run
// in the same test session.
const EXPECTED: SetupModuleExpected = {
  responseCode: 200,
  jobs: [
    { jobId: 'pf8_low_request_rate_ecs', jobState: 'closed', datafeedState: 'stopped' },
    { jobId: 'pf8_source_ip_request_rate_ecs', jobState: 'closed', datafeedState: 'stopped' },
    { jobId: 'pf8_source_ip_url_count_ecs', jobState: 'closed', datafeedState: 'stopped' },
    { jobId: 'pf8_status_code_rate_ecs', jobState: 'closed', datafeedState: 'stopped' },
    { jobId: 'pf8_visitor_rate_ecs', jobState: 'closed', datafeedState: 'stopped' },
  ],
  searches: ['ml_http_access_filebeat_ecs'],
  visualizations: [
    'ml_http_access_map_ecs',
    'ml_http_access_source_ip_timechart_ecs',
    'ml_http_access_status_code_timechart_ecs',
    'ml_http_access_top_source_ips_table_ecs',
    'ml_http_access_top_urls_table_ecs',
    'ml_http_access_unique_count_url_timechart_ecs',
    'ml_http_access_events_timechart_ecs',
  ],
  dashboards: ['ml_http_access_explorer_ecs'],
};

apiTest.describe(
  'setup_module: nginx_ecs with startDatafeed true',
  { tag: '@local-stateful-classic' },
  () => {
    apiTest.beforeAll(async ({ esArchiver, apiServices }) => {
      await esArchiver.loadIfNeeded(SOURCE_ARCHIVE);
      await apiServices.dataViews.create({
        title: DATA_VIEW.name,
        timeFieldName: DATA_VIEW.timeField,
      });
    });

    apiTest.afterEach(async ({ apiServices }) => {
      await apiServices.ml.indices.cleanAnomalyDetection();
    });

    apiTest.afterAll(async ({ apiServices, kbnClient }) => {
      await cleanupModuleSavedObjects(kbnClient, EXPECTED);
      await apiServices.dataViews.deleteByTitle(DATA_VIEW.name);
    });

    // eslint-disable-next-line playwright/expect-expect
    apiTest(
      'sets up nginx_ecs module with datafeed and verifies saved objects',
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
          {
            moduleId: MODULE_ID,
            prefix: 'pf8_',
            indexPatternName: DATA_VIEW.name,
            startDatafeed: true,
            end: 1542372260000,
            expected: EXPECTED,
          }
        );
      }
    );
  }
);
