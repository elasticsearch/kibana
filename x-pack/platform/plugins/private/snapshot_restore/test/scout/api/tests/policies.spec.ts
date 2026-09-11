/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';

import { apiTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import type { EsClient, RoleApiCredentials } from '@kbn/scout';

import { SNAPSHOT_RESTORE_ADMIN_ROLE } from '../../common/fixtures/constants';
import { API_BASE_PATH, COMMON_HEADERS } from '../fixtures/constants';
import {
  createFsRepository,
  deleteRepository,
  deleteSlmPolicy,
  putSlmPolicy,
} from '../fixtures/es_helpers';

// Namespace all cluster-level resources per run so parallel/orphaned suites can't collide.
const runId = randomUUID().slice(0, 8);
const LOCAL_REPO_NAME = `test_repo_${runId}`;
// Per-run subdir under the registered `path.repo` entry.
const LOCAL_REPO_LOCATION = `/tmp/repo/${runId}`;
// On Cloud the managed `found-snapshots` repository is always present, so SLM policies can
// reference it without creating an `fs` repository (which Cloud forbids).
const CLOUD_REPO_NAME = 'found-snapshots';

const CREATE_POLICY_NAME = `test_create_policy_${runId}`;
const CREATE_REQUIRED_FIELDS_POLICY_NAME = `test_create_required_fields_policy_${runId}`;
const UPDATE_POLICY_NAME = `test_update_policy_${runId}`;
const UPDATE_SNAPSHOT_NAME = 'my_snapshot';

// Runs on local and Cloud. Locally we register a file system (`fs`) repository; on Cloud that is
// forbidden, so we reuse the always-present managed `found-snapshots` repository instead. These
// tests only exercise SLM policy CRUD (no snapshots are taken), so the repository type is
// irrelevant to the assertions.
apiTest.describe('Snapshot and Restore - SLM policies', { tag: tags.stateful.classic }, () => {
  let credentials: RoleApiCredentials;
  let repoName: string;
  // Track created policies so teardown only deletes what exists.
  const createdPolicyNames = new Set<string>();

  const headers = () => ({ ...COMMON_HEADERS, ...credentials.apiKeyHeader });

  apiTest.beforeAll(async ({ requestAuth, esClient, config }) => {
    credentials = await requestAuth.getApiKeyForCustomRole(SNAPSHOT_RESTORE_ADMIN_ROLE);

    if (config.isCloud) {
      repoName = CLOUD_REPO_NAME;
    } else {
      repoName = LOCAL_REPO_NAME;
      await createFsRepository(esClient, repoName, LOCAL_REPO_LOCATION);
    }
  });

  apiTest.afterEach(async ({ esClient }) => {
    await Promise.all([...createdPolicyNames].map((name) => deleteSlmPolicy(esClient, name)));
    createdPolicyNames.clear();
  });

  apiTest.afterAll(async ({ esClient, config }) => {
    if (!config.isCloud) {
      await deleteRepository(esClient, LOCAL_REPO_NAME);
    }
  });

  // Seed a policy directly via ES so the PUT request has something to update.
  const seedUpdatePolicy = async (esClient: EsClient) => {
    await putSlmPolicy(esClient, {
      policyName: UPDATE_POLICY_NAME,
      snapshotName: UPDATE_SNAPSHOT_NAME,
      schedule: '0 30 1 * * ?',
      repository: repoName,
      config: { indices: ['my_index'], ignoreUnavailable: true },
    });
    createdPolicyNames.add(UPDATE_POLICY_NAME);
  };

  apiTest('create: should create a SLM policy', async ({ apiClient, esClient }) => {
    const policyName = CREATE_POLICY_NAME;

    const response = await apiClient.post(`${API_BASE_PATH}/policies`, {
      headers: headers(),
      responseType: 'json',
      body: {
        name: policyName,
        snapshotName: 'my_snapshot',
        schedule: '0 30 1 * * ?',
        repository: repoName,
        config: {
          indices: ['my_index'],
          ignoreUnavailable: true,
          partial: false,
          metadata: {
            meta: 'my_meta',
          },
        },
        retention: {
          expireAfterValue: 1,
          expireAfterUnit: 'd',
          maxCount: 10,
          minCount: 5,
        },
        isManagedPolicy: false,
      },
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body).toStrictEqual({ acknowledged: true });
    createdPolicyNames.add(policyName);

    const policyFromEs = await esClient.slm.getLifecycle({ policy_id: policyName, human: true });
    expect(policyFromEs[policyName].policy).toStrictEqual({
      name: 'my_snapshot',
      schedule: '0 30 1 * * ?',
      repository: repoName,
      config: {
        indices: ['my_index'],
        ignore_unavailable: true,
        partial: false,
        metadata: {
          meta: 'my_meta',
        },
      },
      retention: {
        expire_after: '1d',
        max_count: 10,
        min_count: 5,
      },
    });
  });

  apiTest(
    'create: should create a policy with only required fields',
    async ({ apiClient, esClient }) => {
      const policyName = CREATE_REQUIRED_FIELDS_POLICY_NAME;

      const response = await apiClient.post(`${API_BASE_PATH}/policies`, {
        headers: headers(),
        responseType: 'json',
        // Exclude config and retention
        body: {
          name: policyName,
          snapshotName: 'my_snapshot',
          repository: repoName,
          schedule: '0 30 1 * * ?',
          isManagedPolicy: false,
        },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ acknowledged: true });
      createdPolicyNames.add(policyName);

      const policyFromEs = await esClient.slm.getLifecycle({
        policy_id: policyName,
        human: true,
      });
      expect(policyFromEs[policyName].policy).toStrictEqual({
        name: 'my_snapshot',
        repository: repoName,
        schedule: '0 30 1 * * ?',
      });
    }
  );

  apiTest(
    'update: should allow an existing policy to be updated',
    async ({ apiClient, esClient }) => {
      await seedUpdatePolicy(esClient);

      const response = await apiClient.put(`${API_BASE_PATH}/policies/${UPDATE_POLICY_NAME}`, {
        headers: headers(),
        responseType: 'json',
        body: {
          name: UPDATE_POLICY_NAME,
          snapshotName: UPDATE_SNAPSHOT_NAME,
          schedule: '0 0 0 ? * 7',
          repository: repoName,
          config: {
            indices: ['my_index'],
            ignoreUnavailable: true,
            partial: false,
            metadata: {
              meta: 'my_meta',
            },
          },
          retention: {
            expireAfterValue: 1,
            expireAfterUnit: 'd',
            maxCount: 10,
            minCount: 5,
          },
          isManagedPolicy: false,
        },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ acknowledged: true });

      const policyFromEs = await esClient.slm.getLifecycle({
        policy_id: UPDATE_POLICY_NAME,
        human: true,
      });
      expect(policyFromEs[UPDATE_POLICY_NAME].policy).toStrictEqual({
        name: 'my_snapshot',
        schedule: '0 0 0 ? * 7',
        repository: repoName,
        config: {
          indices: ['my_index'],
          ignore_unavailable: true,
          partial: false,
          metadata: {
            meta: 'my_meta',
          },
        },
        retention: {
          expire_after: '1d',
          max_count: 10,
          min_count: 5,
        },
      });
    }
  );

  apiTest('update: should allow optional fields to be removed', async ({ apiClient, esClient }) => {
    await seedUpdatePolicy(esClient);

    const response = await apiClient.put(`${API_BASE_PATH}/policies/${UPDATE_POLICY_NAME}`, {
      headers: headers(),
      responseType: 'json',
      // Exclude config and retention
      body: {
        name: UPDATE_POLICY_NAME,
        snapshotName: UPDATE_SNAPSHOT_NAME,
        schedule: '0 30 1 * * ?',
        repository: repoName,
        isManagedPolicy: false,
      },
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body).toStrictEqual({ acknowledged: true });

    const policyFromEs = await esClient.slm.getLifecycle({
      policy_id: UPDATE_POLICY_NAME,
      human: true,
    });
    expect(policyFromEs[UPDATE_POLICY_NAME].policy).toStrictEqual({
      name: 'my_snapshot',
      schedule: '0 30 1 * * ?',
      repository: repoName,
    });
  });

  apiTest('show info: should get slm status', async ({ apiClient, esClient }) => {
    // Make sure SLM is running before asserting on its status.
    await esClient.slm.start();

    await expect
      .poll(
        async () => {
          const response = await apiClient.get(`${API_BASE_PATH}/policies/slm_status`, {
            headers: headers(),
            responseType: 'json',
          });
          return response.body;
        },
        { timeout: 30_000 }
      )
      .toStrictEqual({ operation_mode: 'RUNNING' });
  });
});
