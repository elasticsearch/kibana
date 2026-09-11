/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import type { RoleApiCredentials } from '@kbn/scout';

import { SNAPSHOT_RESTORE_ADMIN_ROLE } from '../../common/fixtures/constants';
import { API_BASE_PATH, COMMON_HEADERS } from '../fixtures/constants';

apiTest.describe('Snapshot and Restore - repositories', { tag: tags.stateful.classic }, () => {
  let credentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth }) => {
    credentials = await requestAuth.getApiKeyForCustomRole(SNAPSHOT_RESTORE_ADMIN_ROLE);
  });

  apiTest('returns a list of default repository types', async ({ apiClient }) => {
    const response = await apiClient.get(`${API_BASE_PATH}/repository_types`, {
      headers: { ...COMMON_HEADERS, ...credentials.apiKeyHeader },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);

    // Both the Scout stateful cluster (which runs cloud-enabled via `xpack.cloud.id`) and ECH
    // report only module repository types out of the box; the on-prem file system and url types
    // are not available. No extra repository plugins are installed, so nothing else is appended.
    expect(response.body).toStrictEqual(['azure', 'gcs', 's3']);
  });
});
