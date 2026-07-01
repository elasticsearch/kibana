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

apiTest.describe('links - read', { tag: tags.deploymentAgnostic }, () => {
  let viewerCredentials: RoleApiCredentials;
  let editorCredentials: RoleApiCredentials;
  let createdId: string;

  apiTest.beforeAll(async ({ requestAuth, apiClient }) => {
    viewerCredentials = await requestAuth.getApiKey('viewer');
    editorCredentials = await requestAuth.getApiKeyForPrivilegedUser();

    const response = await apiClient.post(LINKS_API_PATH, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: {
        ...MINIMAL_LINKS_BODY,
        title: 'Links Item for Read Tests',
      },
      responseType: 'json',
    });
    createdId = response.body.id;
  });

  apiTest.afterAll(async ({ kbnClient }) => {
    await kbnClient.savedObjects.cleanStandardList();
  });

  apiTest('should return 200 with an existing links item', async ({ apiClient }) => {
    const response = await apiClient.get(`${LINKS_API_PATH}/${createdId}`, {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.id).toBe(createdId);
    expect(response.body.data.title).toBe('Links Item for Read Tests');
    expect(response.body.data.links).toHaveLength(1);
    expect(response.body.meta.created_at).toBeDefined();
    expect(response.body.meta.updated_at).toBeDefined();
  });

  apiTest('should return 404 for a non-existing links item', async ({ apiClient }) => {
    const response = await apiClient.get(`${LINKS_API_PATH}/does-not-exist`, {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(404);
    expect(response.body.message).toBe(
      'A links library item with ID does-not-exist was not found.'
    );
  });
});
