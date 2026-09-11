/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { mlApiTest as apiTest, INTERNAL_API_HEADERS } from '../../fixtures';

const SPACE_ID = 'ml_jobs_exist_space1';
const SOURCE_ARCHIVE = 'x-pack/platform/test/fixtures/es_archives/ml/module_sample_logs';
const MODULE_ID = 'sample_data_weblogs';
const DATA_VIEW = { name: 'ft_module_sample_logs', timeField: '@timestamp' };
const JOB_IDS = ['low_request_rate', 'response_code_rates', 'url_scanning'];

apiTest.describe(
  'GET ml/modules/jobs_exist: space-scoped job discovery',
  { tag: '@local-stateful-classic' },
  () => {
    apiTest.beforeAll(async ({ esArchiver, apiServices }) => {
      await esArchiver.loadIfNeeded(SOURCE_ARCHIVE);
      await apiServices.spaces.create({ id: SPACE_ID, disabledFeatures: [] });
      await apiServices.dataViews.create({
        title: DATA_VIEW.name,
        timeFieldName: DATA_VIEW.timeField,
      });
      await apiServices.dataViews.create({
        title: DATA_VIEW.name,
        timeFieldName: DATA_VIEW.timeField,
        spaceId: SPACE_ID,
      });
    });

    apiTest.afterEach(async ({ apiServices }) => {
      await apiServices.ml.indices.cleanAnomalyDetection();
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await apiServices.dataViews.deleteByTitle(DATA_VIEW.name);
      await apiServices.dataViews.deleteByTitle(DATA_VIEW.name, SPACE_ID);
      await apiServices.spaces.delete(SPACE_ID);
    });

    apiTest('finds jobs installed by module without a prefix', async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();
      const prefix = '';

      // Set up module in default space
      await apiClient.post(`internal/ml/modules/setup/${MODULE_ID}`, {
        headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
        responseType: 'json',
        body: {
          prefix,
          indexPatternName: DATA_VIEW.name,
          startDatafeed: false,
          estimateModelMemory: false,
        },
      });

      const res = await apiClient.get(`internal/ml/modules/jobs_exist/${MODULE_ID}`, {
        headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
        responseType: 'json',
      });

      expect(res).toHaveStatusCode(200);
      const { jobsExist, jobs } = res.body as {
        jobsExist: boolean;
        jobs: Array<{ id: string }>;
      };
      expect(jobsExist).toBe(true);
      const expectedJobIds = JOB_IDS.map((j) => ({ id: `${prefix}${j}` }));
      expect(jobs).toStrictEqual(expectedJobIds);
    });

    apiTest('finds jobs installed by module with a prefix', async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();
      const prefix = 'pf1_';

      await apiClient.post(`internal/ml/modules/setup/${MODULE_ID}`, {
        headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
        responseType: 'json',
        body: {
          prefix,
          indexPatternName: DATA_VIEW.name,
          startDatafeed: false,
          estimateModelMemory: false,
        },
      });

      const res = await apiClient.get(`internal/ml/modules/jobs_exist/${MODULE_ID}`, {
        headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
        responseType: 'json',
      });

      expect(res).toHaveStatusCode(200);
      const { jobsExist, jobs } = res.body as {
        jobsExist: boolean;
        jobs: Array<{ id: string }>;
      };
      expect(jobsExist).toBe(true);
      const expectedJobIds = JOB_IDS.map((j) => ({ id: `${prefix}${j}` }));
      expect(jobs).toStrictEqual(expectedJobIds);
    });

    apiTest(
      'does not find jobs installed into a different space',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();
        const prefix = 'pf1_';

        // Install module into SPACE_ID (not default space)
        await apiClient.post(`s/${SPACE_ID}/internal/ml/modules/setup/${MODULE_ID}`, {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
          body: {
            prefix,
            indexPatternName: DATA_VIEW.name,
            startDatafeed: false,
            estimateModelMemory: false,
          },
        });

        // Query from the default space — should not see jobs installed in SPACE_ID
        const res = await apiClient.get(`internal/ml/modules/jobs_exist/${MODULE_ID}`, {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        });

        expect(res).toHaveStatusCode(200);
        const { jobsExist, jobs } = res.body as {
          jobsExist: boolean;
          jobs: unknown;
        };
        expect(jobsExist).toBe(false);
        expect(jobs).toBeUndefined();
      }
    );

    apiTest(
      'returns jobsExist: false for a module that has not been installed',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.get('internal/ml/modules/jobs_exist/apache_ecs', {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        });

        expect(res).toHaveStatusCode(200);
        const { jobsExist, jobs } = res.body as {
          jobsExist: boolean;
          jobs: unknown;
        };
        expect(jobsExist).toBe(false);
        expect(jobs).toBeUndefined();
      }
    );
  }
);
