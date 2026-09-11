/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { sortBy } from 'lodash';
import { expect } from '@kbn/scout/api';
import { mlApiTest as apiTest, INTERNAL_API_HEADERS } from '../../fixtures';

const SOURCE_ARCHIVE = 'x-pack/platform/test/fixtures/es_archives/ml/module_sample_logs';
const MODULE_ID = 'sample_data_weblogs';
const DATA_VIEW = { name: 'ft_module_sample_logs', timeField: '@timestamp' };

apiTest.describe(
  'setup_module: sample_data_weblogs with startDatafeed false',
  { tag: '@local-stateful-classic' },
  () => {
    apiTest.beforeAll(async ({ esArchiver, apiServices }) => {
      await esArchiver.loadIfNeeded(SOURCE_ARCHIVE);
      await apiServices.dataViews.create({
        title: DATA_VIEW.name,
        timeFieldName: DATA_VIEW.timeField,
      });
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await apiServices.ml.indices.cleanAnomalyDetection();
      await apiServices.dataViews.deleteByTitle(DATA_VIEW.name);
    });

    apiTest(
      'creates jobs and stopped datafeeds without starting them',
      async ({ apiClient, samlAuth, apiServices }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();
        const prefix = 'pf1_';
        const expectedJobIds = [
          'pf1_low_request_rate',
          'pf1_response_code_rates',
          'pf1_url_scanning',
        ];

        const res = await apiClient.post(`internal/ml/modules/setup/${MODULE_ID}`, {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
          body: {
            prefix,
            indexPatternName: DATA_VIEW.name,
            startDatafeed: false,
            estimateModelMemory: false,
          },
        });

        expect(res).toHaveStatusCode(200);

        await apiTest.step('verify jobs in response', async () => {
          const expectedRspJobs = sortBy(
            expectedJobIds.map((id) => ({ id, success: true })),
            'id'
          );
          const actualRspJobs = sortBy(
            res.body.jobs as Array<{ id: string; success: boolean }>,
            'id'
          );
          expect(actualRspJobs).toStrictEqual(expectedRspJobs);
        });

        await apiTest.step('verify datafeeds in response (not started)', async () => {
          const expectedRspDatafeeds = sortBy(
            expectedJobIds.map((jobId) => ({
              awaitingMlNodeAllocation: false,
              id: `datafeed-${jobId}`,
              success: true,
              started: false,
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

        await apiTest.step('verify no kibana saved objects were created', async () => {
          expect(res.body.kibana == null || Object.keys(res.body.kibana).length === 0).toBe(true);
        });

        await apiTest.step('verify job and datafeed states', async () => {
          for (const jobId of expectedJobIds) {
            await apiServices.ml.anomalyDetection.waitForJobState(jobId, 'closed', 30 * 1000);
            await apiServices.ml.anomalyDetection.waitForDatafeedState(
              `datafeed-${jobId}`,
              'stopped',
              30 * 1000
            );
          }
        });

        await apiTest.step('verify model memory limit is <= 99mb', async () => {
          for (const jobId of expectedJobIds) {
            const mml = await apiServices.ml.anomalyDetection.getJobModelMemoryLimit(jobId);
            expect(mml).toMatch(/^\d{1,2}mb$/);
          }
        });
      }
    );
  }
);
