/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { RoleApiCredentials } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { apiTest, testData } from '../../fixtures';

apiTest.describe('UptimeIntegrationDeprecation', { tag: tags.stateful.classic }, () => {
  let adminCredentials: RoleApiCredentials;
  let agentPolicyId: string;
  let syntheticsVersion: string;

  apiTest.beforeAll(async ({ apiClient, requestAuth }) => {
    adminCredentials = await requestAuth.getApiKey('admin');

    // Resolve the synthetics package version from the registry at runtime and
    // install it explicitly. A hardcoded legacy version (e.g. `0.10.2`) ages out
    // of the throwaway EPR `:lite` registry used by Scout, causing the package
    // policy creation below to 404. Mirrors the sibling synthetics Scout tests.
    const pkgResponse = await apiClient.get('api/fleet/epm/packages/synthetics', {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });
    expect(pkgResponse.statusCode).toBe(200);
    syntheticsVersion = pkgResponse.body.item.latestVersion ?? pkgResponse.body.item.version;

    const installResponse = await apiClient.post(
      `api/fleet/epm/packages/synthetics/${syntheticsVersion}`,
      {
        headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
        body: { force: true },
        responseType: 'json',
      }
    );
    expect(installResponse.statusCode).toBe(200);

    const response = await apiClient.post('api/fleet/agent_policies', {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      body: {
        name: `Test policy ${uuidv4()}`,
        namespace: 'default',
      },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
    agentPolicyId = response.body.item.id;
  });

  apiTest.afterAll(async ({ apiClient }) => {
    const response = await apiClient.post('api/fleet/agent_policies/delete', {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      body: { agentPolicyId },
      responseType: 'json',
    });
    expect(response.statusCode).toBe(200);
  });

  apiTest('returns false when no zip url policies', async ({ apiClient }) => {
    const response = await apiClient.get(
      testData.API_URLS.SYNTHETICS_HAS_INTEGRATION_MONITORS.slice(1),
      {
        headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
        responseType: 'json',
      }
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.hasIntegrationMonitors).toBe(false);
  });

  apiTest('returns true when non-managed synthetics policies exist', async ({ apiClient }) => {
    const createPolicyResponse = await apiClient.post('api/fleet/package_policies', {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      body: {
        name: `synthetics-test ${uuidv4()}`,
        description: '',
        namespace: 'default',
        policy_id: agentPolicyId,
        enabled: true,
        // The deprecation endpoint only counts non-managed synthetics package
        // policies, so the specific input type is irrelevant to the assertion.
        // A minimal supported input avoids coupling to the removed legacy
        // `source.zip_url.*` browser input.
        inputs: [{ type: 'synthetics/http', enabled: true, streams: [] }],
        package: {
          name: 'synthetics',
          title: 'For Synthetics Tests',
          version: syntheticsVersion,
        },
      },
      responseType: 'json',
    });
    expect(createPolicyResponse.statusCode).toBe(200);

    const policyId = createPolicyResponse.body.item.id;

    const response = await apiClient.get(
      testData.API_URLS.SYNTHETICS_HAS_INTEGRATION_MONITORS.slice(1),
      {
        headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
        responseType: 'json',
      }
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.hasIntegrationMonitors).toBe(true);

    const deletePolicyResponse = await apiClient.post('api/fleet/package_policies/delete', {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      body: { force: true, packagePolicyIds: [policyId] },
      responseType: 'json',
    });
    expect(deletePolicyResponse.statusCode).toBe(200);
  });
});
