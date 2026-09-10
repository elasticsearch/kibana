/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture, KibanaRole } from '@kbn/scout-oblt';
import { apiTest, mergeSyntheticsApiHeaders, SYNTHETICS_API_URLS } from '../../../common/fixtures';

const UPTIME_READ_NO_INDEX: KibanaRole = {
  elasticsearch: { cluster: [] },
  kibana: [{ base: [], feature: { uptime: ['read'] }, spaces: ['*'] }],
};

const UPTIME_READ_WITH_INDEX: KibanaRole = {
  elasticsearch: {
    cluster: [],
    indices: [{ names: ['synthetics-*'], privileges: ['read'] }],
  },
  kibana: [{ base: [], feature: { uptime: ['read'] }, spaces: ['*'] }],
};

apiTest.describe(
  'Synthetics index privileges',
  {
    tag: ['@local-stateful-classic', '@local-serverless-observability_complete'],
  },
  () => {
    const getIndexPrivileges = (apiClient: ApiClientFixture, headers: Record<string, string>) =>
      apiClient.get(SYNTHETICS_API_URLS.INDEX_PRIVILEGES.replace(/^\//, ''), {
        headers,
        responseType: 'json',
      });

    apiTest(
      'returns canRead true for a user with synthetics-* read',
      async ({ apiClient, requestAuth }) => {
        const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(UPTIME_READ_WITH_INDEX);
        const res = await getIndexPrivileges(apiClient, mergeSyntheticsApiHeaders(apiKeyHeader));
        expect(res).toHaveStatusCode(200);
        expect(res.body).toStrictEqual({ canRead: true });
      }
    );

    apiTest(
      'returns canRead false for a user with Kibana Synthetics access but no synthetics-* read',
      async ({ apiClient, requestAuth }) => {
        const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(UPTIME_READ_NO_INDEX);
        const res = await getIndexPrivileges(apiClient, mergeSyntheticsApiHeaders(apiKeyHeader));
        expect(res).toHaveStatusCode(200);
        expect(res.body).toStrictEqual({ canRead: false });
      }
    );
  }
);
