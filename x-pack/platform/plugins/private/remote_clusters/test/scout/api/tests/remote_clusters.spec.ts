/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient, RoleApiCredentials } from '@kbn/scout';
import { apiTest } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { REMOTE_CLUSTERS_ADMIN_ROLE } from '../../common/fixtures/constants';
import {
  getOwnTransportAddress,
  removeCluster,
  seedSniffCluster,
} from '../../common/fixtures/remote_cluster_settings';
import {
  API_BASE_PATH,
  CLUSTER_NAME,
  COMMON_HEADERS,
  EXTRA_CLUSTER_NAMES,
  MISSING_CLUSTER_NAME,
} from '../fixtures/constants';

const OWNED_CLUSTER_NAMES = [CLUSTER_NAME, ...EXTRA_CLUSTER_NAMES];

const removeOwnedClusters = (esClient: EsClient) =>
  Promise.all(OWNED_CLUSTER_NAMES.map((name) => removeCluster(esClient, name)));

// Local stateful only: the plugin is disabled on serverless, and the connection assertions below
// need the cluster to sniff its own transport address, which is not a Cloud-safe assumption.
apiTest.describe('Remote clusters API', { tag: ['@local-stateful-classic'] }, () => {
  let credentials: RoleApiCredentials;
  // Seeding a remote with the cluster's own transport address is what makes it report as
  // connected; Scout does not pin the transport port, so it is resolved at runtime.
  let nodeSeed: string;

  apiTest.beforeAll(async ({ requestAuth, esClient }) => {
    credentials = await requestAuth.getApiKeyForCustomRole(REMOTE_CLUSTERS_ADMIN_ROLE);
    nodeSeed = await getOwnTransportAddress(esClient);
  });

  // Remote clusters are cluster-global, so clean up on both sides of every test: a leftover from
  // an interrupted run would break the empty-list expectation.
  apiTest.beforeEach(async ({ esClient }) => {
    await removeOwnedClusters(esClient);
  });

  apiTest.afterEach(async ({ esClient }) => {
    await removeOwnedClusters(esClient);
  });

  apiTest('does not list clusters it has not registered', async ({ apiClient }) => {
    const response = await apiClient.get(API_BASE_PATH, {
      headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);

    const owned = new Set<string>(OWNED_CLUSTER_NAMES);
    const ownedInResponse = response.body.filter((cluster: { name: string }) =>
      owned.has(cluster.name)
    );
    expect(ownedInResponse).toStrictEqual([]);
  });

  apiTest('adds a remote cluster', async ({ apiClient }) => {
    const response = await apiClient.post(API_BASE_PATH, {
      headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
      responseType: 'json',
      body: {
        name: CLUSTER_NAME,
        seeds: [nodeSeed],
        skipUnavailable: true,
        mode: 'sniff',
      },
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body).toStrictEqual({ acknowledged: true });
  });

  apiTest('rejects a cluster whose name already exists', async ({ apiClient, esClient }) => {
    await seedSniffCluster(esClient, CLUSTER_NAME, { seeds: [nodeSeed] });

    const response = await apiClient.post(API_BASE_PATH, {
      headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
      responseType: 'json',
      body: {
        name: CLUSTER_NAME,
        seeds: [nodeSeed],
        skipUnavailable: false,
        mode: 'sniff',
      },
    });

    expect(response).toHaveStatusCode(409);
    expect(response.body).toStrictEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'There is already a remote cluster with that name.',
    });
  });

  apiTest('updates an existing remote cluster', async ({ apiClient, esClient }) => {
    await seedSniffCluster(esClient, CLUSTER_NAME, { seeds: [nodeSeed] });

    const response = await apiClient.put(`${API_BASE_PATH}/${CLUSTER_NAME}`, {
      headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
      responseType: 'json',
      body: {
        skipUnavailable: false,
        seeds: [nodeSeed],
        mode: 'sniff',
        nodeConnections: 3,
      },
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body).toStrictEqual({
      name: CLUSTER_NAME,
      skipUnavailable: false,
      seeds: [nodeSeed],
      isConfiguredByNode: false,
      mode: 'sniff',
      securityModel: 'certificate',
      nodeConnections: 3,
    });
  });

  apiTest('lists a registered cluster once it is connected', async ({ apiClient, esClient }) => {
    await seedSniffCluster(esClient, CLUSTER_NAME, {
      seeds: [nodeSeed],
      nodeConnections: 3,
      skipUnavailable: false,
    });

    // Connecting a remote cluster is asynchronous, so poll until it reports as connected. Allow a
    // generous timeout (the FTR's retry.try defaulted to ~2 minutes) to derisk slow CI machines.
    await expect
      .poll(
        async () => {
          const { body } = await apiClient.get(API_BASE_PATH, {
            headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
            responseType: 'json',
          });
          return body.filter((cluster: { name: string }) => cluster.name === CLUSTER_NAME);
        },
        { timeout: 120_000 }
      )
      .toStrictEqual([
        {
          name: CLUSTER_NAME,
          seeds: [nodeSeed],
          isConnected: true,
          connectedNodesCount: 1,
          maxConnectionsPerCluster: 3,
          initialConnectTimeout: '30s',
          skipUnavailable: false,
          isConfiguredByNode: false,
          mode: 'sniff',
          securityModel: 'certificate',
          nodeConnections: 3,
        },
      ]);
  });

  apiTest('deletes a remote cluster', async ({ apiClient, esClient }) => {
    await seedSniffCluster(esClient, CLUSTER_NAME, { seeds: [nodeSeed] });

    const response = await apiClient.delete(`${API_BASE_PATH}/${CLUSTER_NAME}`, {
      headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body).toStrictEqual({ itemsDeleted: [CLUSTER_NAME], errors: [] });
  });

  apiTest('deletes multiple remote clusters in one request', async ({ apiClient, esClient }) => {
    for (const name of EXTRA_CLUSTER_NAMES) {
      await seedSniffCluster(esClient, name, { seeds: [nodeSeed] });
    }

    const response = await apiClient.delete(`${API_BASE_PATH}/${EXTRA_CLUSTER_NAMES.join(',')}`, {
      headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.errors).toStrictEqual([]);
    // The order isn't guaranteed, so assert on membership rather than on the array itself.
    expect(response.body.itemsDeleted).toStrictEqual(expect.arrayContaining(EXTRA_CLUSTER_NAMES));
  });

  apiTest('reports clusters that could not be deleted', async ({ apiClient }) => {
    const response = await apiClient.delete(`${API_BASE_PATH}/${MISSING_CLUSTER_NAME}`, {
      headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body).toStrictEqual({
      itemsDeleted: [],
      errors: [
        {
          name: MISSING_CLUSTER_NAME,
          error: {
            status: 404,
            payload: { message: 'There is no remote cluster with that name.' },
            options: {
              statusCode: 404,
              body: { message: 'There is no remote cluster with that name.' },
            },
          },
        },
      ],
    });
  });
});
