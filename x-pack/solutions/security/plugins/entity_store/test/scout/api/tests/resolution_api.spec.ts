/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
import type { Client } from '@elastic/elasticsearch';
import { get } from 'lodash';
import {
  PUBLIC_HEADERS,
  ENTITY_STORE_ROUTES,
  ENTITY_STORE_TAGS,
  LATEST_ALIAS,
  LATEST_INDEX,
  UPDATES_INDEX,
} from '../fixtures/constants';
import { FF_ENABLE_ENTITY_STORE_V2 } from '../../../../common';
import { clearEntityStoreIndices } from '../fixtures/helpers';

const RESOLVED_TO_FIELD = 'entity.relationships.resolution.resolved_to';

apiTest.describe('Entity Store Resolution API tests', { tag: ENTITY_STORE_TAGS }, () => {
  let defaultHeaders: Record<string, string>;

  apiTest.beforeAll(async ({ apiClient, esClient, kbnClient, samlAuth }) => {
    const credentials = await samlAuth.asInteractiveUser('admin');
    defaultHeaders = {
      ...credentials.cookieHeader,
      ...PUBLIC_HEADERS,
    };

    await kbnClient.uiSettings.update({
      [FF_ENABLE_ENTITY_STORE_V2]: true,
    });

    await esClient.indices.delete({
      index: [LATEST_INDEX, UPDATES_INDEX],
      ignore_unavailable: true,
    });

    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
      headers: defaultHeaders,
      responseType: 'json',
      body: {},
    });
    expect([200, 201]).toContain(response.statusCode);
  });

  apiTest.afterAll(async ({ apiClient, esClient }) => {
    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.UNINSTALL, {
      headers: defaultHeaders,
      responseType: 'json',
      body: {},
    });
    expect(response.statusCode).toBe(200);
    await clearEntityStoreIndices(esClient);
  });

  apiTest('Link: should link entities to a target', async ({ apiClient, esClient }) => {
    const targetId = 'link-target-1';
    const alias1 = 'link-alias-1a';
    const alias2 = 'link-alias-1b';

    await seedEntity(apiClient, defaultHeaders, targetId);
    await seedEntity(apiClient, defaultHeaders, alias1);
    await seedEntity(apiClient, defaultHeaders, alias2);

    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: targetId, entity_ids: [alias1, alias2] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.linked).toStrictEqual(expect.arrayContaining([alias1, alias2]));
    expect(response.body.skipped).toStrictEqual([]);
    expect(response.body.target_id).toBe(targetId);

    // Verify via ES that resolved_to is set on alias docs
    const alias1Doc = await getEntitySource(esClient, alias1);
    expect(get(alias1Doc, RESOLVED_TO_FIELD)).toBe(targetId);

    const alias2Doc = await getEntitySource(esClient, alias2);
    expect(get(alias2Doc, RESOLVED_TO_FIELD)).toBe(targetId);
  });

  apiTest('Link: should skip already-linked entities', async ({ apiClient }) => {
    const targetId = 'skip-target-2';
    const aliasId = 'skip-alias-2';

    await seedEntity(apiClient, defaultHeaders, targetId);
    await seedEntity(apiClient, defaultHeaders, aliasId);

    // First link
    const first = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: targetId, entity_ids: [aliasId] },
    });
    expect(first.statusCode).toBe(200);
    expect(first.body.linked).toStrictEqual([aliasId]);

    // Second link — same alias should be skipped
    const second = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: targetId, entity_ids: [aliasId] },
    });
    expect(second.statusCode).toBe(200);
    expect(second.body.linked).toStrictEqual([]);
    expect(second.body.skipped).toStrictEqual([aliasId]);
  });

  apiTest('Group: should return resolution group from target', async ({ apiClient }) => {
    const targetId = 'group-target-3';
    const alias1 = 'group-alias-3a';
    const alias2 = 'group-alias-3b';

    await seedEntity(apiClient, defaultHeaders, targetId);
    await seedEntity(apiClient, defaultHeaders, alias1);
    await seedEntity(apiClient, defaultHeaders, alias2);

    await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: targetId, entity_ids: [alias1, alias2] },
    });

    const response = await apiClient.get(
      `${ENTITY_STORE_ROUTES.public.RESOLUTION_GROUP}?entity_id=${targetId}&apiVersion=2`,
      {
        headers: defaultHeaders,
        responseType: 'json',
      }
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.group_size).toBe(3);
    expect(response.body.target.entity.id).toBe(targetId);
    expect(response.body.aliases).toHaveLength(2);

    const aliasIds = response.body.aliases.map((a: any) => a.entity.id);
    expect(aliasIds).toStrictEqual(expect.arrayContaining([alias1, alias2]));
  });

  apiTest('Group: should return same group from alias', async ({ apiClient }) => {
    const targetId = 'group-alias-target-4';
    const aliasId = 'group-alias-alias-4';

    await seedEntity(apiClient, defaultHeaders, targetId);
    await seedEntity(apiClient, defaultHeaders, aliasId);

    await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: targetId, entity_ids: [aliasId] },
    });

    const response = await apiClient.get(
      `${ENTITY_STORE_ROUTES.public.RESOLUTION_GROUP}?entity_id=${aliasId}&apiVersion=2`,
      {
        headers: defaultHeaders,
        responseType: 'json',
      }
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.group_size).toBe(2);
    expect(response.body.target.entity.id).toBe(targetId);
  });

  apiTest('Group: should return standalone entity', async ({ apiClient }) => {
    const entityId = 'standalone-5';

    await seedEntity(apiClient, defaultHeaders, entityId);

    const response = await apiClient.get(
      `${ENTITY_STORE_ROUTES.public.RESOLUTION_GROUP}?entity_id=${entityId}&apiVersion=2`,
      {
        headers: defaultHeaders,
        responseType: 'json',
      }
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.group_size).toBe(1);
    expect(response.body.target.entity.id).toBe(entityId);
    expect(response.body.aliases).toStrictEqual([]);
  });

  apiTest('Unlink: should unlink alias entities', async ({ apiClient, esClient }) => {
    const targetId = 'unlink-target-6';
    const alias1 = 'unlink-alias-6a';
    const alias2 = 'unlink-alias-6b';

    await seedEntity(apiClient, defaultHeaders, targetId);
    await seedEntity(apiClient, defaultHeaders, alias1);
    await seedEntity(apiClient, defaultHeaders, alias2);

    await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: targetId, entity_ids: [alias1, alias2] },
    });

    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_UNLINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { entity_ids: [alias1, alias2] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.unlinked).toStrictEqual(expect.arrayContaining([alias1, alias2]));

    // Verify via ES that resolved_to is null
    const alias1Doc = await getEntitySource(esClient, alias1);
    expect(get(alias1Doc, RESOLVED_TO_FIELD)).toBeNull();

    const alias2Doc = await getEntitySource(esClient, alias2);
    expect(get(alias2Doc, RESOLVED_TO_FIELD)).toBeNull();

    // Group should show standalone
    const group = await apiClient.get(
      `${ENTITY_STORE_ROUTES.public.RESOLUTION_GROUP}?entity_id=${targetId}&apiVersion=2`,
      {
        headers: defaultHeaders,
        responseType: 'json',
      }
    );
    expect(group.body.group_size).toBe(1);
  });

  apiTest('Unlink: should skip non-alias entities', async ({ apiClient }) => {
    const entityId = 'unlink-standalone-7';

    await seedEntity(apiClient, defaultHeaders, entityId);

    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_UNLINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { entity_ids: [entityId] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.unlinked).toStrictEqual([]);
    expect(response.body.skipped).toStrictEqual([entityId]);
  });

  apiTest('Link: should return 400 for self-link', async ({ apiClient }) => {
    const entityId = 'self-link-8';

    await seedEntity(apiClient, defaultHeaders, entityId);

    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: entityId, entity_ids: [entityId] },
    });

    expect(response.statusCode).toBe(400);
  });

  apiTest('Link: should return 400 for non-existent entities', async ({ apiClient }) => {
    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: 'nonexistent-target-9', entity_ids: ['nonexistent-alias-9'] },
    });

    expect(response.statusCode).toBe(400);
  });

  apiTest('Link: should return 400 for chain resolution', async ({ apiClient }) => {
    const entityA = 'chain-a-10';
    const entityB = 'chain-b-10';
    const entityC = 'chain-c-10';

    await seedEntity(apiClient, defaultHeaders, entityA);
    await seedEntity(apiClient, defaultHeaders, entityB);
    await seedEntity(apiClient, defaultHeaders, entityC);

    // Link B → A
    const link = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: entityA, entity_ids: [entityB] },
    });
    expect(link.statusCode).toBe(200);

    // Try to link C → B (B is already an alias)
    const chainLink = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: entityB, entity_ids: [entityC] },
    });
    expect(chainLink.statusCode).toBe(400);
  });

  apiTest('Link: should return 400 when linking entity that has aliases', async ({ apiClient }) => {
    const entityA = 'has-aliases-a-11';
    const entityB = 'has-aliases-b-11';
    const entityC = 'has-aliases-c-11';

    await seedEntity(apiClient, defaultHeaders, entityA);
    await seedEntity(apiClient, defaultHeaders, entityB);
    await seedEntity(apiClient, defaultHeaders, entityC);

    // Link B → A
    const link = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: entityA, entity_ids: [entityB] },
    });
    expect(link.statusCode).toBe(200);

    // Try to link A → C (A has aliases pointing to it)
    const hasAliasesLink = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_LINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { target_id: entityC, entity_ids: [entityA] },
    });
    expect(hasAliasesLink.statusCode).toBe(400);
  });

  apiTest('Unlink: should return 400 for non-existent entities', async ({ apiClient }) => {
    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.RESOLUTION_UNLINK, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { entity_ids: ['nonexistent-12'] },
    });

    expect(response.statusCode).toBe(400);
  });

  apiTest('Group: should return 404 for non-existent entity', async ({ apiClient }) => {
    const response = await apiClient.get(
      `${ENTITY_STORE_ROUTES.public.RESOLUTION_GROUP}?entity_id=nonexistent-13&apiVersion=2`,
      {
        headers: defaultHeaders,
        responseType: 'json',
      }
    );

    expect(response.statusCode).toBe(404);
  });
});

async function seedEntity(
  apiClient: { post: Function },
  headers: Record<string, string>,
  entityId: string
): Promise<void> {
  const response = await apiClient.post(ENTITY_STORE_ROUTES.public.CRUD_CREATE('generic'), {
    headers,
    responseType: 'json',
    body: { entity: { id: entityId } },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Failed to seed entity '${entityId}': ${JSON.stringify(response.body)}`);
  }
}

async function getEntitySource(
  esClient: Client,
  entityId: string
): Promise<Record<string, unknown>> {
  await esClient.indices.refresh({ index: LATEST_ALIAS });
  const response = await esClient.search({
    index: LATEST_ALIAS,
    query: {
      bool: {
        filter: [{ term: { 'entity.id': entityId } }],
      },
    },
    size: 1,
  });

  if (response.hits.hits.length === 0) {
    throw new Error(`Entity '${entityId}' not found in ${LATEST_ALIAS}`);
  }

  return response.hits.hits[0]._source as Record<string, unknown>;
}
