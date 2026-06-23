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

apiTest.describe('content management - created_by', { tag: tags.deploymentAgnostic }, () => {
  // Admin API key: authenticated user without a SAML session → no user profile → no created_by.
  let adminCredentials: RoleApiCredentials;

  // Tracks every dashboard ID created during the suite so afterEach can delete only those,
  // avoiding cleanStandardList() which would wipe dashboards belonging to concurrent specs.
  const createdDashboardIds = new Set<string>();

  apiTest.beforeAll(async ({ requestAuth }) => {
    adminCredentials = await requestAuth.getApiKeyForAdmin();
  });

  apiTest.afterEach(async ({ apiClient }) => {
    for (const id of createdDashboardIds) {
      await apiClient.delete(`${DASHBOARD_API_PATH}/${id}`, {
        headers: { ...DASHBOARD_HEADERS, ...adminCredentials.apiKeyHeader },
      });
    }
    createdDashboardIds.clear();
  });

  apiTest('created_by is absent for non-interactive user', async ({ apiClient }) => {
    // API key auth = authenticated, but no SAML user profile → created_by must not be set.
    const response = await apiClient.post(DASHBOARD_API_PATH, {
      headers: { ...DASHBOARD_HEADERS, ...adminCredentials.apiKeyHeader },
      body: { title: 'Sample dashboard' },
    });

    expect(response).toHaveStatusCode(201);
    createdDashboardIds.add(response.body.id);
    expect(response.body.data).toBeDefined();
    expect(response.body.meta.created_by).toBeUndefined();
  });

  apiTest(
    'created_by is set to profile_uid for interactive user',
    async ({ apiClient, samlAuth, config }) => {
      const privilegedRoleName =
        config.serverless && config.projectType === 'es' ? 'developer' : 'editor';
      const { cookieHeader } = await samlAuth.asInteractiveUser(privilegedRoleName);

      // Resolve the profile_uid for this SAML session before making the write request.
      const meResponse = await apiClient.get('internal/security/me', {
        headers: { ...INTERNAL_HEADERS, ...cookieHeader },
      });
      expect(meResponse).toHaveStatusCode(200);
      const profileUid: string = meResponse.body.profile_uid;

      const response = await apiClient.post(DASHBOARD_API_PATH, {
        headers: { ...DASHBOARD_HEADERS, ...cookieHeader },
        body: { title: 'Sample dashboard' },
      });

      expect(response).toHaveStatusCode(201);
      createdDashboardIds.add(response.body.id);
      expect(response.body.data).toBeDefined();
      expect(response.body.meta.created_by).toBe(profileUid);
    }
  );
});
