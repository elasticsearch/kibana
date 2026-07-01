/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { apiTest } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
import {
  LEAD_GENERATION_ROUTES,
  INTERNAL_HEADERS,
  LEAD_GENERATION_TAGS,
} from '../../fixtures/lead_generation_constants';
import {
  seedLead,
  cleanupLeadsIndex,
  DEFAULT_SPACE_ID,
} from '../../fixtures/lead_generation_helpers';

apiTest.describe(
  'Lead Generation - POST /internal/entity_analytics/leads/{id}/_dismiss',
  { tag: LEAD_GENERATION_TAGS },
  () => {
    let defaultHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ apiClient, samlAuth }) => {
      const credentials = await samlAuth.asInteractiveUser('admin');
      defaultHeaders = { ...credentials.cookieHeader, ...INTERNAL_HEADERS };

      // Create the indices via enable.
      await apiClient.post(LEAD_GENERATION_ROUTES.ENABLE, {
        headers: defaultHeaders,
        responseType: 'json',
        body: { connectorId: 'test-connector' },
      });
    });

    apiTest.beforeEach(async ({ esClient }) => {
      await cleanupLeadsIndex(esClient, DEFAULT_SPACE_ID);
    });

    apiTest.afterAll(async ({ apiClient, esClient }) => {
      await cleanupLeadsIndex(esClient, DEFAULT_SPACE_ID);
      await apiClient.post(LEAD_GENERATION_ROUTES.DISABLE, {
        headers: defaultHeaders,
        responseType: 'json',
        body: {},
      });
    });

    apiTest(
      'dismisses an active lead and returns { success: true }',
      async ({ apiClient, esClient }) => {
        const { id } = await seedLead(esClient, { status: 'active' });

        const response = await apiClient.post(LEAD_GENERATION_ROUTES.DISMISS(id), {
          headers: defaultHeaders,
          responseType: 'json',
          body: {},
        });

        expect(response).toHaveStatusCode(200);
        expect(response.body).toStrictEqual({ success: true });
      }
    );

    apiTest(
      'dismissed lead appears in GET /leads?status=dismissed',
      async ({ apiClient, esClient }) => {
        const { id } = await seedLead(esClient, { status: 'active' });

        await apiClient.post(LEAD_GENERATION_ROUTES.DISMISS(id), {
          headers: defaultHeaders,
          responseType: 'json',
          body: {},
        });

        const listResponse = await apiClient.get(
          `${LEAD_GENERATION_ROUTES.GET_LEADS}?status=dismissed`,
          { headers: defaultHeaders, responseType: 'json' }
        );

        expect(listResponse).toHaveStatusCode(200);
        const ids: string[] = listResponse.body.leads.map((l: { id: string }) => l.id);
        expect(ids).toContain(id);
      }
    );

    apiTest(
      'dismissed lead is absent from GET /leads?status=active',
      async ({ apiClient, esClient }) => {
        const { id } = await seedLead(esClient, { status: 'active' });

        await apiClient.post(LEAD_GENERATION_ROUTES.DISMISS(id), {
          headers: defaultHeaders,
          responseType: 'json',
          body: {},
        });

        const listResponse = await apiClient.get(
          `${LEAD_GENERATION_ROUTES.GET_LEADS}?status=active`,
          { headers: defaultHeaders, responseType: 'json' }
        );

        expect(listResponse).toHaveStatusCode(200);
        const ids: string[] = listResponse.body.leads.map((l: { id: string }) => l.id);
        expect(ids).not.toContain(id);
      }
    );

    apiTest('returns 404 when the lead ID does not exist', async ({ apiClient }) => {
      const nonExistentId = uuidv4();

      const response = await apiClient.post(LEAD_GENERATION_ROUTES.DISMISS(nonExistentId), {
        headers: defaultHeaders,
        responseType: 'json',
        body: {},
      });

      expect(response).toHaveStatusCode(404);
    });

    apiTest(
      'dismissing an already-dismissed lead is idempotent (returns 200)',
      async ({ apiClient, esClient }) => {
        // updateByQuery increments the document version even when the Painless script
        // assigns the same value that already exists, so `updated >= 1` and the route
        // returns 200 { success: true } — idempotent dismiss is safe to call twice.
        const { id } = await seedLead(esClient, { status: 'dismissed' });

        const response = await apiClient.post(LEAD_GENERATION_ROUTES.DISMISS(id), {
          headers: defaultHeaders,
          responseType: 'json',
          body: {},
        });

        expect(response).toHaveStatusCode(200);
        expect(response.body).toStrictEqual({ success: true });
      }
    );

    // Note: authz (403) testing for these routes requires a custom role that explicitly
    // excludes the security solution / entity-analytics feature. The built-in Kibana
    // "viewer" role includes read access to all features, so it passes the privilege
    // check and is not suitable here. Route-level authz is covered by unit tests.
  }
);
