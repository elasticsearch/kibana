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
import { apiTest, COMMON_HEADERS, EXTERNAL_LINK, LINKS_API_PATH } from '../fixtures';

const buildUrl = (params: Record<string, string | number | undefined>) => {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  return query ? `${LINKS_API_PATH}?${query}` : LINKS_API_PATH;
};

apiTest.describe('links - search', { tag: tags.deploymentAgnostic }, () => {
  let viewerCredentials: RoleApiCredentials;
  let editorCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth, apiClient }) => {
    viewerCredentials = await requestAuth.getApiKey('viewer');
    editorCredentials = await requestAuth.getApiKeyForPrivilegedUser();

    const titles = [
      'Alpha Links Panel',
      'Beta Links Panel',
      'Gamma Links Panel',
      'Delta Links Panel',
      'Epsilon Links Panel',
    ];

    for (const title of titles) {
      await apiClient.post(LINKS_API_PATH, {
        headers: {
          ...COMMON_HEADERS,
          ...editorCredentials.apiKeyHeader,
        },
        body: { title, links: [EXTERNAL_LINK] },
        responseType: 'json',
      });
    }
  });

  apiTest.afterAll(async ({ kbnClient }) => {
    await kbnClient.savedObjects.cleanStandardList();
  });

  apiTest('should return a paginated list of links items', async ({ apiClient }) => {
    const response = await apiClient.get(LINKS_API_PATH, {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.meta.total).toBe(5);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.meta.page).toBe(1);
    expect(response.body.meta.per_page).toBe(20);
  });

  apiTest('should narrow results by query', async ({ apiClient }) => {
    const response = await apiClient.get(buildUrl({ query: 'Alpha*' }), {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.meta.total).toBe(1);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].data.title).toBe('Alpha Links Panel');
  });

  apiTest('should allow users to set a per_page limit', async ({ apiClient }) => {
    const response = await apiClient.get(buildUrl({ per_page: 2 }), {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.meta.total).toBe(5);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta.per_page).toBe(2);
  });

  apiTest('should allow users to paginate through results', async ({ apiClient }) => {
    const firstPage = await apiClient.get(buildUrl({ per_page: 3, page: 1 }), {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(firstPage).toHaveStatusCode(200);
    expect(firstPage.body.data).toHaveLength(3);

    const secondPage = await apiClient.get(buildUrl({ per_page: 3, page: 2 }), {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(secondPage).toHaveStatusCode(200);
    expect(secondPage.body.data).toHaveLength(2);
    expect(secondPage.body.meta.page).toBe(2);

    const firstPageIds: string[] = firstPage.body.data.map((item: { id: string }) => item.id);
    const secondPageIds: string[] = secondPage.body.data.map((item: { id: string }) => item.id);
    const allIds = [...firstPageIds, ...secondPageIds];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  apiTest('should return an empty list when no items match the query', async ({ apiClient }) => {
    const response = await apiClient.get(buildUrl({ query: 'nonexistent-query-xyz-abc' }), {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.meta.total).toBe(0);
    expect(response.body.data).toHaveLength(0);
  });
});
