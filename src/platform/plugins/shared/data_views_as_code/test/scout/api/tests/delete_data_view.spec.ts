/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { apiTest, tags, type RoleApiCredentials } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { BASE_PATH, COMMON_HEADERS } from '../fixtures/constants';

apiTest.describe('DELETE /api/data_views/{id} - as code', { tag: tags.deploymentAgnostic }, () => {
  let adminApiCredentials: RoleApiCredentials;
  let viewerApiCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth }) => {
    adminApiCredentials = await requestAuth.getApiKeyForAdmin();
    viewerApiCredentials = await requestAuth.getApiKeyForViewer();
  });

  apiTest('can delete an existing data view', async ({ apiClient, apiServices }) => {
    const uniqueTitle = `delete-me-${Date.now()}-${Math.random()}-*`;

    // Create a data view to delete
    const { data: dataView } = await apiServices.dataViews.create({
      title: uniqueTitle,
    });

    // Delete it
    const deleteResponse = await apiClient.delete(`${BASE_PATH}/${dataView.id}`, {
      headers: {
        ...COMMON_HEADERS,
        ...adminApiCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(deleteResponse).toHaveStatusCode(200);

    // Verify it no longer exists
    const getResponse = await apiClient.get(`${BASE_PATH}/${dataView.id}`, {
      headers: {
        ...COMMON_HEADERS,
        ...adminApiCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(getResponse).toHaveStatusCode(404);
  });

  apiTest('returns 404 when deleting a non-existing data view', async ({ apiClient }) => {
    const nonExistingId = `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-${Date.now()}`;

    const response = await apiClient.delete(`${BASE_PATH}/${nonExistingId}`, {
      headers: {
        ...COMMON_HEADERS,
        ...adminApiCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(404);
  });

  apiTest(
    'returns 403 when user does not have indexPatterns:manage privilege',
    async ({ apiClient }) => {
      const nonExistingId = `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-${Date.now()}`;

      const forbiddenDeleteResponse = await apiClient.delete(`${BASE_PATH}/${nonExistingId}`, {
        headers: {
          ...COMMON_HEADERS,
          ...viewerApiCredentials.apiKeyHeader,
        },
        responseType: 'json',
      });

      expect(forbiddenDeleteResponse).toHaveStatusCode(403);
    }
  );
});
