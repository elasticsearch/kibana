/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { tags } from '@kbn/scout';
import { v4 as uuidv4 } from 'uuid';
import { streamsApiTest as apiTest } from '../../fixtures';
import { COMMON_API_HEADERS } from '../../fixtures/constants';

const BULK_STATUS_ENDPOINT = 'internal/streams/onboarding/_bulk_status';

apiTest.describe(
  'Onboarding bulk status API',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    apiTest.beforeAll(async ({ apiServices }) => {
      await apiServices.streamsTest.enable();
      await apiServices.streamsTest.enableSignificantEvents();
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await apiServices.streamsTest.disableSignificantEvents();
    });

    apiTest(
      'returns not_started for every requested stream that has never been onboarded',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asStreamsAdmin();

        const suffix = uuidv4().slice(0, 8);
        const streamNames = [`logs.bulk_status_a_${suffix}`, `logs.bulk_status_b_${suffix}`];

        const response = await apiClient.post(BULK_STATUS_ENDPOINT, {
          headers: { ...COMMON_API_HEADERS, ...cookieHeader },
          body: { streamNames },
          responseType: 'json',
        });

        expect(response.statusCode).toBe(200);
        // The response always contains an entry for every requested stream name.
        expect(Object.keys(response.body).sort()).toStrictEqual([...streamNames].sort());
        for (const streamName of streamNames) {
          expect(response.body[streamName]).toStrictEqual({
            status: 'not_started',
            executionId: null,
          });
        }
      }
    );

    apiTest('rejects an empty streamNames array', async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asStreamsAdmin();

      const response = await apiClient.post(BULK_STATUS_ENDPOINT, {
        headers: { ...COMMON_API_HEADERS, ...cookieHeader },
        body: { streamNames: [] },
        responseType: 'json',
      });

      expect(response.statusCode).toBe(400);
    });

    apiTest(
      'returns 403 when significant events is disabled',
      async ({ apiClient, samlAuth, apiServices }) => {
        const { cookieHeader } = await samlAuth.asStreamsAdmin();

        await apiServices.streamsTest.disableSignificantEvents();

        try {
          const response = await apiClient.post(BULK_STATUS_ENDPOINT, {
            headers: { ...COMMON_API_HEADERS, ...cookieHeader },
            body: { streamNames: [`logs.bulk_status_${uuidv4().slice(0, 8)}`] },
            responseType: 'json',
          });

          expect(response.statusCode).toBe(403);
        } finally {
          await apiServices.streamsTest.enableSignificantEvents();
        }
      }
    );
  }
);
