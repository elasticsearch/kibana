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
  'Lead Generation - GET /internal/entity_analytics/leads',
  { tag: LEAD_GENERATION_TAGS },
  () => {
    let defaultHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ apiClient, samlAuth }) => {
      const credentials = await samlAuth.asInteractiveUser('admin');
      defaultHeaders = { ...credentials.cookieHeader, ...INTERNAL_HEADERS };

      // Enable lead generation to create the indices (fake connectorId is fine —
      // the route only saves it to a saved object and schedules the 24h TM task;
      // no inference call is made here).
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
      // Remove the scheduled TM task created by enable.
      await apiClient.post(LEAD_GENERATION_ROUTES.DISABLE, {
        headers: defaultHeaders,
        responseType: 'json',
        body: {},
      });
    });

    apiTest('returns empty result set when no leads exist', async ({ apiClient }) => {
      const response = await apiClient.get(LEAD_GENERATION_ROUTES.GET_LEADS, {
        headers: defaultHeaders,
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({
        leads: [],
        total: 0,
        page: 1,
        perPage: 20,
      });
    });

    apiTest('returns leads with default pagination shape', async ({ apiClient, esClient }) => {
      await seedLead(esClient);
      await seedLead(esClient);

      const response = await apiClient.get(LEAD_GENERATION_ROUTES.GET_LEADS, {
        headers: defaultHeaders,
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.total).toBe(2);
      expect(response.body.leads).toHaveLength(2);
      expect(response.body.page).toBe(1);
      expect(response.body.perPage).toBe(20);
    });

    apiTest(
      'filters leads by status=active and excludes dismissed leads',
      async ({ apiClient, esClient }) => {
        await seedLead(esClient, { status: 'active' });
        await seedLead(esClient, { status: 'active' });
        await seedLead(esClient, { status: 'dismissed' });

        const response = await apiClient.get(`${LEAD_GENERATION_ROUTES.GET_LEADS}?status=active`, {
          headers: defaultHeaders,
          responseType: 'json',
        });

        expect(response).toHaveStatusCode(200);
        expect(response.body.total).toBe(2);
        expect(response.body.leads).toHaveLength(2);
        response.body.leads.forEach((lead: { status: string }) => {
          expect(lead.status).toBe('active');
        });
      }
    );

    apiTest(
      'filters leads by status=dismissed and excludes active leads',
      async ({ apiClient, esClient }) => {
        await seedLead(esClient, { status: 'active' });
        await seedLead(esClient, { status: 'dismissed' });

        const response = await apiClient.get(
          `${LEAD_GENERATION_ROUTES.GET_LEADS}?status=dismissed`,
          { headers: defaultHeaders, responseType: 'json' }
        );

        expect(response).toHaveStatusCode(200);
        expect(response.body.total).toBe(1);
        expect(response.body.leads[0].status).toBe('dismissed');
      }
    );

    apiTest('respects perPage pagination parameter', async ({ apiClient, esClient }) => {
      await seedLead(esClient);
      await seedLead(esClient);
      await seedLead(esClient);

      const response = await apiClient.get(`${LEAD_GENERATION_ROUTES.GET_LEADS}?perPage=1`, {
        headers: defaultHeaders,
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.leads).toHaveLength(1);
      expect(response.body.total).toBe(3);
      expect(response.body.perPage).toBe(1);
    });

    apiTest('returns the correct page using page parameter', async ({ apiClient, esClient }) => {
      // Seed 3 leads with distinct priorities so sort order is deterministic.
      await seedLead(esClient, { priority: 9 });
      await seedLead(esClient, { priority: 5 });
      await seedLead(esClient, { priority: 1 });

      const page1 = await apiClient.get(
        `${LEAD_GENERATION_ROUTES.GET_LEADS}?perPage=1&page=1&sortField=priority&sortOrder=desc`,
        { headers: defaultHeaders, responseType: 'json' }
      );
      const page2 = await apiClient.get(
        `${LEAD_GENERATION_ROUTES.GET_LEADS}?perPage=1&page=2&sortField=priority&sortOrder=desc`,
        { headers: defaultHeaders, responseType: 'json' }
      );

      expect(page1).toHaveStatusCode(200);
      expect(page2).toHaveStatusCode(200);
      expect(page1.body.leads[0].priority).toBe(9);
      expect(page2.body.leads[0].priority).toBe(5);
    });

    apiTest(
      'sorts by priority descending (default) — highest priority first',
      async ({ apiClient, esClient }) => {
        await seedLead(esClient, { priority: 2 });
        await seedLead(esClient, { priority: 8 });
        await seedLead(esClient, { priority: 5 });

        const response = await apiClient.get(
          `${LEAD_GENERATION_ROUTES.GET_LEADS}?sortField=priority&sortOrder=desc`,
          { headers: defaultHeaders, responseType: 'json' }
        );

        expect(response).toHaveStatusCode(200);
        const priorities: number[] = response.body.leads.map(
          (l: { priority: number }) => l.priority
        );
        expect(priorities).toStrictEqual([...priorities].sort((a, b) => b - a));
      }
    );

    apiTest(
      'sorts by priority ascending — lowest priority first',
      async ({ apiClient, esClient }) => {
        await seedLead(esClient, { priority: 8 });
        await seedLead(esClient, { priority: 2 });
        await seedLead(esClient, { priority: 5 });

        const response = await apiClient.get(
          `${LEAD_GENERATION_ROUTES.GET_LEADS}?sortField=priority&sortOrder=asc`,
          { headers: defaultHeaders, responseType: 'json' }
        );

        expect(response).toHaveStatusCode(200);
        const priorities: number[] = response.body.leads.map(
          (l: { priority: number }) => l.priority
        );
        expect(priorities).toStrictEqual([...priorities].sort((a, b) => a - b));
      }
    );

    apiTest('sorts by timestamp', async ({ apiClient, esClient }) => {
      const older = new Date(Date.now() - 10_000).toISOString();
      const newer = new Date().toISOString();

      await seedLead(esClient, { timestamp: older });
      await seedLead(esClient, { timestamp: newer });

      const response = await apiClient.get(
        `${LEAD_GENERATION_ROUTES.GET_LEADS}?sortField=timestamp&sortOrder=desc`,
        { headers: defaultHeaders, responseType: 'json' }
      );

      expect(response).toHaveStatusCode(200);
      const timestamps: string[] = response.body.leads.map(
        (l: { timestamp: string }) => l.timestamp
      );
      expect(new Date(timestamps[0]).getTime()).toBeGreaterThanOrEqual(
        new Date(timestamps[1]).getTime()
      );
    });

    apiTest('returns 400 for an invalid sortField value', async ({ apiClient }) => {
      const response = await apiClient.get(
        `${LEAD_GENERATION_ROUTES.GET_LEADS}?sortField=not_a_valid_field`,
        { headers: defaultHeaders, responseType: 'json' }
      );

      expect(response).toHaveStatusCode(400);
    });

    // Note: authz (403) testing requires a custom role without security solution /
    // entity-analytics access. The built-in "viewer" role includes read access to all
    // features and will return 200 here. Route-level authz is covered by unit tests.
  }
);
