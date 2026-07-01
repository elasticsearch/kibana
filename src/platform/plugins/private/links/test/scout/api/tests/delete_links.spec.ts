/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RoleApiCredentials } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { tags } from '@kbn/scout';
import { apiTest, COMMON_HEADERS, LINKS_API_PATH, MINIMAL_LINKS_BODY } from '../fixtures';

apiTest.describe('links - delete', { tag: tags.deploymentAgnostic }, () => {
  let editorCredentials: RoleApiCredentials;
  let viewerCredentials: RoleApiCredentials;
  let createdId: string;

  apiTest.beforeAll(async ({ requestAuth }) => {
    editorCredentials = await requestAuth.getApiKeyForPrivilegedUser();
    viewerCredentials = await requestAuth.getApiKey('viewer');
  });

  apiTest.beforeEach(async ({ apiClient }) => {
    const response = await apiClient.post(LINKS_API_PATH, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: MINIMAL_LINKS_BODY,
      responseType: 'json',
    });
    createdId = response.body.id;
  });

  apiTest.afterEach(async ({ kbnClient }) => {
    await kbnClient.savedObjects.cleanStandardList();
  });

  apiTest('should return 204 when the links item is deleted', async ({ apiClient }) => {
    const response = await apiClient.delete(`${LINKS_API_PATH}/${createdId}`, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(204);
    expect(response.body).toStrictEqual({});
  });

  apiTest('should return 404 for a non-existing links item', async ({ apiClient }) => {
    const response = await apiClient.delete(`${LINKS_API_PATH}/non-existent-links-item`, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response.body).toStrictEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'A links library item with ID [non-existent-links-item] was not found.',
    });
  });

  apiTest(
    'authorization - returns 403 if the user does not have permission to delete',
    async ({ apiClient }) => {
      const response = await apiClient.delete(`${LINKS_API_PATH}/${createdId}`, {
        headers: {
          ...COMMON_HEADERS,
          ...viewerCredentials.apiKeyHeader,
        },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(403);
      expect(response.body.message).toBe('Unable to delete links');
    }
  );
});
