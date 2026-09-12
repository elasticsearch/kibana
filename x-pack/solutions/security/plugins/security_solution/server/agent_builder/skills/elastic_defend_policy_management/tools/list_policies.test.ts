/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import { createOtherResult } from '@kbn/agent-builder-server';
import type { StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import type { z } from '@kbn/zod/v4';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { createToolHandlerContext } from '../../../__mocks__/test_helpers';
import type { ListPoliciesDto, ListPolicyItem } from '../services/list_endpoint_policies';
import type { EndpointPolicyManagementService } from '../services/endpoint_policy_management_service';
import { policyFactory } from '../../../../../common/endpoint/models/policy_config';
import { hashPolicyConfig } from '../domain/hash_policy_config';
import { normalize } from '../domain/normalize_policy_config';
import { createPolicyTool } from './create_policy_tool';
import { LIST_POLICIES_TOOL_ID, createListPoliciesTool, listPoliciesSchema } from './list_policies';
import { estimateGuardedEnvelopeTokens, toPresentationHash } from './trim_policy_result';

jest.mock('./create_policy_tool', () => ({
  createPolicyTool: jest.fn(),
}));

const SPACE_ID = 'space-marketing';
const getStartServices = jest.fn() as unknown as StartServicesAccessor;
const mockedCreatePolicyTool = jest.mocked(createPolicyTool);
const mockService = {
  listPolicies: jest.fn(),
} as unknown as EndpointPolicyManagementService;
const mockedListPolicies = jest.mocked(mockService.listPolicies);

const createPosture = () => ({
  windowsProtectionModes: {
    malware: 'prevent',
    ransomware: 'prevent',
    memoryThreat: 'prevent',
    behavior: 'prevent',
  },
  macProtectionModes: {
    malware: 'prevent',
    behavior: 'prevent',
  },
  linuxProtectionModes: {
    malware: 'prevent',
    behavior: 'prevent',
  },
  globalTelemetryEnabled: false,
});

const createListItem = (overrides: Partial<ListPolicyItem> = {}): ListPolicyItem => ({
  id: 'policy-1',
  name: 'Endpoint Policy',
  description: 'visible description',
  revision: 3,
  version: 'WzEsMV0=',
  normalizedHash: 'full-list-hash',
  posture: createPosture(),
  ...overrides,
});

const createListDto = (overrides: Partial<ListPoliciesDto> = {}): ListPoliciesDto => ({
  population: 'endpoint_package_policies',
  page: 1,
  per_page: 20,
  items: [createListItem()],
  value_total: 1,
  has_more: false,
  invalid_policy_count: 0,
  ...overrides,
});

const createContext = () =>
  createToolHandlerContext(
    httpServerMock.createKibanaRequest(),
    elasticsearchClientMock.createScopedClusterClient(),
    loggingSystemMock.createLogger(),
    { spaceId: SPACE_ID }
  );

const getResult = async (params: z.input<typeof listPoliciesSchema> = {}) => {
  const parsed = listPoliciesSchema.parse(params);
  const tool = createListPoliciesTool({
    endpointAppContextService: createMockEndpointAppContextService(),
    getStartServices,
  });
  const result = await tool.handler(parsed, createContext());
  if (!('results' in result)) {
    throw new Error('expected a standard tool result');
  }
  return result.results[0];
};

describe('createListPoliciesTool', () => {
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
    mockedListPolicies.mockReset();
  });

  it('registers the approved id, schema, and 8000-token budget without wrapper authorization', () => {
    createListPoliciesTool({
      endpointAppContextService: createMockEndpointAppContextService(),
      getStartServices,
    });

    expect(mockedCreatePolicyTool).toHaveBeenCalledWith({
      endpointAppContextService: expect.anything(),
      getStartServices,
      id: LIST_POLICIES_TOOL_ID,
      description: expect.any(String),
      schema: listPoliciesSchema,
      maxResultTokens: 8_000,
      run: expect.any(Function),
    });
  });

  it('bounds page and perPage at the schema boundary', () => {
    expect(listPoliciesSchema.parse({})).toEqual({
      page: 1,
      perPage: 20,
      includeEndpointUsage: false,
    });
    expect(listPoliciesSchema.parse({ includeEndpointUsage: true })).toEqual({
      page: 1,
      perPage: 20,
      includeEndpointUsage: true,
    });
    expect(listPoliciesSchema.safeParse({ page: 0, perPage: 20 }).success).toBe(false);
    expect(listPoliciesSchema.safeParse({ page: 1, perPage: 51 }).success).toBe(false);
  });

  it('presents the service-read page with the requested paging and digested hashes', async () => {
    const dto = createListDto({ page: 2, per_page: 10, value_total: 21, has_more: true });
    mockedListPolicies.mockResolvedValue(dto);

    const result = await getResult({ page: 2, perPage: 10 });

    expect(mockedListPolicies).toHaveBeenCalledWith({
      page: 2,
      perPage: 10,
      includeEndpointUsage: false,
    });
    expect((result.data as ListPoliciesDto).items[0]?.normalizedHash).toBe(
      toPresentationHash(dto.items[0].normalizedHash)
    );
  });

  it('fits a schema-max real-hash page under 8000 tokens and reports local omissions', async () => {
    const serviceHash = hashPolicyConfig(normalize(policyFactory()));
    mockedListPolicies.mockResolvedValue(
      createListDto({
        per_page: 50,
        value_total: 80,
        has_more: true,
        items: Array.from({ length: 50 }, (_, index) =>
          createListItem({
            id: `policy-${index}`,
            name: 'N'.repeat(512),
            description: 'D'.repeat(512),
            name_string_truncated: true,
            description_string_truncated: true,
            normalizedHash: serviceHash,
          })
        ),
      })
    );

    const result = await getResult({ page: 1, perPage: 50 });
    const dto = result.data as ListPoliciesDto & {
      items_total?: number;
      items_truncated?: true;
    };
    expect(dto.items.length).toBeLessThan(50);
    expect(dto.items[0]?.id).toBe('policy-0');
    expect(dto.items[0]?.normalizedHash).toBe(toPresentationHash(serviceHash));
    expect(dto.items[0]?.normalizedHash).not.toBe(serviceHash);
    expect(dto.value_total).toBe(80);
    expect(dto.has_more).toBe(true);
    expect(dto.items_total).toBe(50);
    expect(dto.items_truncated).toBe(true);
    expect(estimateGuardedEnvelopeTokens(dto)).toBeLessThanOrEqual(8_000);
    expect(JSON.stringify(result)).not.toContain('Output too large');
    expect(JSON.stringify(result)).not.toContain(serviceHash);
  });

  it('presents returned usage classifications and usage_unavailable markers as returned', async () => {
    const serviceHash = 'usage-hash';
    mockedListPolicies.mockResolvedValue({
      ...createListDto({
        items: [
          createListItem({ id: 'used-policy', normalizedHash: serviceHash }),
          createListItem({ id: 'denied-policy', normalizedHash: serviceHash }),
        ],
      }),
      items: [
        {
          ...createListItem({ id: 'used-policy', normalizedHash: serviceHash }),
          usage: { classification: 'used', enrolled: 4 },
        },
        {
          ...createListItem({ id: 'denied-policy', normalizedHash: serviceHash }),
          usage: { classification: 'undetermined', reason: 'requires_endpoint_list_read' },
        },
      ],
      usage_unavailable: 'requires_endpoint_list_read',
    } as never);

    const result = await getResult({ page: 1, perPage: 20, includeEndpointUsage: true });
    const dto = result.data as {
      items: Array<{ id: string; normalizedHash: string; usage?: unknown }>;
      usage_unavailable?: string;
    };

    expect(mockedListPolicies).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
      includeEndpointUsage: true,
    });
    expect(dto.usage_unavailable).toBe('requires_endpoint_list_read');
    expect(dto.items[0]?.usage).toEqual({ classification: 'used', enrolled: 4 });
    expect(dto.items[1]?.usage).toEqual({
      classification: 'undetermined',
      reason: 'requires_endpoint_list_read',
    });
    expect(dto.items[0]?.normalizedHash).toBe(toPresentationHash(serviceHash));
  });
});
