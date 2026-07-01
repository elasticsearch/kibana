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
  'Lead Generation - POST /internal/entity_analytics/leads/bulk_update',
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
      'bulk-dismisses multiple leads and returns { updated: N }',
      async ({ apiClient, esClient }) => {
        const { id: id1 } = await seedLead(esClient, { status: 'active' });
        const { id: id2 } = await seedLead(esClient, { status: 'active' });
        await seedLead(esClient, { status: 'active' }); // third lead — NOT in the update set

        const response = await apiClient.post(LEAD_GENERATION_ROUTES.BULK_UPDATE, {
          headers: defaultHeaders,
          responseType: 'json',
          body: { ids: [id1, id2], status: 'dismissed' },
        });

        expect(response).toHaveStatusCode(200);
        expect(response.body).toStrictEqual({ updated: 2 });
      }
    );

    apiTest(
      'bulk-updated leads appear with the new status in GET /leads',
      async ({ apiClient, esClient }) => {
        const { id: id1 } = await seedLead(esClient, { status: 'active' });
        const { id: id2 } = await seedLead(esClient, { status: 'active' });

        await apiClient.post(LEAD_GENERATION_ROUTES.BULK_UPDATE, {
          headers: defaultHeaders,
          responseType: 'json',
          body: { ids: [id1, id2], status: 'dismissed' },
        });

        const listResponse = await apiClient.get(
          `${LEAD_GENERATION_ROUTES.GET_LEADS}?status=dismissed`,
          { headers: defaultHeaders, responseType: 'json' }
        );

        expect(listResponse).toHaveStatusCode(200);
        const returnedIds: string[] = listResponse.body.leads.map((l: { id: string }) => l.id);
        expect(returnedIds).toContain(id1);
        expect(returnedIds).toContain(id2);
      }
    );

    apiTest(
      'leads not in the ids list keep their original status',
      async ({ apiClient, esClient }) => {
        const { id: toUpdate } = await seedLead(esClient, { status: 'active' });
        const { id: untouched } = await seedLead(esClient, { status: 'active' });

        await apiClient.post(LEAD_GENERATION_ROUTES.BULK_UPDATE, {
          headers: defaultHeaders,
          responseType: 'json',
          body: { ids: [toUpdate], status: 'dismissed' },
        });

        const activeResponse = await apiClient.get(
          `${LEAD_GENERATION_ROUTES.GET_LEADS}?status=active`,
          { headers: defaultHeaders, responseType: 'json' }
        );

        expect(activeResponse).toHaveStatusCode(200);
        const activeIds: string[] = activeResponse.body.leads.map((l: { id: string }) => l.id);
        expect(activeIds).toContain(untouched);
        expect(activeIds).not.toContain(toUpdate);
      }
    );

    apiTest('returns { updated: 0 } when all supplied IDs are unknown', async ({ apiClient }) => {
      const response = await apiClient.post(LEAD_GENERATION_ROUTES.BULK_UPDATE, {
        headers: defaultHeaders,
        responseType: 'json',
        body: { ids: [uuidv4(), uuidv4()], status: 'dismissed' },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ updated: 0 });
    });

    apiTest('returns 400 when ids array is empty (Zod min(1))', async ({ apiClient }) => {
      const response = await apiClient.post(LEAD_GENERATION_ROUTES.BULK_UPDATE, {
        headers: defaultHeaders,
        responseType: 'json',
        body: { ids: [], status: 'dismissed' },
      });

      expect(response).toHaveStatusCode(400);
    });

    apiTest(
      'returns 400 when ids array exceeds 100 entries (Zod max(100))',
      async ({ apiClient }) => {
        const ids = Array.from({ length: 101 }, () => uuidv4());

        const response = await apiClient.post(LEAD_GENERATION_ROUTES.BULK_UPDATE, {
          headers: defaultHeaders,
          responseType: 'json',
          body: { ids, status: 'dismissed' },
        });

        expect(response).toHaveStatusCode(400);
      }
    );

    apiTest('returns 400 when status is an invalid value', async ({ apiClient, esClient }) => {
      const { id } = await seedLead(esClient);

      const response = await apiClient.post(LEAD_GENERATION_ROUTES.BULK_UPDATE, {
        headers: defaultHeaders,
        responseType: 'json',
        body: { ids: [id], status: 'not_a_valid_status' },
      });

      expect(response).toHaveStatusCode(400);
    });

    apiTest('returns 400 when the request body is missing', async ({ apiClient }) => {
      const response = await apiClient.post(LEAD_GENERATION_ROUTES.BULK_UPDATE, {
        headers: defaultHeaders,
        responseType: 'json',
        body: {},
      });

      expect(response).toHaveStatusCode(400);
    });

    // Note: authz (403) testing requires a custom role without security solution /
    // entity-analytics access. The built-in "viewer" role includes read access to all
    // features and will return 200 here. Route-level authz is covered by unit tests.
  }
);
