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
import { ProtectionModes } from '../../../../../common/endpoint/types';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { createToolHandlerContext } from '../../../__mocks__/test_helpers';
import { hashPolicyConfig } from '../domain/hash_policy_config';
import { normalize } from '../domain/normalize_policy_config';
import type { EndpointPolicyManagementService } from '../services/endpoint_policy_management_service';
import type { EndpointPolicyRead } from '../services/read_policy';
import {
  COMPARE_POLICIES_TOOL_ID,
  comparePoliciesSchema,
  createComparePoliciesTool,
  type PolicyComparisonRef,
} from './compare_policies';
import { createPolicyTool } from './create_policy_tool';
import { toPresentationHash } from './trim_policy_result';

jest.mock('./create_policy_tool', () => ({
  createPolicyTool: jest.fn(),
}));

const SPACE_ID = 'space-marketing';
const getStartServices = jest.fn() as unknown as StartServicesAccessor;
const mockedCreatePolicyTool = jest.mocked(createPolicyTool);
const mockService = {
  comparePolicies: jest.fn(),
} as unknown as EndpointPolicyManagementService;
const mockedComparePolicies = jest.mocked(mockService.comparePolicies);

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

const getResult = async (from: PolicyComparisonRef, to: PolicyComparisonRef) => {
  const tool = createComparePoliciesTool({
    endpointAppContextService: createMockEndpointAppContextService(),
    getStartServices,
  });
  const result = await tool.handler({ from, to }, createContext());
  if (!('results' in result)) {
    throw new Error('expected a standard tool result');
  }
  return result.results[0];
};

describe('createComparePoliciesTool', () => {
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
    mockedComparePolicies.mockReset();
  });

  it('registers the approved id, schema, and 12000-token budget without wrapper authorization', () => {
    createComparePoliciesTool({
      endpointAppContextService: createMockEndpointAppContextService(),
      getStartServices,
    });

    expect(mockedCreatePolicyTool).toHaveBeenCalledWith({
      endpointAppContextService: expect.anything(),
      getStartServices,
      id: COMPARE_POLICIES_TOOL_ID,
      description: expect.any(String),
      schema: comparePoliciesSchema,
      maxResultTokens: 12_000,
      run: expect.any(Function),
    });
  });

  it('accepts two live policy refs and rejects invalid refs', () => {
    expect(
      comparePoliciesSchema.parse({
        from: { type: 'policy', idOrName: '  policy-1  ' },
        to: { type: 'policy', idOrName: 'policy-2' },
      })
    ).toEqual({
      from: { type: 'policy', idOrName: 'policy-1' },
      to: { type: 'policy', idOrName: 'policy-2' },
    });
    expect(
      comparePoliciesSchema.safeParse({
        from: { type: 'policy', idOrName: '' },
        to: { type: 'policy', idOrName: 'policy-2' },
      }).success
    ).toBe(false);
  });

  it('presents both service-read sides with digested hashes and truthful totals', async () => {
    const leftRead = createPolicyRead();
    const rightRaw = policyFactory();
    rightRaw.windows.malware.mode = ProtectionModes.detect;
    const rightRead = createPolicyRead({
      policy: { ...leftRead.policy, id: 'policy-2', name: 'Other Policy' },
      normalizedConfig: normalize(rightRaw),
      normalizedHash: hashPolicyConfig(normalize(rightRaw)),
    });
    mockedComparePolicies.mockResolvedValue({
      from: leftRead,
      to: rightRead,
      diffs: [
        { path: 'windows.malware.mode', from: ProtectionModes.prevent, to: ProtectionModes.detect },
      ],
    });

    const result = await getResult(
      { type: 'policy', idOrName: 'policy-1' },
      { type: 'policy', idOrName: 'policy-2' }
    );

    expect(mockedComparePolicies).toHaveBeenCalledWith(
      { type: 'policy', idOrName: 'policy-1' },
      { type: 'policy', idOrName: 'policy-2' }
    );
    expect(result.type).toBe(ToolResultType.other);
    expect(result.data).toEqual(
      expect.objectContaining({
        from: {
          type: 'policy',
          policy: leftRead.policy,
          normalizedHash: toPresentationHash(leftRead.normalizedHash),
        },
        to: {
          type: 'policy',
          policy: rightRead.policy,
          normalizedHash: toPresentationHash(rightRead.normalizedHash),
        },
        normalized_posture_equal: false,
        value_truncated: false,
      })
    );
    expect((result.data as { diffs: unknown[] }).diffs.length).toBeGreaterThan(0);
    expect((result.data as { value_total: number }).value_total).toBe(
      (result.data as { diffs: unknown[] }).diffs.length
    );
  });

  it('returns normalized_posture_equal true when the full deterministic diff is empty', async () => {
    const read = createPolicyRead();
    mockedComparePolicies.mockResolvedValue({ from: read, to: read, diffs: [] });

    const result = await getResult(
      { type: 'policy', idOrName: 'policy-1' },
      { type: 'policy', idOrName: 'policy-1' }
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        normalized_posture_equal: true,
        diffs: [],
        value_total: 0,
        value_truncated: false,
      })
    );
  });

  it('diffs full values first, then presents a budgeted page with truthful totals and parent flags', async () => {
    const leftRead = createPolicyRead();
    const rightRead = createPolicyRead({
      policy: { ...leftRead.policy, id: 'policy-2' },
    });
    const fullDiff = Array.from({ length: 51 }, (_, index) => ({
      path: `windows.advanced.extra_${index}`,
      from: 'x'.repeat(600),
      to: { nested: 'y'.repeat(600) },
    }));
    mockedComparePolicies.mockResolvedValue({
      from: leftRead,
      to: rightRead,
      diffs: fullDiff,
    });

    const result = await getResult(
      { type: 'policy', idOrName: 'policy-1' },
      { type: 'policy', idOrName: 'policy-2' }
    );
    const dto = result.data as {
      diffs: Array<Record<string, unknown>>;
      value_total: number;
      value_truncated: boolean;
    };

    expect(dto.value_total).toBe(51);
    expect(dto.value_truncated).toBe(true);
    expect(dto.diffs.length).toBeGreaterThan(0);
    expect(dto.diffs.length).toBeLessThanOrEqual(50);
    expect(dto.diffs[0]).toEqual(
      expect.objectContaining({
        path: 'windows.advanced.extra_0',
        from: 'x'.repeat(512),
        from_string_truncated: true,
        to: { nested: 'y'.repeat(512), string_truncated: true },
      })
    );
  });

  it('annotates primitive and array from/to truncation on the parent diff entry', async () => {
    const leftRead = createPolicyRead();
    const rightRead = createPolicyRead({
      policy: { ...leftRead.policy, id: 'policy-2' },
    });
    mockedComparePolicies.mockResolvedValue({
      from: leftRead,
      to: rightRead,
      diffs: [
        {
          path: 'windows.advanced.primitive',
          from: 'Y'.repeat(600),
          to: Array.from({ length: 80 }, (_, index) => `item-${index}`),
        },
      ],
    });

    const result = await getResult(
      { type: 'policy', idOrName: 'policy-1' },
      { type: 'policy', idOrName: 'policy-2' }
    );
    const [entry] = (result.data as { diffs: Array<Record<string, unknown>> }).diffs;

    expect(entry).toEqual(
      expect.objectContaining({
        path: 'windows.advanced.primitive',
        to: Array.from({ length: 50 }, (_, index) => `item-${index}`),
        to_value_truncated: true,
        to_value_total: 80,
      })
    );
    expect(JSON.stringify(entry)).not.toContain('item-50');
  });
});
