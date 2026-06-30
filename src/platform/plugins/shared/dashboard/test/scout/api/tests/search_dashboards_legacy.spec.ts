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
import { AS_CODE_USE_GA_SCHEMAS_FEATURE_FLAG } from '@kbn/as-code-shared-schemas';
import { apiTest, COMMON_HEADERS, KBN_ARCHIVES } from '../fixtures';

const SEARCH_ENDPOINT = 'api/dashboards';

const buildUrl = (params: Record<string, string | string[] | number | undefined>) => {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        for (const item of value) {
          searchParams.append(key, String(item));
        }
      } else {
        searchParams.set(key, String(value));
      }
    }
  }
  const query = searchParams.toString();
  return query ? `${SEARCH_ENDPOINT}?${query}` : SEARCH_ENDPOINT;
};

// TODO: Delete this file after asCode.useGaSchemas feature flag is flipped to true and the legacy search endpoint schemas are no longer used
apiTest.describe('dashboards - search - LEGACY', { tag: tags.deploymentAgnostic }, () => {
  let viewerCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ kbnClient, requestAuth, apiServices }) => {
    viewerCredentials = await requestAuth.getApiKey('viewer');
    await kbnClient.importExport.load(KBN_ARCHIVES.MANY_DASHBOARDS);
    await kbnClient.importExport.load(KBN_ARCHIVES.TAGS);

    // The code default is `true`, so explicitly disable GA schemas to exercise the legacy implementation.
    // The override value must be a boolean: it is returned verbatim, so a string would be truthy.
    await apiServices.core.settings({
      'feature_flags.overrides': {
        [AS_CODE_USE_GA_SCHEMAS_FEATURE_FLAG]: false,
      },
    });
  });

  apiTest.afterAll(async ({ kbnClient, apiServices }) => {
    await kbnClient.savedObjects.cleanStandardList();

    // Reset feature flag override to the code default
    await apiServices.core.settings({
      'feature_flags.overrides': {
        [AS_CODE_USE_GA_SCHEMAS_FEATURE_FLAG]: true,
      },
    });
  });

  apiTest('should retrieve a paginated list of dashboards', async ({ apiClient }) => {
    const response = await apiClient.get(SEARCH_ENDPOINT, {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(101);
    expect(response.body.dashboards).toHaveLength(20);
    expect(response.body.dashboards[0].id).toBe('test-dashboard-00');
  });

  apiTest('should narrow results by query', async ({ apiClient }) => {
    const response = await apiClient.get(buildUrl({ query: '0*' }), {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(1);
    expect(response.body.dashboards).toHaveLength(1);
  });

  apiTest('should allow users to set a per page limit', async ({ apiClient }) => {
    const response = await apiClient.get(buildUrl({ per_page: 10 }), {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(101);
    expect(response.body.dashboards).toHaveLength(10);
  });

  apiTest(
    'should allow users to paginate through the list of dashboards',
    async ({ apiClient }) => {
      const response = await apiClient.get(buildUrl({ page: 5, per_page: 10 }), {
        headers: {
          ...COMMON_HEADERS,
          ...viewerCredentials.apiKeyHeader,
        },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.total).toBe(101);
      expect(response.body.dashboards).toHaveLength(10);
      expect(response.body.dashboards[0].id).toBe('test-dashboard-40');
    }
  );

  apiTest('should narrow results by tags', async ({ apiClient }) => {
    const response = await apiClient.get(buildUrl({ tags: 'tag-2' }), {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(1);
    expect(response.body.dashboards).toHaveLength(1);
    expect(response.body.dashboards[0].id).toBe('8d66658a-f5b7-4482-84dc-f41d317473b8');
    expect(response.body.dashboards[0].data.tags).toStrictEqual(['tag-2', 'tag-3']);
  });

  apiTest('should narrow results by tags with multiple values', async ({ apiClient }) => {
    const response = await apiClient.get(buildUrl({ tags: ['tag-1', 'tag-2'], query: 'tagged*' }), {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(1);
    expect(response.body.dashboards).toHaveLength(1);
    expect(response.body.dashboards[0].id).toBe('8d66658a-f5b7-4482-84dc-f41d317473b8');
  });

  apiTest('should narrow results by excluded_tags', async ({ apiClient }) => {
    const response = await apiClient.get(buildUrl({ excluded_tags: 'tag-2' }), {
      headers: {
        ...COMMON_HEADERS,
        ...viewerCredentials.apiKeyHeader,
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(100);
    expect(response.body.dashboards).toHaveLength(20);
    expect(response.body.dashboards.map((dashboard: { id: string }) => dashboard.id)).not.toContain(
      '8d66658a-f5b7-4482-84dc-f41d317473b8'
    );
  });

  apiTest('should narrow results by excluded_tags with multiple values', async ({ apiClient }) => {
    const response = await apiClient.get(
      buildUrl({ excluded_tags: ['tag-1', 'tag-2'], query: 'tagged*' }),
      {
        headers: {
          ...COMMON_HEADERS,
          ...viewerCredentials.apiKeyHeader,
        },
        responseType: 'json',
      }
    );

    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(0);
    expect(response.body.dashboards).toHaveLength(0);
  });
});
