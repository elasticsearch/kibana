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

apiTest.describe('vega - search', { tag: tags.deploymentAgnostic }, () => {
  let viewerCredentials: RoleApiCredentials;
  let editorCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth, apiClient }) => {
    viewerCredentials = await requestAuth.getApiKeyForViewer();
    editorCredentials = await requestAuth.getApiKeyForPrivilegedUser();

    await apiClient.post(VEGA_API_PATH, {
      headers: { ...COMMON_HEADERS, ...editorCredentials.apiKeyHeader },
      body: { title: 'Search Test Chart Alpha', spec: VEGA_SPEC_HJSON },
      responseType: 'json',
    });
    await apiClient.post(VEGA_API_PATH, {
      headers: { ...COMMON_HEADERS, ...editorCredentials.apiKeyHeader },
      body: { title: 'Search Test Chart Beta', spec: VEGA_SPEC_HJSON },
      responseType: 'json',
    });
  });

  apiTest.afterAll(async ({ kbnClient }) => {
    await kbnClient.savedObjects.clean({ types: ['vega'] });
  });

  apiTest('should return a paginated list of vega library items', async ({ apiClient }) => {
    const response = await apiClient.get(VEGA_API_PATH, {
      headers: { ...COMMON_HEADERS, ...viewerCredentials.apiKeyHeader },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.meta.total).toBeGreaterThanOrEqual(2);
    expect(response.body.meta.page).toBe(1);
    expect(response.body.meta.per_page).toBe(20);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  apiTest('should respect per_page limit', async ({ apiClient }) => {
    const response = await apiClient.get(`${VEGA_API_PATH}?per_page=1`, {
      headers: { ...COMMON_HEADERS, ...viewerCredentials.apiKeyHeader },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.meta.per_page).toBe(1);
    expect(response.body.data).toHaveLength(1);
  });

  apiTest('should narrow results by query', async ({ apiClient }) => {
    const response = await apiClient.get(`${VEGA_API_PATH}?query=Alpha`, {
      headers: { ...COMMON_HEADERS, ...viewerCredentials.apiKeyHeader },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(
      response.body.data.map((item: { data: { title: string } }) => item.data.title)
    ).toContain('Search Test Chart Alpha');
    expect(
      response.body.data.map((item: { data: { title: string } }) => item.data.title)
    ).not.toContain('Search Test Chart Beta');
  });
});
