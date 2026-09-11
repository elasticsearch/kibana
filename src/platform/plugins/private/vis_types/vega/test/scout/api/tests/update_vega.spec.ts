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
import { apiTest, COMMON_HEADERS, VEGA_API_PATH, VEGA_SPEC_HJSON } from '../fixtures';

apiTest.describe('vega - update', { tag: tags.deploymentAgnostic }, () => {
  let editorCredentials: RoleApiCredentials;
  let viewerCredentials: RoleApiCredentials;
  let createdId: string;

  apiTest.beforeAll(async ({ requestAuth }) => {
    editorCredentials = await requestAuth.getApiKeyForPrivilegedUser();
    viewerCredentials = await requestAuth.getApiKeyForViewer();
  });

  apiTest.beforeEach(async ({ apiClient }) => {
    const response = await apiClient.post(VEGA_API_PATH, {
      headers: { ...COMMON_HEADERS, ...editorCredentials.apiKeyHeader },
      body: { title: 'Original Title', spec: VEGA_SPEC_HJSON },
      responseType: 'json',
    });
    createdId = response.body.id;
  });

  apiTest.afterEach(async ({ kbnClient }) => {
    await kbnClient.savedObjects.clean({ types: ['vega'] });
  });

  apiTest('should update a vega library item', async ({ apiClient }) => {
    const response = await apiClient.put(`${VEGA_API_PATH}/${createdId}`, {
      headers: { ...COMMON_HEADERS, ...editorCredentials.apiKeyHeader },
      body: { title: 'Updated Title', spec: VEGA_SPEC_HJSON },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.id).toBe(createdId);
    expect(response.body.data.title).toBe('Updated Title');
  });

  apiTest('should create when id does not exist (upsert)', async ({ apiClient }) => {
    const response = await apiClient.put(`${VEGA_API_PATH}/new-id-for-upsert`, {
      headers: { ...COMMON_HEADERS, ...editorCredentials.apiKeyHeader },
      body: { title: 'Upserted Chart', spec: VEGA_SPEC_HJSON },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(201);
    expect(response.body.id).toBe('new-id-for-upsert');
    expect(response.body.data.title).toBe('Upserted Chart');
  });

  apiTest('authorization - returns 403 for viewer', async ({ apiClient }) => {
    const response = await apiClient.put(`${VEGA_API_PATH}/${createdId}`, {
      headers: { ...COMMON_HEADERS, ...viewerCredentials.apiKeyHeader },
      body: { title: 'Updated Title', spec: VEGA_SPEC_HJSON },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(403);
  });
});
