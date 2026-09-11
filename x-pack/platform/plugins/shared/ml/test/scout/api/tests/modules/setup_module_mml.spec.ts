/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { mlApiTest as apiTest, INTERNAL_API_HEADERS } from '../../fixtures';

const SOURCE_ARCHIVE = 'x-pack/platform/test/fixtures/es_archives/ml/module_sample_logs';
const MODULE_ID = 'sample_data_weblogs';
const DATA_VIEW = { name: 'ft_module_sample_logs', timeField: '@timestamp' };

apiTest.describe(
  'setup_module: estimate model memory limit',
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

    apiTest.afterAll(async ({ apiServices }) => {
      await apiServices.dataViews.deleteByTitle(DATA_VIEW.name);
    });

    apiTest(
      'estimates model memory limits when estimateModelMemory is true',
      async ({ apiClient, samlAuth, apiServices }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.post(`internal/ml/modules/setup/${MODULE_ID}`, {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
          body: {
            prefix: 'mml_true_',
            indexPatternName: DATA_VIEW.name,
            startDatafeed: false,
            estimateModelMemory: true,
          },
        });

        expect(res).toHaveStatusCode(200);
        const jobs = res.body.jobs as Array<{ id: string; success: boolean }>;
        expect(jobs).toHaveLength(3);

        // estimated values are larger than the module defaults (10mb)
        const expectedMMLs = ['11mb', '11mb', '16mb'];
        for (let i = 0; i < jobs.length; i++) {
          expect(jobs[i].success).toBe(true);
          const mml = await apiServices.ml.anomalyDetection.getJobModelMemoryLimit(jobs[i].id);
          expect(mml).toBe(expectedMMLs[i]);
        }
      }
    );

    apiTest(
      'uses module default memory limits when estimateModelMemory is false',
      async ({ apiClient, samlAuth, apiServices }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.post(`internal/ml/modules/setup/${MODULE_ID}`, {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
          body: {
            prefix: 'mml_false_',
            indexPatternName: DATA_VIEW.name,
            startDatafeed: false,
            estimateModelMemory: false,
          },
        });

        expect(res).toHaveStatusCode(200);
        const jobs = res.body.jobs as Array<{ id: string; success: boolean }>;
        expect(jobs).toHaveLength(3);

        const expectedMMLs = ['10mb', '10mb', '10mb'];
        for (let i = 0; i < jobs.length; i++) {
          expect(jobs[i].success).toBe(true);
          const mml = await apiServices.ml.anomalyDetection.getJobModelMemoryLimit(jobs[i].id);
          expect(mml).toBe(expectedMMLs[i]);
        }
      }
    );

    apiTest(
      'estimates model memory limits by default when estimateModelMemory is omitted',
      async ({ apiClient, samlAuth, apiServices }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.post(`internal/ml/modules/setup/${MODULE_ID}`, {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
          body: {
            prefix: 'mml_undefined_',
            indexPatternName: DATA_VIEW.name,
            startDatafeed: false,
            // estimateModelMemory omitted — default behaviour is to estimate
          },
        });

        expect(res).toHaveStatusCode(200);
        const jobs = res.body.jobs as Array<{ id: string; success: boolean }>;
        expect(jobs).toHaveLength(3);

        // default behaviour matches estimateModelMemory: true
        const expectedMMLs = ['11mb', '11mb', '16mb'];
        for (let i = 0; i < jobs.length; i++) {
          expect(jobs[i].success).toBe(true);
          const mml = await apiServices.ml.anomalyDetection.getJobModelMemoryLimit(jobs[i].id);
          expect(mml).toBe(expectedMMLs[i]);
        }
      }
    );

    apiTest(
      'preserves a larger jobOverrides memory limit over the estimate',
      async ({ apiClient, samlAuth, apiServices }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.post(`internal/ml/modules/setup/${MODULE_ID}`, {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
          body: {
            prefix: 'mml_preserve_',
            indexPatternName: DATA_VIEW.name,
            startDatafeed: false,
            estimateModelMemory: true,
            jobOverrides: [{ analysis_limits: { model_memory_limit: '100mb' } }],
          },
        });

        expect(res).toHaveStatusCode(200);
        const jobs = res.body.jobs as Array<{ id: string; success: boolean }>;

        for (const job of jobs) {
          expect(job.success).toBe(true);
          const mml = await apiServices.ml.anomalyDetection.getJobModelMemoryLimit(job.id);
          expect(mml).toBe('100mb');
        }
      }
    );
  }
);
