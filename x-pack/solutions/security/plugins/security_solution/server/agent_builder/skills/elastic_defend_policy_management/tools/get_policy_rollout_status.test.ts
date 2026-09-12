/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import type { StartServicesAccessor } from '@kbn/core/server';
import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { createPolicyTool } from './create_policy_tool';
import {
  GET_POLICY_ROLLOUT_STATUS_TOOL_ID,
  createGetPolicyRolloutStatusTool,
  getPolicyRolloutStatusSchema,
} from './get_policy_rollout_status';

jest.mock('./create_policy_tool', () => {
  const actual = jest.requireActual('./create_policy_tool');
  return {
    ...actual,
    createPolicyTool: jest.fn((options) => actual.createPolicyTool(options)),
  };
});

const mockedCreatePolicyTool = jest.mocked(createPolicyTool);

const getStartServices = jest.fn(async () => [
  { savedObjects: { getScopedClient: jest.fn().mockReturnValue({}) } },
]) as unknown as StartServicesAccessor;

const createAuthorizedService = () => {
  const endpointAppContextService = createMockEndpointAppContextService();
  endpointAppContextService.getEndpointAuthz.mockResolvedValue(
    getEndpointAuthzInitialStateMock({
      canReadSecuritySolution: true,
      canReadPolicyManagement: true,
      canReadEndpointList: true,
      canWritePolicyManagement: false,
    })
  );
  return endpointAppContextService;
};

describe('createGetPolicyRolloutStatusTool', () => {
  it('registers the approved id, schema, and 8000-token budget', () => {
    const endpointAppContextService = createAuthorizedService();
    const tool = createGetPolicyRolloutStatusTool({
      endpointAppContextService,
      getStartServices,
    });

    expect(mockedCreatePolicyTool).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointAppContextService,
        getStartServices,
        id: GET_POLICY_ROLLOUT_STATUS_TOOL_ID,
        schema: getPolicyRolloutStatusSchema,
        maxResultTokens: 8_000,
      })
    );
    expect(tool.id).toBe(GET_POLICY_ROLLOUT_STATUS_TOOL_ID);
    expect(tool.type).toBe(ToolType.builtin);
    expect(tool.maxResultTokens).toBe(8_000);
    expect(tool.schema).toBe(getPolicyRolloutStatusSchema);

    const description = mockedCreatePolicyTool.mock.calls.at(-1)?.[0].description;
    expect(description).toContain(
      'latest policy responses for the bounded assignment-matched agents'
    );
    expect(description).toContain(
      'zero needs_attention_hosts applies only to the assignment-matched agents and available response evidence'
    );
  });
});
