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

apiTest.describe('vega - delete', { tag: tags.deploymentAgnostic }, () => {
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
      body: { title: 'Delete Test Chart', spec: VEGA_SPEC_HJSON },
      responseType: 'json',
    });
    createdId = response.body.id;
  });

  apiTest.afterEach(async ({ kbnClient }) => {
    await kbnClient.savedObjects.clean({ types: ['vega'] });
  });

  apiTest('should delete a vega library item', async ({ apiClient }) => {
    const response = await apiClient.delete(`${VEGA_API_PATH}/${createdId}`, {
      headers: { ...COMMON_HEADERS, ...editorCredentials.apiKeyHeader },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(204);
  });

  apiTest('should return 404 for a non-existent id', async ({ apiClient }) => {
    const response = await apiClient.delete(`${VEGA_API_PATH}/does-not-exist`, {
      headers: { ...COMMON_HEADERS, ...editorCredentials.apiKeyHeader },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(404);
  });

  apiTest('authorization - returns 403 for viewer', async ({ apiClient }) => {
    const response = await apiClient.delete(`${VEGA_API_PATH}/${createdId}`, {
      headers: { ...COMMON_HEADERS, ...viewerCredentials.apiKeyHeader },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(403);
  });
});
