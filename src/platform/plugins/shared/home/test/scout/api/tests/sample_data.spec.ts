/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { randomUUID } from 'crypto';
import type { RoleApiCredentials } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import {
  apiTest,
  FLIGHTS_DATASET_ID,
  FLIGHTS_ES_INDEX,
  FLIGHTS_OVERVIEW_DASHBOARD_ID,
  FLIGHTS_DATA_TIME_SPAN_MS,
  COMMON_HEADERS,
} from '../fixtures';

// UUID suffix keeps saved objects isolated to their own space across concurrent CI runs.
const TEST_SPACE_ID = `scout-sd-${randomUUID().slice(0, 8)}`;

const sampleDataApiPath = (space: string) => `/s/${space}/api/sample_data`;

apiTest.describe('sample data API', { tag: tags.stateful.classic }, () => {
  let credentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth, kbnClient }) => {
    credentials = await requestAuth.getApiKeyForAdmin();

    await kbnClient.spaces.create({ id: TEST_SPACE_ID, name: 'Scout sample data test space' });
  });

  // Guarantee the default space is left clean after every test. The flights dashboard is a
  // multiple-isolated saved object, so a canonical-ID copy leaked into the default space by a
  // mid-test failure would force the importer to regenerate the ID when the non-default-space
  // test installs, breaking its ID-preservation assertion. uninstall is idempotent, so this is
  // safe to run even when nothing is installed.
  apiTest.afterEach(async ({ apiClient }) => {
    await apiClient.delete(`${sampleDataApiPath('default')}/${FLIGHTS_DATASET_ID}`, {
      headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
    });
  });

  apiTest.afterAll(async ({ kbnClient }) => {
    await kbnClient.spaces.delete(TEST_SPACE_ID);
  });

  // ---------------------------------------------------------------------------
  // Negative path
  // ---------------------------------------------------------------------------

  apiTest('returns 404 for an unknown dataset ID', async ({ apiClient }) => {
    const response = await apiClient.post('/api/sample_data/xxxx', {
      headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
    });

    expect(response).toHaveStatusCode(404);
  });

  // ---------------------------------------------------------------------------
  // Default space: full lifecycle
  // ---------------------------------------------------------------------------

  apiTest(
    'default space: list, install, verify timestamps and counts, uninstall',
    async ({ apiClient, esClient }) => {
      const apiPath = sampleDataApiPath('default');

      await apiTest.step(
        'install returns 200 with correct ES index and saved object counts',
        async () => {
          const response = await apiClient.post(`${apiPath}/${FLIGHTS_DATASET_ID}`, {
            headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
            responseType: 'json',
          });
          expect(response).toHaveStatusCode(200);
          expect(response.body).toStrictEqual({
            elasticsearchIndicesCreated: { [FLIGHTS_ES_INDEX]: 13014 },
            kibanaSavedObjectsLoaded: 7,
          });
        }
      );

      await apiTest.step(
        'ES index contains timestamps relative to current time (no ?now= param)',
        async () => {
          // Sample data is bulk-inserted without a refresh, so wait for the docs to become
          // searchable before reading them back; otherwise the search can race the refresh
          // interval and return zero hits.
          await esClient.indices.refresh({ index: FLIGHTS_ES_INDEX });
          const result = await esClient.search<{ timestamp: string }>({
            index: FLIGHTS_ES_INDEX,
            sort: [{ timestamp: { order: 'desc' } }],
          });
          const latestTimestampMs = Date.parse(result.hits.hits[0]._source!.timestamp);
          const delta = Math.abs(Date.now() - latestTimestampMs);
          expect(delta).toBeLessThan(FLIGHTS_DATA_TIME_SPAN_MS);
        }
      );

      await apiTest.step(
        'ES index timestamps shift to match the ?now= parameter on reinstall',
        async () => {
          const nowString = '2000-01-01T00:00:00';
          const reinstallResponse = await apiClient.post(
            `${apiPath}/${FLIGHTS_DATASET_ID}?now=${encodeURIComponent(nowString)}`,
            { headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader } }
          );
          expect(reinstallResponse).toHaveStatusCode(200);
          // Reinstall recreates the index and bulk-inserts without a refresh; wait for the
          // docs to be searchable before reading them back.
          await esClient.indices.refresh({ index: FLIGHTS_ES_INDEX });
          const result = await esClient.search<{ timestamp: string }>({
            index: FLIGHTS_ES_INDEX,
            sort: [{ timestamp: { order: 'desc' } }],
          });
          const latestTimestampMs = Date.parse(result.hits.hits[0]._source!.timestamp);
          const delta = Math.abs(Date.parse(nowString) - latestTimestampMs);
          expect(delta).toBeLessThan(FLIGHTS_DATA_TIME_SPAN_MS);
        }
      );

      await apiTest.step('list returns installed status after install', async () => {
        const response = await apiClient.get(apiPath, {
          headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
          responseType: 'json',
        });
        expect(response).toHaveStatusCode(200);
        const flights = findFlightsDataset(response.body);
        expect(flights.status).toBe('installed');
        expect(flights.overviewDashboard).toBe(FLIGHTS_OVERVIEW_DASHBOARD_ID);
      });

      await apiTest.step('uninstall returns 204', async () => {
        const response = await apiClient.delete(`${apiPath}/${FLIGHTS_DATASET_ID}`, {
          headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
        });
        expect(response).toHaveStatusCode(204);
      });

      await apiTest.step('ES index is removed after uninstall', async () => {
        const indexExists = await esClient.indices.exists({ index: FLIGHTS_ES_INDEX });
        expect(indexExists).toBe(false);
      });

      await apiTest.step('list returns not_installed status after uninstall', async () => {
        const response = await apiClient.get(apiPath, {
          headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
          responseType: 'json',
        });
        expect(response).toHaveStatusCode(200);
        const flights = findFlightsDataset(response.body);
        expect(flights.status).toBe('not_installed');
        expect(flights.overviewDashboard).toBe(FLIGHTS_OVERVIEW_DASHBOARD_ID);
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Non-default space: ID preservation + full lifecycle
  // ---------------------------------------------------------------------------

  apiTest(
    'non-default space: install and uninstall work correctly; saved object IDs are preserved',
    async ({ apiClient, esClient }) => {
      const apiPath = sampleDataApiPath(TEST_SPACE_ID);

      await apiTest.step(
        'install returns 200 with correct ES index and saved object counts',
        async () => {
          const response = await apiClient.post(`${apiPath}/${FLIGHTS_DATASET_ID}`, {
            headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
            responseType: 'json',
          });
          expect(response).toHaveStatusCode(200);
          expect(response.body).toStrictEqual({
            elasticsearchIndicesCreated: { [FLIGHTS_ES_INDEX]: 13014 },
            kibanaSavedObjectsLoaded: 7,
          });
        }
      );

      await apiTest.step(
        'list shows installed status and the canonical overviewDashboard ID in non-default space',
        async () => {
          const response = await apiClient.get(apiPath, {
            headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
            responseType: 'json',
          });
          expect(response).toHaveStatusCode(200);
          const flights = findFlightsDataset(response.body);
          expect(flights.status).toBe('installed');
          // The installer uses createNewCopies: false, so saved object IDs are identical across all spaces.
          expect(flights.overviewDashboard).toBe(FLIGHTS_OVERVIEW_DASHBOARD_ID);
        }
      );

      await apiTest.step('uninstall returns 204', async () => {
        const response = await apiClient.delete(`${apiPath}/${FLIGHTS_DATASET_ID}`, {
          headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
        });
        expect(response).toHaveStatusCode(204);
      });

      await apiTest.step('ES index is removed after uninstall', async () => {
        const indexExists = await esClient.indices.exists({ index: FLIGHTS_ES_INDEX });
        expect(indexExists).toBe(false);
      });

      await apiTest.step('list returns not_installed status after uninstall', async () => {
        const response = await apiClient.get(apiPath, {
          headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
          responseType: 'json',
        });
        expect(response).toHaveStatusCode(200);
        const flights = findFlightsDataset(response.body);
        expect(flights.status).toBe('not_installed');
        expect(flights.overviewDashboard).toBe(FLIGHTS_OVERVIEW_DASHBOARD_ID);
      });
    }
  );
});

function findFlightsDataset(
  body: Array<{ id: string; status: string; overviewDashboard: string }>
) {
  const dataset = body.find(({ id }) => id === FLIGHTS_DATASET_ID);
  if (!dataset) {
    throw new Error(`"${FLIGHTS_DATASET_ID}" dataset not found in sample data list response`);
  }
  return dataset;
}
