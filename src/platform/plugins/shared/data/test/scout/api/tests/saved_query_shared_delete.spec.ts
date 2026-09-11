/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { randomUUID } from 'crypto';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { SAVED_QUERY_BASE_URL } from '../../../../common';
import { apiTest, COMMON_HEADERS } from '../fixtures';

apiTest.describe('Saved query deletion across spaces', { tag: tags.deploymentAgnostic }, () => {
  const sourceSpaceId = `saved-query-source-${randomUUID()}`;
  const destinationSpaceId = `saved-query-destination-${randomUUID()}`;
  const spaceIds = [sourceSpaceId, destinationSpaceId];
  let queryHeaders: Record<string, string>;

  apiTest.beforeAll(async ({ apiServices, samlAuth, config }) => {
    const role = config.serverless && config.projectType === 'es' ? 'developer' : 'editor';
    const { cookieHeader } = await samlAuth.asInteractiveUser(role);
    queryHeaders = { ...COMMON_HEADERS, ...cookieHeader };

    for (const id of spaceIds) {
      await apiServices.spaces.create({ id });
    }
  });

  apiTest.afterAll(async ({ apiServices }) => {
    const errors: Error[] = [];
    // Remove both owned namespaces even if setup or one cleanup operation failed.
    for (const id of spaceIds) {
      try {
        await apiServices.spaces.delete(id);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to clean up saved-query test spaces');
    }
  });

  apiTest('deletes a shared query from both spaces', async ({ apiClient, kbnClient }) => {
    const attributes = {
      title: `shared-saved-query-${sourceSpaceId}`,
      description: '',
      query: { language: 'kuery', query: 'response:200' },
      filters: [],
    };

    const queryId = await apiTest.step('create a query in the source space', async () => {
      const response = await apiClient.post(`/s/${sourceSpaceId}${SAVED_QUERY_BASE_URL}/_create`, {
        headers: queryHeaders,
        body: attributes,
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({ attributes });
      expect(typeof response.body.id).toBe('string');
      const { id }: { id: string } = response.body;
      return id;
    });

    await apiTest.step('share the same query and verify access from both spaces', async () => {
      await kbnClient.request({
        method: 'POST',
        path: `/s/${sourceSpaceId}/api/spaces/_update_objects_spaces`,
        headers: COMMON_HEADERS,
        body: {
          objects: [{ type: 'query', id: queryId }],
          spacesToAdd: [destinationSpaceId],
          spacesToRemove: [],
        },
      });

      for (const spaceId of spaceIds) {
        const response = await apiClient.get(
          `/s/${spaceId}${SAVED_QUERY_BASE_URL}/${encodeURIComponent(queryId)}`,
          { headers: queryHeaders }
        );
        expect(response).toHaveStatusCode(200);
        expect(response.body).toMatchObject({
          id: queryId,
          attributes,
          namespaces: expect.arrayContaining(spaceIds),
        });
      }
    });

    await apiTest.step('delete through the saved-query endpoint', async () => {
      const response = await apiClient.delete(
        `/s/${sourceSpaceId}${SAVED_QUERY_BASE_URL}/${encodeURIComponent(queryId)}`,
        { headers: queryHeaders }
      );
      expect(response).toHaveStatusCode(200);
    });

    await apiTest.step('fresh reads no longer find the query in either space', async () => {
      for (const spaceId of spaceIds) {
        const response = await apiClient.get(
          `/s/${spaceId}${SAVED_QUERY_BASE_URL}/${encodeURIComponent(queryId)}`,
          { headers: queryHeaders }
        );
        expect(response).toHaveStatusCode(404);
      }
    });
  });
});
