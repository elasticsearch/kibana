/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RoleApiCredentials } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest, testData } from '../fixtures';

const AI_INDEX_ID = 'scout_test_ai_index';
const AI_INDEX_PATH = `api/context_engine/ai_index/${AI_INDEX_ID}`;
const INDEX_AI_INDEX_ID = 'scout_test_index_ai_index';
const INDEX_AI_INDEX_PATH = `api/context_engine/ai_index/${INDEX_AI_INDEX_ID}`;
const LAZY_AI_INDEX_ID = `${AI_INDEX_ID}_lazy`;
const LAZY_AI_INDEX_PATH = `api/context_engine/ai_index/${LAZY_AI_INDEX_ID}`;
const DEST_DATA_STREAM = 'ai-index-ds-scout-test';
const DEST_INDEX = 'ai-index-idx-scout-test';
// Must not match the data stream template pattern (`${DEST_DATA_STREAM}*`),
// or ES refuses to create it as a plain index.
const PLAIN_INDEX = 'ai-index-ds-plain-scout-test';
const DEST_INDEX_TEMPLATE = 'scout-test-context-engine-template';
const CONTEXT_ENGINE_ENABLED_SETTING = 'contextEngine:enabled';

const API_HEADERS = {
  ...testData.COMMON_HEADERS,
  'elastic-api-version': '2023-10-31',
};

const aiIndexBody = {
  description: 'AI index created by the Scout API test suite',
  dest: { type: 'data_stream', value: DEST_DATA_STREAM },
  automations: [{ type: 'workflow', value: 'scout-automation' }],
  sources: [{ type: 'esql', value: `FROM ${DEST_DATA_STREAM} | LIMIT 1` }],
};

// Failing: See https://github.com/elastic/kibana/issues/280639
apiTest.describe.skip('context engine AI indices API', { tag: tags.stateful.classic }, () => {
  let adminApiCredentials: RoleApiCredentials;
  let viewerApiCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth, kbnClient, esClient }) => {
    adminApiCredentials = await requestAuth.getApiKey('admin');
    viewerApiCredentials = await requestAuth.getApiKey('viewer');
    await kbnClient.uiSettings.update({ [CONTEXT_ENGINE_ENABLED_SETTING]: true });
    await esClient.indices.putIndexTemplate({
      name: DEST_INDEX_TEMPLATE,
      index_patterns: [`${DEST_DATA_STREAM}*`],
      data_stream: {},
      priority: 500,
    });
    await esClient.indices.createDataStream({ name: DEST_DATA_STREAM });
    await esClient.indices.create({ index: DEST_INDEX });
    await esClient.indices.create({ index: PLAIN_INDEX });
  });

  apiTest.afterAll(async ({ apiClient, kbnClient, esClient }) => {
    // AI index deletes tolerate records that were never created (404).
    await apiClient.delete(AI_INDEX_PATH, {
      headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
    });
    await apiClient.delete(INDEX_AI_INDEX_PATH, {
      headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
    });
    await apiClient.delete(LAZY_AI_INDEX_PATH, {
      headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
    });
    await esClient.indices.delete({ index: DEST_INDEX }, { ignore: [404] });
    await esClient.indices.delete({ index: PLAIN_INDEX }, { ignore: [404] });
    await esClient.indices.deleteDataStream({ name: DEST_DATA_STREAM }, { ignore: [404] });
    await esClient.indices.deleteIndexTemplate({ name: DEST_INDEX_TEMPLATE }, { ignore: [404] });
    await kbnClient.uiSettings.unset(CONTEXT_ENGINE_ENABLED_SETTING);
  });

  apiTest('manages an AI index through its full lifecycle', async ({ apiClient }) => {
    let dateCreated: string;

    await apiTest.step('creates the AI index', async () => {
      const response = await apiClient.put(AI_INDEX_PATH, {
        headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
        body: aiIndexBody,
      });

      expect(response).toHaveStatusCode(201);
      expect(response.body).toStrictEqual({ status: 'created' });
    });

    await apiTest.step('gets the AI index by id', async () => {
      const response = await apiClient.get(AI_INDEX_PATH, {
        headers: { ...viewerApiCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({ id: AI_INDEX_ID, ...aiIndexBody });
      expect(response.body.date_created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(response.body.date_modified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      dateCreated = response.body.date_created;
    });

    await apiTest.step('lists the AI index', async () => {
      const response = await apiClient.get('api/context_engine/ai_index', {
        headers: { ...viewerApiCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.ai_indices).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ id: AI_INDEX_ID })])
      );
    });

    await apiTest.step('updates the AI index and preserves date_created', async () => {
      const response = await apiClient.put(AI_INDEX_PATH, {
        headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
        body: { ...aiIndexBody, description: 'Updated description' },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ status: 'updated' });

      const updatedResponse = await apiClient.get(AI_INDEX_PATH, {
        headers: { ...viewerApiCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
      });
      expect(updatedResponse.body.description).toBe('Updated description');
      expect(updatedResponse.body.date_created).toBe(dateCreated);
    });

    await apiTest.step('deletes the AI index', async () => {
      const response = await apiClient.delete(AI_INDEX_PATH, {
        headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ acknowledged: true });
    });

    await apiTest.step('returns 404 once deleted', async () => {
      const getResponse = await apiClient.get(AI_INDEX_PATH, {
        headers: { ...viewerApiCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
      });
      expect(getResponse).toHaveStatusCode(404);

      const deleteResponse = await apiClient.delete(AI_INDEX_PATH, {
        headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
      });
      expect(deleteResponse).toHaveStatusCode(404);
    });
  });

  apiTest(
    'creates an AI index whose dest does not exist yet (lazy creation)',
    async ({ apiClient }) => {
      const response = await apiClient.put(LAZY_AI_INDEX_PATH, {
        headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
        body: {
          ...aiIndexBody,
          dest: { type: 'data_stream', value: 'ai-index-ds-does-not-exist*' },
        },
      });

      expect(response).toHaveStatusCode(201);
      expect(response.body).toStrictEqual({ status: 'created' });
    }
  );

  apiTest('creates and reads an index AI index', async ({ apiClient }) => {
    const createResponse = await apiClient.put(INDEX_AI_INDEX_PATH, {
      headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
      body: {
        dest: { type: 'index', value: `${DEST_INDEX}*` },
        automations: [],
        sources: [],
      },
    });
    expect(createResponse).toHaveStatusCode(201);
    expect(createResponse.body).toStrictEqual({ status: 'created' });

    const getResponse = await apiClient.get(INDEX_AI_INDEX_PATH, {
      headers: { ...viewerApiCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
    });
    expect(getResponse).toHaveStatusCode(200);
    expect(getResponse.body).toMatchObject({
      id: INDEX_AI_INDEX_ID,
      dest: { type: 'index', value: `${DEST_INDEX}*` },
    });
  });

  apiTest('rejects a system index as an index dest', async ({ apiClient }) => {
    const response = await apiClient.put(AI_INDEX_PATH, {
      headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
      body: { ...aiIndexBody, dest: { type: 'index', value: '.kibana*' } },
    });

    expect(response).toHaveStatusCode(400);
  });

  apiTest('rejects a dest that is not a data stream', async ({ apiClient }) => {
    const response = await apiClient.put(AI_INDEX_PATH, {
      headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
      body: { ...aiIndexBody, dest: { type: 'data_stream', value: PLAIN_INDEX } },
    });

    expect(response).toHaveStatusCode(400);
  });

  apiTest('rejects a request without the required dest field', async ({ apiClient }) => {
    const { dest, ...bodyWithoutDest } = aiIndexBody;

    const response = await apiClient.put(AI_INDEX_PATH, {
      headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
      body: bodyWithoutDest,
    });

    expect(response).toHaveStatusCode(400);
  });

  apiTest('rejects an id with disallowed characters', async ({ apiClient }) => {
    const response = await apiClient.put('api/context_engine/ai_index/Invalid_ID', {
      headers: { ...adminApiCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
      body: aiIndexBody,
    });

    expect(response).toHaveStatusCode(400);
  });

  apiTest('forbids writes for a read-only user', async ({ apiClient }) => {
    const response = await apiClient.put(AI_INDEX_PATH, {
      headers: { ...viewerApiCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
      body: aiIndexBody,
    });

    expect(response).toHaveStatusCode(403);
  });

  apiTest('allows reads for a read-only user', async ({ apiClient }) => {
    const response = await apiClient.get('api/context_engine/ai_index', {
      headers: { ...viewerApiCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
  });
});
