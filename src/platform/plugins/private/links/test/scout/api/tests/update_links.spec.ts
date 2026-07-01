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

apiTest.describe('links - update', { tag: tags.deploymentAgnostic }, () => {
  let editorCredentials: RoleApiCredentials;
  let viewerCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth }) => {
    editorCredentials = await requestAuth.getApiKeyForPrivilegedUser();
    viewerCredentials = await requestAuth.getApiKeyForViewer();
  });

  apiTest.afterAll(async ({ kbnClient }) => {
    await kbnClient.savedObjects.cleanStandardList();
  });

  apiTest('should create a new links item when the ID does not exist', async ({ apiClient }) => {
    const id = 'new-links-item-id';
    const title = 'Newly Created Links Item';

    const response = await apiClient.put(`${LINKS_API_PATH}/${id}`, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: {
        ...MINIMAL_LINKS_BODY,
        title,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(201);
    expect(response.body.id).toBe(id);
    expect(response.body.data.title).toBe(title);
  });

  apiTest('should update an existing links item', async ({ apiClient }) => {
    const id = 'links-item-to-update';

    await apiClient.put(`${LINKS_API_PATH}/${id}`, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: { ...MINIMAL_LINKS_BODY, title: 'Original Title' },
      responseType: 'json',
    });

    const updated = await apiClient.put(`${LINKS_API_PATH}/${id}`, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: { ...MINIMAL_LINKS_BODY, title: 'Updated Title' },
      responseType: 'json',
    });

    expect(updated).toHaveStatusCode(200);
    expect(updated.body.id).toBe(id);
    expect(updated.body.data.title).toBe('Updated Title');
  });

  apiTest(
    'should update an existing links item with an invalid "as code" ID',
    async ({ apiClient }) => {
      const created = await apiClient.post(LINKS_API_PATH, {
        headers: {
          ...COMMON_HEADERS,
          ...editorCredentials.apiKeyHeader,
        },
        body: { ...MINIMAL_LINKS_BODY, title: 'Pre-existing item' },
        responseType: 'json',
      });
      expect(created).toHaveStatusCode(201);
      const existingId = created.body.id;

      const response = await apiClient.put(`${LINKS_API_PATH}/${existingId}`, {
        headers: {
          ...COMMON_HEADERS,
          ...editorCredentials.apiKeyHeader,
        },
        body: { ...MINIMAL_LINKS_BODY, title: 'Updated via valid existing id' },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.data.title).toBe('Updated via valid existing id');
    }
  );

  apiTest(
    'validation - returns 400 when creating a new links item with an invalid ID',
    async ({ apiClient }) => {
      const id = '(new)invalid-links-id';

      const response = await apiClient.put(`${LINKS_API_PATH}/${id}`, {
        headers: {
          ...COMMON_HEADERS,
          ...editorCredentials.apiKeyHeader,
        },
        body: MINIMAL_LINKS_BODY,
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(400);
      expect(response.body.message).toBe(
        'ID must contain only lowercase letters, numbers, hyphens, and underscores.'
      );
    }
  );

  apiTest(
    'validation - returns 400 when the body has an invalid layout value',
    async ({ apiClient }) => {
      const id = 'links-item-invalid-layout';

      const response = await apiClient.put(`${LINKS_API_PATH}/${id}`, {
        headers: {
          ...COMMON_HEADERS,
          ...editorCredentials.apiKeyHeader,
        },
        body: {
          ...MINIMAL_LINKS_BODY,
          layout: 'diagonal',
        },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(400);
      expect(response.body.message).toBe(
        '[request body.layout]: types that failed validation:\n\
- [request body.layout.0]: expected value to equal [horizontal]\n\
- [request body.layout.1]: expected value to equal [vertical]'
      );
    }
  );

  apiTest(
    'authorization - returns 403 if the user does not have permission to create through PUT',
    async ({ apiClient }) => {
      const id = 'links-item-for-403-test';
      // links panel does not exist with this ID so will go through create path
      const response = await apiClient.put(`${LINKS_API_PATH}/${id}`, {
        headers: {
          ...COMMON_HEADERS,
          ...viewerCredentials.apiKeyHeader,
        },
        body: MINIMAL_LINKS_BODY,
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(403);
      expect(response.body.message).toBe('Unable to create links');
    }
  );

  apiTest(
    'authorization - returns 403 if the user does not have permission to update',
    async ({ apiClient }) => {
      // create the links panel so that we go through the update path
      const created = await apiClient.post(LINKS_API_PATH, {
        headers: { ...COMMON_HEADERS, ...editorCredentials.apiKeyHeader },
        body: MINIMAL_LINKS_BODY,
        responseType: 'json',
      });
      // update the links panel library item
      const response = await apiClient.put(`${LINKS_API_PATH}/${created.body.id}`, {
        headers: {
          ...COMMON_HEADERS,
          ...viewerCredentials.apiKeyHeader,
        },
        body: MINIMAL_LINKS_BODY,
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(403);
      expect(response.body.message).toBe('Unable to update links');
    }
  );
});
