/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RoleApiCredentials } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest, DASHBOARD_API_PATH, DASHBOARD_HEADERS, INTERNAL_HEADERS } from '../fixtures';

apiTest.describe('content management - updated_by', { tag: tags.deploymentAgnostic }, () => {
  // Admin API key: authenticated without a SAML profile — used for the "non-interactive user" scenarios.
  let adminCredentials: RoleApiCredentials;

  // Two distinct interactive (SAML) users with different profile_uids.
  let user1CookieHeader: Record<string, string>;
  let user1ProfileUid: string;
  let user2CookieHeader: Record<string, string>;
  let user2ProfileUid: string;

  // Dashboard created by user1 in beforeEach; consumed by each test in the interactive section.
  let dashboardId: string;
  let dashboardMeta: {
    created_by?: string;
    updated_by?: string;
    created_at: string;
    updated_at: string;
  };

  // Tracks every dashboard ID created during the suite so afterEach can delete only those,
  // avoiding cleanStandardList() which would wipe dashboards belonging to concurrent specs.
  const createdDashboardIds = new Set<string>();

  apiTest.beforeAll(async ({ apiClient, requestAuth, samlAuth, config }) => {
    adminCredentials = await requestAuth.getApiKeyForAdmin();
    const privilegedRoleName =
      config.serverless && config.projectType === 'es' ? 'developer' : 'editor';

    // User 1: pre-defined SAML editor
    ({ cookieHeader: user1CookieHeader } = await samlAuth.asInteractiveUser(privilegedRoleName));
    const me1 = await apiClient.get('internal/security/me', {
      headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
    });
    expect(me1).toHaveStatusCode(200);
    user1ProfileUid = me1.body.profile_uid;

    // User 2: admin SAML user — a different identity and therefore a different profile_uid.
    ({ cookieHeader: user2CookieHeader } = await samlAuth.asInteractiveUser('admin'));
    const me2 = await apiClient.get('internal/security/me', {
      headers: { ...INTERNAL_HEADERS, ...user2CookieHeader },
    });
    expect(me2).toHaveStatusCode(200);
    user2ProfileUid = me2.body.profile_uid;
  });

  // Create a fresh dashboard as user1 before each test so each test starts from a known state.
  // dashboardId and dashboardMeta are read back via GET in each test to verify persisted values.
  apiTest.beforeEach(async ({ apiClient }) => {
    const response = await apiClient.post(DASHBOARD_API_PATH, {
      headers: { ...DASHBOARD_HEADERS, ...user1CookieHeader },
      body: { title: 'Sample dashboard' },
    });
    expect(response).toHaveStatusCode(201);
    dashboardId = response.body.id;
    dashboardMeta = response.body.meta;
    createdDashboardIds.add(dashboardId);
  });

  apiTest.afterEach(async ({ apiClient }) => {
    for (const id of createdDashboardIds) {
      await apiClient.delete(`${DASHBOARD_API_PATH}/${id}`, {
        headers: { ...DASHBOARD_HEADERS, ...adminCredentials.apiKeyHeader },
      });
    }
    createdDashboardIds.clear();
  });

  // Non-interactive user (API key): creates and updates a dashboard — neither field should be set.
  apiTest('updated_by is absent for non-interactive user', async ({ apiClient }) => {
    const createResponse = await apiClient.post(DASHBOARD_API_PATH, {
      headers: { ...DASHBOARD_HEADERS, ...adminCredentials.apiKeyHeader },
      body: { title: 'Sample dashboard' },
    });
    expect(createResponse).toHaveStatusCode(201);
    createdDashboardIds.add(createResponse.body.id);
    expect(createResponse.body.meta.updated_by).toBeUndefined();

    const updateResponse = await apiClient.put(`${DASHBOARD_API_PATH}/${createResponse.body.id}`, {
      headers: { ...DASHBOARD_HEADERS, ...adminCredentials.apiKeyHeader },
      body: { title: 'updated title' },
    });
    expect(updateResponse).toHaveStatusCode(200);
    expect(updateResponse.body.meta.updated_by).toBeUndefined();
  });

  apiTest('updated_by is set to profile_uid of the creating user', async ({ apiClient }) => {
    const getResponse = await apiClient.get(`${DASHBOARD_API_PATH}/${dashboardId}`, {
      headers: { ...DASHBOARD_HEADERS, ...user1CookieHeader },
    });
    expect(getResponse).toHaveStatusCode(200);
    expect(getResponse.body.meta.updated_by).toBeDefined();
    expect(getResponse.body.meta.updated_by).toBe(user1ProfileUid);
  });

  apiTest(
    'updated_by is cleared when a non-interactive user updates the dashboard',
    async ({ apiClient }) => {
      const updateResponse = await apiClient.put(`${DASHBOARD_API_PATH}/${dashboardId}`, {
        headers: { ...DASHBOARD_HEADERS, ...adminCredentials.apiKeyHeader },
        body: { title: 'updated title' },
      });
      expect(updateResponse).toHaveStatusCode(200);

      const getResponse = await apiClient.get(`${DASHBOARD_API_PATH}/${dashboardId}`, {
        headers: { ...DASHBOARD_HEADERS, ...adminCredentials.apiKeyHeader },
      });
      expect(getResponse).toHaveStatusCode(200);

      const getMeta = getResponse.body.meta;
      expect(getMeta.updated_by).toBeUndefined();
      // created_by and created_at are preserved; updated_at advances
      expect(getMeta.created_by).toBe(dashboardMeta.created_by);
      expect(getMeta.created_at).toBe(dashboardMeta.created_at);
      expect(new Date(getMeta.updated_at).getTime()).toBeGreaterThan(
        new Date(dashboardMeta.updated_at).getTime()
      );
    }
  );

  apiTest(
    'updated_by reflects the profile_uid of a different user who updated the dashboard',
    async ({ apiClient }) => {
      const updateResponse = await apiClient.put(`${DASHBOARD_API_PATH}/${dashboardId}`, {
        headers: { ...DASHBOARD_HEADERS, ...user2CookieHeader },
        body: { title: 'updated title' },
      });
      expect(updateResponse).toHaveStatusCode(200);

      const getResponse = await apiClient.get(`${DASHBOARD_API_PATH}/${dashboardId}`, {
        headers: { ...DASHBOARD_HEADERS, ...adminCredentials.apiKeyHeader },
      });
      expect(getResponse).toHaveStatusCode(200);

      const getMeta = getResponse.body.meta;
      expect(getMeta.updated_by).toBe(user2ProfileUid);
      expect(getMeta.updated_by).not.toBe(dashboardMeta.updated_by);
      // created_by is preserved as user1
      expect(getMeta.created_by).toBe(user1ProfileUid);
      expect(getMeta.created_at).toBe(dashboardMeta.created_at);
      expect(new Date(getMeta.updated_at).getTime()).toBeGreaterThan(
        new Date(dashboardMeta.updated_at).getTime()
      );
    }
  );
});
