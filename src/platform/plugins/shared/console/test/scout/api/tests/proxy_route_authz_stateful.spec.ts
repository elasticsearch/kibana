/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { apiTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { COMMON_HEADERS } from '../fixtures/constants';

// Stateful only: Scout refuses to read built-in Elasticsearch role descriptors on
// Serverless projects, where these roles don't exist.
const PROXY_PATH = `api/console/proxy?method=GET&path=${encodeURIComponent('/_cat')}`;

apiTest.describe(
  'POST /api/console/proxy — authorization for built-in roles',
  { tag: tags.stateful.classic },
  () => {
    apiTest('accepts the kibana_user role', async ({ apiClient, requestAuth }) => {
      const { apiKeyHeader } = await requestAuth.getApiKeyForBuiltInRole('kibana_user');
      const response = await apiClient.post(PROXY_PATH, {
        headers: { ...COMMON_HEADERS, ...apiKeyHeader },
      });

      expect(response).toHaveStatusCode(200);
    });

    apiTest('accepts the kibana_admin role', async ({ apiClient, requestAuth }) => {
      const { apiKeyHeader } = await requestAuth.getApiKeyForBuiltInRole('kibana_admin');
      const response = await apiClient.post(PROXY_PATH, {
        headers: { ...COMMON_HEADERS, ...apiKeyHeader },
      });

      expect(response).toHaveStatusCode(200);
    });
  }
);
