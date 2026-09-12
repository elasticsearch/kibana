/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common';
import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools';
import type { StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { createToolHandlerContext } from '../../../__mocks__/test_helpers';
import { createPolicyTool } from './create_policy_tool';
import {
  GET_POLICY_FIELD_REFERENCE_TOOL_ID,
  createGetPolicyFieldReferenceTool,
  getPolicyFieldReferenceSchema,
} from './get_policy_field_reference';
import type { ExactFieldReferenceResult } from './get_policy_field_reference';

jest.mock('./create_policy_tool', () => {
  const actual = jest.requireActual('./create_policy_tool');
  return {
    ...actual,
    createPolicyTool: jest.fn((options) => actual.createPolicyTool(options)),
  };
});

const mockedCreatePolicyTool = jest.mocked(createPolicyTool);

const SPACE_ID = 'space-marketing';

const createGetStartServices = (): StartServicesAccessor =>
  jest.fn(async () => [
    { savedObjects: { getScopedClient: jest.fn().mockReturnValue({}) } },
  ]) as unknown as StartServicesAccessor;

const createService = (canReadPolicyManagement: boolean) => {
  const endpointAppContextService = createMockEndpointAppContextService();
  const getStartServices = createGetStartServices();
  const scopedFleet = endpointAppContextService.getInternalFleetServices();

  endpointAppContextService.getInternalFleetServices.mockReset();
  endpointAppContextService.getInternalFleetServices.mockReturnValue(scopedFleet);
  endpointAppContextService.getEndpointAuthz.mockResolvedValue(
    getEndpointAuthzInitialStateMock({
      canReadPolicyManagement,
      canReadEndpointList: false,
      canWritePolicyManagement: false,
    })
  );

  return { endpointAppContextService, getStartServices };
};

const createContext = (): ToolHandlerContext => {
  const request = httpServerMock.createKibanaRequest();
  return createToolHandlerContext(
    request,
    elasticsearchClientMock.createScopedClusterClient(),
    loggingSystemMock.createLogger(),
    { spaceId: SPACE_ID }
  );
};

const createTool = (canReadPolicyManagement = true) =>
  createGetPolicyFieldReferenceTool(createService(canReadPolicyManagement));

const getResult = async (path: string, canReadPolicyManagement = true) => {
  const tool = createTool(canReadPolicyManagement);
  const result = await tool.handler({ path }, createContext());
  if (!('results' in result)) {
    throw new Error('expected a standard tool result');
  }
  return result.results[0];
};

describe('createGetPolicyFieldReferenceTool', () => {
  it('defines a builtin field-reference tool with the approved id and schema', () => {
    const deps = createService(true);
    createGetPolicyFieldReferenceTool(deps);

    expect(mockedCreatePolicyTool).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointAppContextService: deps.endpointAppContextService,
        getStartServices: deps.getStartServices,
        id: GET_POLICY_FIELD_REFERENCE_TOOL_ID,
        schema: getPolicyFieldReferenceSchema,
      })
    );
  });

  it('returns the exact registry entry for a typed event path', async () => {
    const result = await getResult('linux.events.dns');

    expect(result.type).toBe(ToolResultType.other);
    expect(result.data).toEqual({
      found: true,
      match: 'exact',
      path: 'linux.events.dns',
      documentationAvailability: 'absent',
      longFormGuidance: 'not_retrieved_by_this_tool',
      entry: expect.objectContaining({
        path: 'linux.events.dns',
      }),
    });
    const exact = result.data as ExactFieldReferenceResult;
    expect(exact).not.toHaveProperty('content');
    expect(JSON.stringify(exact)).not.toContain('"longFormGuidance":"unavailable"');
  });

  it('returns a successful unknown miss for an invented path', async () => {
    const result = await getResult('windows.turbo_mode');

    expect(result.type).toBe(ToolResultType.other);
    expect(result.data).toEqual({
      found: false,
      match: 'none',
      path: 'windows.turbo_mode',
      reason: 'unknown_path',
    });
  });

  it('expands a valid OS-less non-protection remainder to exact per-OS facts', async () => {
    const result = await getResult('behavior_protection.reputation_service');

    expect(result.type).toBe(ToolResultType.other);
    expect(result.data).toEqual({
      found: true,
      match: 'os_less_remainder',
      path: 'behavior_protection.reputation_service',
      longFormGuidance: 'not_retrieved_by_this_tool',
      entries: expect.any(Array),
    });

    const { entries } = result.data as {
      entries: Array<{
        documentationAvailability: 'absent' | 'present';
        entry: { path: string; documentation?: string };
      }>;
    };
    expect(entries.map((row) => row.entry.path).sort()).toEqual([
      'linux.behavior_protection.reputation_service',
      'mac.behavior_protection.reputation_service',
      'windows.behavior_protection.reputation_service',
    ]);
    expect(entries.every((row) => row.documentationAvailability === 'absent')).toBe(true);
  });

  it('keeps a wrong-OS exact path unknown instead of falling through to the remainder', async () => {
    const result = await getResult('linux.ransomware.mode');

    expect(result.type).toBe(ToolResultType.other);
    expect(result.data).toEqual({
      found: false,
      match: 'none',
      path: 'linux.ransomware.mode',
      reason: 'unknown_path',
    });
  });

  it('keeps mixed protection-key documentation availability on each expanded entry', async () => {
    const result = await getResult('ransomware.mode');

    expect(result.type).toBe(ToolResultType.other);
    expect(result.data).toEqual({
      found: true,
      match: 'protection_key_path',
      path: 'ransomware.mode',
      longFormGuidance: 'not_retrieved_by_this_tool',
      entries: expect.any(Array),
    });

    const { entries } = result.data as {
      entries: Array<{
        documentationAvailability: 'absent' | 'present';
        entry: { path: string; documentation?: string };
      }>;
    };
    expect(entries.map((row) => row.entry.path)).toEqual([
      'windows.ransomware.mode',
      'mac.ransomware.mode',
    ]);
    expect(entries[0]).toEqual({
      documentationAvailability: 'absent',
      entry: expect.objectContaining({ path: 'windows.ransomware.mode' }),
    });
    expect(entries[0]?.entry).not.toHaveProperty('documentation');
    expect(entries[1]).toEqual({
      documentationAvailability: 'present',
      entry: expect.objectContaining({
        path: 'mac.ransomware.mode',
        documentation: expect.stringContaining('Enable ransomware protection for macOS'),
      }),
    });
  });

  it('rejects extra keys instead of silently ignoring them', () => {
    expect(
      getPolicyFieldReferenceSchema.safeParse({ path: 'linux.events.dns', os: 'linux' }).success
    ).toBe(false);
    expect(getPolicyFieldReferenceSchema.safeParse({ path: 'linux.events.dns' }).success).toBe(
      true
    );
  });
});
