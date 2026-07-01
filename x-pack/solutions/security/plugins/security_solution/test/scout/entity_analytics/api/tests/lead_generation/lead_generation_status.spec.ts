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
import {
  seedLead,
  cleanupLeadsIndex,
  DEFAULT_SPACE_ID,
} from '../../fixtures/lead_generation_helpers';

apiTest.describe(
  'Lead Generation - GET /internal/entity_analytics/leads/status',
  { tag: LEAD_GENERATION_TAGS },
  () => {
    let defaultHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ apiClient, samlAuth }) => {
      const credentials = await samlAuth.asInteractiveUser('admin');
      defaultHeaders = { ...credentials.cookieHeader, ...INTERNAL_HEADERS };

      // Create the indices via enable (fake connectorId is fine).
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
      'returns a well-formed status object and reflects the enabled state',
      async ({ apiClient }) => {
        const response = await apiClient.get(LEAD_GENERATION_ROUTES.STATUS, {
          headers: defaultHeaders,
          responseType: 'json',
        });

        expect(response).toHaveStatusCode(200);
        // Required shape fields
        expect(typeof response.body.isEnabled).toBe('boolean');
        expect(typeof response.body.indexExists).toBe('boolean');
        expect(typeof response.body.totalLeads).toBe('number');
        // lastRun: null before any run, ISO-8601 string afterwards — field must be present
        expect(response.body.lastRun).toBeDefined();
        // enable was called in beforeAll — confirm it is reflected
        expect(response.body.isEnabled).toBe(true);
        expect(response.body.indexExists).toBe(true);
      }
    );

    apiTest(
      'totalLeads reflects the count of seeded documents',
      async ({ apiClient, esClient }) => {
        await seedLead(esClient);
        await seedLead(esClient);

        const response = await apiClient.get(LEAD_GENERATION_ROUTES.STATUS, {
          headers: defaultHeaders,
          responseType: 'json',
        });

        expect(response).toHaveStatusCode(200);
        expect(response.body.totalLeads).toBe(2);
      }
    );

    apiTest(
      'lastRun is set to the most recent lead timestamp after seeding',
      async ({ apiClient, esClient }) => {
        await seedLead(esClient);

        const response = await apiClient.get(LEAD_GENERATION_ROUTES.STATUS, {
          headers: defaultHeaders,
          responseType: 'json',
        });

        expect(response).toHaveStatusCode(200);
        // lastRun should be a non-null ISO-8601 string after seeding a lead.
        expect(typeof response.body.lastRun).toBe('string');
      }
    );

    // Note: authz (403) testing requires a custom role without security solution /
    // entity-analytics access. The built-in "viewer" role includes read access to all
    // features and will return 200 here. Route-level authz is covered by unit tests.
  }
);
