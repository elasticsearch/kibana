/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType, ToolType } from '@kbn/agent-builder-common';
import { createOtherResult } from '@kbn/agent-builder-server';
import type { StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { policyFactory } from '../../../../../common/endpoint/models/policy_config';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { createToolHandlerContext } from '../../../__mocks__/test_helpers';
import { hashPolicyConfig } from '../domain/hash_policy_config';
import { normalize } from '../domain/normalize_policy_config';
import type { EndpointPolicyManagementService } from '../services/endpoint_policy_management_service';
import type { EndpointPolicyRead } from '../services/read_policy';
import { createPolicyTool } from './create_policy_tool';
import { GET_POLICY_TOOL_ID, createGetPolicyTool, getPolicySchema } from './get_policy';
import { estimateGuardedEnvelopeTokens, toPresentationHash } from './trim_policy_result';

jest.mock('./create_policy_tool', () => ({
  createPolicyTool: jest.fn(),
}));

const SPACE_ID = 'space-marketing';
const getStartServices = jest.fn() as unknown as StartServicesAccessor;
const mockedCreatePolicyTool = jest.mocked(createPolicyTool);
const mockService = {
  getPolicy: jest.fn(),
} as unknown as EndpointPolicyManagementService;
const mockedGetPolicy = jest.mocked(mockService.getPolicy);

const createPolicyRead = (overrides: Partial<EndpointPolicyRead> = {}): EndpointPolicyRead => {
  const storedConfig = policyFactory();
  const normalizedConfig = normalize(storedConfig);
  return {
    policy: {
      id: 'policy-1',
      name: 'Endpoint Policy',
      description: 'visible description',
      revision: 3,
      version: 'WzEsMV0=',
      updatedAt: '2024-01-01T00:00:00.000Z',
      updatedBy: 'analyst',
      packageVersion: '8.16.0',
    },
    storedConfig,
    normalizedConfig,
    normalizedHash: hashPolicyConfig(normalizedConfig),
    ...overrides,
  };
};

const createContext = () =>
  createToolHandlerContext(
    httpServerMock.createKibanaRequest(),
    elasticsearchClientMock.createScopedClusterClient(),
    loggingSystemMock.createLogger(),
    { spaceId: SPACE_ID }
  );

const getResult = async (idOrName: string) => {
  const tool = createGetPolicyTool({
    endpointAppContextService: createMockEndpointAppContextService(),
    getStartServices,
  });
  const result = await tool.handler({ idOrName }, createContext());
  if (!('results' in result)) {
    throw new Error('expected a standard tool result');
  }
  return result.results[0];
};

describe('createGetPolicyTool', () => {
  beforeEach(() => {
    mockedCreatePolicyTool.mockImplementation((options) => ({
      id: options.id,
      type: ToolType.builtin,
      description: options.description,
      schema: options.schema,
      maxResultTokens: options.maxResultTokens,
      handler: async (params) => ({
        results: [createOtherResult(await options.run(params, mockService))],
      }),
    }));
    mockedGetPolicy.mockReset();
  });

  it('registers the approved id, schema, and 12000-token budget without wrapper authorization', () => {
    createGetPolicyTool({
      endpointAppContextService: createMockEndpointAppContextService(),
      getStartServices,
    });

    expect(mockedCreatePolicyTool).toHaveBeenCalledWith({
      endpointAppContextService: expect.anything(),
      getStartServices,
      id: GET_POLICY_TOOL_ID,
      description: expect.any(String),
      schema: getPolicySchema,
      maxResultTokens: 12_000,
      run: expect.any(Function),
    });
  });

  it('presents the service-read policy through bounded presentation', async () => {
    const read = createPolicyRead();
    mockedGetPolicy.mockResolvedValue(read);

    const result = await getResult('policy-1');
    const dto = result.data as {
      policy: { id: string };
      normalizedHash: string;
      config: unknown;
    };

    expect(mockedGetPolicy).toHaveBeenCalledWith({ idOrName: 'policy-1' });
    expect(dto.normalizedHash).toBe(toPresentationHash(read.normalizedHash));
    expect(dto.config).toEqual(read.normalizedConfig);
  });

  it('keeps identity and a compact digest for one enormous policy under 12000 tokens', async () => {
    const hugeConfig = normalize(policyFactory());
    const windows = hugeConfig.windows as { advanced?: Record<string, unknown> };
    const advanced: Record<string, unknown> = {
      ...(windows.advanced ?? {}),
      long_string: 'Y'.repeat(10_000),
      huge_array: Array.from({ length: 80 }, (_, index) => `item-${index}`),
    };
    for (let index = 0; index < 50; index += 1) {
      advanced[`k${String(index).padStart(2, '0')}`] = 'N'.repeat(512);
    }
    windows.advanced = advanced;
    const serviceHash = hashPolicyConfig(hugeConfig);
    mockedGetPolicy.mockResolvedValue(
      createPolicyRead({
        normalizedConfig: hugeConfig,
        normalizedHash: serviceHash,
      })
    );

    const result = await getResult('policy-1');
    const dto = result.data as {
      policy: { id: string; name: string; version: string };
      normalizedHash: string;
      config: Record<string, unknown>;
    };
    const serialized = JSON.stringify(result);

    expect(result.type).toBe(ToolResultType.other);
    expect(dto.policy).toEqual(
      expect.objectContaining({
        id: 'policy-1',
        name: 'Endpoint Policy',
        version: 'WzEsMV0=',
      })
    );
    expect(dto.normalizedHash).toBe(toPresentationHash(serviceHash));
    expect(dto.normalizedHash).toHaveLength(64);
    expect(result.data).not.toHaveProperty('normalizedConfig');
    expect(serialized).toContain('policy-1');
    expect(serialized).not.toContain('Y'.repeat(10_000));
    expect(estimateGuardedEnvelopeTokens(dto)).toBeLessThanOrEqual(12_000);
  });
});
