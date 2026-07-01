/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
import {
  LEAD_GENERATION_ROUTES,
  INTERNAL_HEADERS,
  LEAD_GENERATION_TAGS,
} from '../../fixtures/lead_generation_constants';
import { cleanupLeadsIndex, DEFAULT_SPACE_ID } from '../../fixtures/lead_generation_helpers';

/**
 * Tests for POST /enable and POST /disable.
 *
 * Enable creates the leads index template (via `leadIndexService.createIndices()`) and
 * registers a 24h Task Manager task.  Disable removes the TM task.
 *
 * No real inference connector is required — `connectorId` is only persisted to a saved
 * object at enable time; the LLM is only called inside the background generation pipeline.
 */
apiTest.describe(
  'Lead Generation - enable / disable scheduling',
  { tag: LEAD_GENERATION_TAGS },
  () => {
    let defaultHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ samlAuth }) => {
      const credentials = await samlAuth.asInteractiveUser('admin');
      defaultHeaders = { ...credentials.cookieHeader, ...INTERNAL_HEADERS };
    });

    apiTest.afterAll(async ({ apiClient, esClient }) => {
      // Best-effort cleanup: disable may already be off if the disable test ran.
      // Only suppress the expected "task not found" / already-disabled response;
      // unexpected errors (network, ES corruption) are rethrown so CI is notified.
      const disableResponse = await apiClient.post(LEAD_GENERATION_ROUTES.DISABLE, {
        headers: defaultHeaders,
        responseType: 'json',
        body: {},
      });
      if (disableResponse.statusCode !== 200 && disableResponse.statusCode !== 404) {
        throw new Error(
          `Unexpected status from /disable during cleanup: ${disableResponse.statusCode}`
        );
      }
      await cleanupLeadsIndex(esClient, DEFAULT_SPACE_ID);
    });

    apiTest('POST /enable transitions feature to enabled state', async ({ apiClient }) => {
      await apiTest.step('enable returns success', async () => {
        const response = await apiClient.post(LEAD_GENERATION_ROUTES.ENABLE, {
          headers: defaultHeaders,
          responseType: 'json',
          body: { connectorId: 'test-connector' },
        });
        expect(response).toHaveStatusCode(200);
        expect(response.body).toStrictEqual({ success: true });
      });

      await apiTest.step('status reflects isEnabled=true and indexExists=true', async () => {
        const response = await apiClient.get(LEAD_GENERATION_ROUTES.STATUS, {
          headers: defaultHeaders,
          responseType: 'json',
        });
        expect(response).toHaveStatusCode(200);
        expect(response.body.isEnabled).toBe(true);
        expect(response.body.indexExists).toBe(true);
      });
    });

    apiTest('POST /disable transitions feature to disabled state', async ({ apiClient }) => {
      await apiTest.step('enable first so disable has something to act on', async () => {
        const response = await apiClient.post(LEAD_GENERATION_ROUTES.ENABLE, {
          headers: defaultHeaders,
          responseType: 'json',
          body: { connectorId: 'test-connector' },
        });
        expect(response).toHaveStatusCode(200);
      });

      await apiTest.step('disable returns success', async () => {
        const response = await apiClient.post(LEAD_GENERATION_ROUTES.DISABLE, {
          headers: defaultHeaders,
          responseType: 'json',
          body: {},
        });
        expect(response).toHaveStatusCode(200);
        expect(response.body).toStrictEqual({ success: true });
      });

      await apiTest.step('status reflects isEnabled=false', async () => {
        const response = await apiClient.get(LEAD_GENERATION_ROUTES.STATUS, {
          headers: defaultHeaders,
          responseType: 'json',
        });
        expect(response).toHaveStatusCode(200);
        expect(response.body.isEnabled).toBe(false);
      });
    });

    apiTest('POST /enable returns 400 when connectorId is missing', async ({ apiClient }) => {
      const response = await apiClient.post(LEAD_GENERATION_ROUTES.ENABLE, {
        headers: defaultHeaders,
        responseType: 'json',
        body: {},
      });

      expect(response).toHaveStatusCode(400);
    });

    apiTest(
      'POST /enable returns 400 when connectorId is an empty string',
      async ({ apiClient }) => {
        const response = await apiClient.post(LEAD_GENERATION_ROUTES.ENABLE, {
          headers: defaultHeaders,
          responseType: 'json',
          body: { connectorId: '' },
        });

        expect(response).toHaveStatusCode(400);
      }
    );

    // Note: authz (403) testing for /enable and /disable requires a custom role without
    // security solution / entity-analytics write access. The built-in "viewer" role
    // includes read access to all features but, in this test environment, also passes
    // the write-level privilege check for these routes. Route-level authz is covered
    // by unit tests.
  }
);
