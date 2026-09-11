/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RoleApiCredentials } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import type { DataStream } from '../../../../../common';
import {
  apiTest,
  createDataStream,
  deleteDataStream,
  describeStorage,
  expectedDataStream,
  getDataStream,
  testData,
} from '../../fixtures';
import { SERVERLESS_EXCEPT_MKI_SECURITY } from '../../tags';

const { API_BASE_PATH, COMMON_HEADERS } = testData;

const DATA_STREAM_NAME = 'index-management-api-ds-get';

const expectedLifecycle = { enabled: true };
// A single-shard index has no replica to assign on serverless, so it reports green.
const expectedHealth = 'green';
const expectedStats = {
  meteringDocsCount: 0,
  meteringStorageSize: '0b',
  meteringStorageSizeBytes: 0,
};
const expectedStorage = { storageSize: 'undefined', storageSizeBytes: 'undefined' };

// Cloud (MKI) Security's different default retention is covered in data_streams_mki_security.spec.ts.
apiTest.describe(
  'Data streams API - Get (serverless)',
  { tag: SERVERLESS_EXCEPT_MKI_SECURITY },
  () => {
    let credentials: RoleApiCredentials;
    // Serverless projects differ in their default index mode (vectordb defaults to `vectordb_document`),
    // so the expected mode is read back from Elasticsearch instead of being hardcoded.
    let expectedIndexMode: string;

    apiTest.beforeAll(async ({ requestAuth }) => {
      credentials = await requestAuth.getApiKey('admin');
    });

    apiTest.beforeEach(async ({ esClient }) => {
      await deleteDataStream(esClient, DATA_STREAM_NAME);
      await createDataStream(esClient, DATA_STREAM_NAME);
      expectedIndexMode =
        (await getDataStream(esClient, DATA_STREAM_NAME)).index_mode ?? 'standard';
    });

    apiTest.afterEach(async ({ esClient }) => {
      await deleteDataStream(esClient, DATA_STREAM_NAME);
    });

    apiTest('lists the data streams', async ({ apiClient }) => {
      const response = await apiClient.get(`${API_BASE_PATH}/data_streams`, {
        headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      const dataStream = (response.body as DataStream[]).find(
        ({ name }) => name === DATA_STREAM_NAME
      );
      expect(dataStream).toBeDefined();

      const { name: indexName, uuid } = dataStream!.indices[0];
      expect(dataStream).toStrictEqual(
        expectedDataStream({
          name: DATA_STREAM_NAME,
          indexName,
          uuid,
          health: expectedHealth,
          lifecycle: expectedLifecycle,
          indexMode: expectedIndexMode,
        })
      );
    });

    apiTest('includes stats when asked for them', async ({ apiClient }) => {
      const response = await apiClient.get(`${API_BASE_PATH}/data_streams?includeStats=true`, {
        headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      const dataStream = (response.body as DataStream[]).find(
        ({ name }) => name === DATA_STREAM_NAME
      );
      expect(dataStream).toBeDefined();

      const { storageSize, storageSizeBytes, ...rest } = dataStream!;
      expect(describeStorage(storageSize, storageSizeBytes)).toStrictEqual(expectedStorage);

      const { name: indexName, uuid } = rest.indices[0];
      expect(rest).toStrictEqual({
        ...expectedDataStream({
          name: DATA_STREAM_NAME,
          indexName,
          uuid,
          health: expectedHealth,
          lifecycle: expectedLifecycle,
          indexMode: expectedIndexMode,
        }),
        ...expectedStats,
      });
    });

    apiTest('returns a single data stream by name', async ({ apiClient }) => {
      const response = await apiClient.get(`${API_BASE_PATH}/data_streams/${DATA_STREAM_NAME}`, {
        headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      const { storageSize, storageSizeBytes, ...rest } = response.body;
      expect(describeStorage(storageSize, storageSizeBytes)).toStrictEqual(expectedStorage);

      const { name: indexName, uuid } = rest.indices[0];
      expect(rest).toStrictEqual({
        ...expectedDataStream({
          name: DATA_STREAM_NAME,
          indexName,
          uuid,
          health: expectedHealth,
          lifecycle: expectedLifecycle,
          indexMode: expectedIndexMode,
        }),
        ...expectedStats,
      });
    });
  }
);
