/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CreateAgentlessPolicyRequest } from '@kbn/fleet-plugin/common/types/rest_spec/agentless_policy';
import type { ScoutPage } from '@kbn/scout-security';

// Use the Fleet plugin's typed request body
type AgentlessPolicyRequestBody = CreateAgentlessPolicyRequest['body'];

export async function mockPackagePoliciesEmpty(page: ScoutPage) {
  await page.route(/\/api\/fleet\/package_policies/, async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, perPage: 1000 }),
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockAgentPoliciesCreate(page: ScoutPage) {
  await page.route(/\/api\/fleet\/agent_policies/, async (route, request) => {
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          item: { id: `mock-agent-${Date.now()}`, name: body.name, namespace: body.namespace },
        }),
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockPackagePoliciesEmptyWithCapture(
  page: ScoutPage,
  onPostCapture: (body: Record<string, unknown>) => any
) {
  await page.route(/\/api\/fleet\/package_policies/, async (route, request) => {
    if (request.method() === 'GET') {
      // Mock empty list for form initialization
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          total: 0,
          page: 1,
          perPage: 1000,
        }),
      });
    } else if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const responseBody = onPostCapture(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseBody),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Creates a mock agentless policy response for testing.
 * The response format matches the AgentlessPolicy shape returned by the API.
 */
export function createMockAgentlessPolicyResponse(
  requestBody: AgentlessPolicyRequestBody,
  connectorId?: string
) {
  const mockPolicyId = `mock-policy-${Date.now()}`;
  const mockConnectorId = connectorId || `mock-connector-${Date.now()}`;
  const now = new Date().toISOString();

  return {
    item: {
      id: mockPolicyId,
      name: requestBody.name,
      namespace: requestBody.namespace || 'default',
      package: requestBody.package,
      inputs: requestBody.inputs ?? {},
      vars: requestBody.vars,
      global_data_tags: requestBody.global_data_tags,
      cloud_connector: requestBody.cloud_connector?.enabled
        ? { enabled: true, cloud_connector_id: mockConnectorId }
        : null,
      created_at: now,
      created_by: 'test_user',
      updated_at: now,
      updated_by: 'test_user',
    },
  };
}

/**
 * Mocks the agentless policies API route, capturing POST requests and returning mock responses.
 */
export async function mockAgentlessPoliciesWithCapture(
  page: ScoutPage,
  onPostCapture: (body: AgentlessPolicyRequestBody) => void,
  connectorId?: string
) {
  await page.route(/\/api\/fleet\/agentless_policies/, async (route, request) => {
    if (request.method() === 'POST') {
      const capturedRequestBody = request.postDataJSON() as AgentlessPolicyRequestBody;
      onPostCapture(capturedRequestBody);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockAgentlessPolicyResponse(capturedRequestBody, connectorId)),
      });
    } else {
      await route.continue();
    }
  });
}
