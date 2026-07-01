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
import {
  apiTest,
  COMMON_HEADERS,
  DASHBOARD_LINK,
  EXTERNAL_LINK,
  LINKS_API_PATH,
  MINIMAL_LINKS_BODY,
} from '../fixtures';

apiTest.describe('links - create', { tag: tags.deploymentAgnostic }, () => {
  let editorCredentials: RoleApiCredentials;
  let viewerCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth }) => {
    editorCredentials = await requestAuth.getApiKeyForPrivilegedUser();
    viewerCredentials = await requestAuth.getApiKeyForViewer();
  });

  apiTest.afterAll(async ({ kbnClient }) => {
    await kbnClient.savedObjects.cleanStandardList();
  });

  apiTest('should create a links library item with external links', async ({ apiClient }) => {
    const response = await apiClient.post(LINKS_API_PATH, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: MINIMAL_LINKS_BODY,
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.data.title).toBe(MINIMAL_LINKS_BODY.title);
    expect(response.body.data.links).toHaveLength(1);
    expect(response.body.data.links[0].type).toBe('externalLink');
    expect(response.body.meta.created_at).toBeDefined();
    expect(response.body.meta.updated_at).toBeDefined();
  });

  apiTest('should create a links library item with dashboard links', async ({ apiClient }) => {
    const response = await apiClient.post(LINKS_API_PATH, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: {
        title: 'Dashboard Links Panel',
        links: [DASHBOARD_LINK],
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.data.links[0].type).toBe('dashboardLink');
  });

  apiTest(
    'should create a links library item with layout and description',
    async ({ apiClient }) => {
      const response = await apiClient.post(LINKS_API_PATH, {
        headers: {
          ...COMMON_HEADERS,
          ...editorCredentials.apiKeyHeader,
        },
        body: {
          title: 'Horizontal Links',
          description: 'A panel with horizontal layout',
          layout: 'horizontal',
          links: [EXTERNAL_LINK],
        },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(201);
      expect(response.body.data.layout).toBe('horizontal');
      expect(response.body.data.description).toBe('A panel with horizontal layout');
    }
  );

  apiTest('validation - returns 400 when links is not an array', async ({ apiClient }) => {
    const response = await apiClient.post(LINKS_API_PATH, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: {
        title: 'Bad Links Panel',
        links: {},
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.message).toBe(
      '[request body.links]: expected value of type [array] but got [Object]'
    );
  });

  apiTest('validation - returns 400 when a link has an invalid type', async ({ apiClient }) => {
    const response = await apiClient.post(LINKS_API_PATH, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: {
        title: 'Bad Link Type',
        links: [{ type: 'invalidLinkType', destination: 'https://example.com' }],
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(400);
    expect(response.body.message).toBe(
      '[request body.links.0]: expected "type" to be one of ["dashboardLink", "externalLink"] but got ["invalidLinkType"]'
    );
  });

  apiTest('validation - returns 400 when layout has an invalid value', async ({ apiClient }) => {
    const response = await apiClient.post(LINKS_API_PATH, {
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
  });

  apiTest(
    'authorization - returns 403 if the user does not have permission to create',
    async ({ apiClient }) => {
      const response = await apiClient.post(LINKS_API_PATH, {
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
});
