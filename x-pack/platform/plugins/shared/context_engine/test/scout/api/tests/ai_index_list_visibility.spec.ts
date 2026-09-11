/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import type { KibanaRole, RoleApiCredentials } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest, testData, spaceScoped } from '../fixtures';

const {
  AI_INDEX_COLLECTION_PATH,
  API_HEADERS,
  CONTEXT_ENGINE_ENABLED_SETTING,
  CONTEXT_ENGINE_READ,
} = testData;
// Unique per run so a retried `beforeAll` does not 409 on fixed names.
const RUN_ID = randomUUID().slice(0, 8);
const OTHER_SPACE_ID = `ce-list-other-${RUN_ID}`;
const READABLE_PREFIX = `ai-index-idx-scout-list-${RUN_ID}-`;
const VISIBLE_INDEX = `${READABLE_PREFIX}visible`;
const EMPTY_INDEX = `${READABLE_PREFIX}empty`;
const HIDDEN_INDEX = `${READABLE_PREFIX}hidden`;
const MISSING_INDEX = `${READABLE_PREFIX}missing`;
// Outside the role's index pattern: probe gets 403, entry must be dropped.
const FORBIDDEN_INDEX = `ai-index-idx-scout-list-forbidden-${RUN_ID}`;

const AI_INDEX_IDS = {
  visible: `scout-list-visible-${RUN_ID}`,
  empty: `scout-list-empty-${RUN_ID}`,
  hidden: `scout-list-hidden-${RUN_ID}`,
  missing: `scout-list-missing-${RUN_ID}`,
  forbidden: `scout-list-forbidden-${RUN_ID}`,
  forbiddenWildcard: `scout-list-forbidden-wildcard-${RUN_ID}`,
};

/** Documented caller: `contextEngine:read` plus ES `read` on (most of) the backing indices. */
const LIST_ROLE: KibanaRole = {
  elasticsearch: {
    cluster: [],
    indices: [{ names: [`${READABLE_PREFIX}*`], privileges: ['read'] }],
  },
  kibana: [CONTEXT_ENGINE_READ],
};

const SPACE_AWARE_MAPPINGS = {
  properties: {
    title: { type: 'text' as const },
    permissions: {
      properties: {
        kibana: {
          properties: {
            privileges: {
              type: 'nested' as const,
              properties: { space: { type: 'keyword' as const } },
            },
          },
        },
      },
    },
  },
};

const registerAiIndex = (id: string, index: string) => ({
  id,
  description: `Scout list fixture ${id}`,
  dest: { type: 'index', value: index },
  automations: [],
  sources: [],
});

const listedIds = (body: { ai_indices: Array<{ id: string }> }): string[] =>
  body.ai_indices.map(({ id }) => id).filter((id) => id.endsWith(RUN_ID));

apiTest.describe('context engine AI Index list visibility', { tag: tags.stateful.classic }, () => {
  let adminCredentials: RoleApiCredentials;
  let listCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth, kbnClient, esClient, apiClient }) => {
    adminCredentials = await requestAuth.getApiKey('admin');
    listCredentials = await requestAuth.getApiKeyForCustomRole(LIST_ROLE);

    await kbnClient.spaces.create({ id: OTHER_SPACE_ID, name: 'CE list other space' });
    // The gate is a per-space setting; each space under test has to enable it.
    await kbnClient.uiSettings.update({ [CONTEXT_ENGINE_ENABLED_SETTING]: true });
    await kbnClient.uiSettings.update(
      { [CONTEXT_ENGINE_ENABLED_SETTING]: true },
      { space: OTHER_SPACE_ID }
    );
    await kbnClient.uiSettings.waitForEventualCacheRefresh();

    await esClient.indices.create({ index: VISIBLE_INDEX });
    await esClient.indices.create({ index: EMPTY_INDEX });
    await esClient.indices.create({ index: HIDDEN_INDEX, mappings: SPACE_AWARE_MAPPINGS });
    await esClient.indices.create({ index: FORBIDDEN_INDEX });
    await esClient.bulk({
      refresh: 'wait_for',
      operations: [
        { index: { _index: VISIBLE_INDEX, _id: 'plain' } },
        { title: 'Visible everywhere' },
        { index: { _index: HIDDEN_INDEX, _id: 'other_only' } },
        { title: 'Other space only', ...spaceScoped(OTHER_SPACE_ID) },
        { index: { _index: FORBIDDEN_INDEX, _id: 'plain' } },
        { title: 'Readable by admins only' },
      ],
    });

    for (const body of [
      registerAiIndex(AI_INDEX_IDS.visible, VISIBLE_INDEX),
      registerAiIndex(AI_INDEX_IDS.empty, EMPTY_INDEX),
      registerAiIndex(AI_INDEX_IDS.hidden, HIDDEN_INDEX),
      registerAiIndex(AI_INDEX_IDS.missing, MISSING_INDEX),
      registerAiIndex(AI_INDEX_IDS.forbidden, FORBIDDEN_INDEX),
      registerAiIndex(AI_INDEX_IDS.forbiddenWildcard, `${FORBIDDEN_INDEX}*`),
    ]) {
      const response = await apiClient.post(AI_INDEX_COLLECTION_PATH, {
        headers: { ...adminCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
        body,
      });
      expect(response).toHaveStatusCode(201);
    }
  });

  apiTest.afterAll(async ({ apiClient, kbnClient, esClient }) => {
    for (const id of Object.values(AI_INDEX_IDS)) {
      await apiClient.delete(`${AI_INDEX_COLLECTION_PATH}/${id}`, {
        headers: { ...adminCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
      });
    }
    await esClient.indices.delete(
      { index: [VISIBLE_INDEX, EMPTY_INDEX, HIDDEN_INDEX, FORBIDDEN_INDEX] },
      { ignore: [404] }
    );
    await kbnClient.spaces.delete(OTHER_SPACE_ID);
    await kbnClient.uiSettings.unset(CONTEXT_ENGINE_ENABLED_SETTING);
  });

  apiTest(
    'lists only entries the caller can read with documents visible here',
    async ({ apiClient }) => {
      const response = await apiClient.get(AI_INDEX_COLLECTION_PATH, {
        headers: { ...listCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      // Empty and missing stay listed; hidden and unreadable are dropped. A wildcard with no
      // readable match is a 404, not a 403, so it counts as empty.
      expect(listedIds(response.body).sort()).toStrictEqual(
        [
          AI_INDEX_IDS.visible,
          AI_INDEX_IDS.empty,
          AI_INDEX_IDS.missing,
          AI_INDEX_IDS.forbiddenWildcard,
        ].sort()
      );
    }
  );

  apiTest('resolves visibility against the request space', async ({ apiClient }) => {
    const response = await apiClient.get(`s/${OTHER_SPACE_ID}/${AI_INDEX_COLLECTION_PATH}`, {
      headers: { ...listCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(listedIds(response.body)).toContain(AI_INDEX_IDS.hidden);
    expect(listedIds(response.body)).not.toContain(AI_INDEX_IDS.forbidden);
  });

  apiTest('lists an entry once its backing indices become readable', async ({ apiClient }) => {
    const response = await apiClient.get(AI_INDEX_COLLECTION_PATH, {
      headers: { ...adminCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(listedIds(response.body)).toContain(AI_INDEX_IDS.forbidden);
    expect(listedIds(response.body)).not.toContain(AI_INDEX_IDS.hidden);
  });

  apiTest('still returns a dropped entry by id', async ({ apiClient }) => {
    const response = await apiClient.get(`${AI_INDEX_COLLECTION_PATH}/${AI_INDEX_IDS.hidden}`, {
      headers: { ...listCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.id).toBe(AI_INDEX_IDS.hidden);
  });
});
