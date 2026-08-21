/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common';
import type { StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { ProductFeatureSecurityKey } from '@kbn/security-solution-features/keys';
import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import { PolicyOperatingSystem, ProtectionModes } from '../../../../../common/endpoint/types';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { createToolHandlerContext } from '../../../__mocks__/test_helpers';
import type { AssessPolicyChangeParams, PolicyChangeFact } from '../domain/impact';
import { assessPolicyChangeParamsSchema } from '../domain/impact';
import type { AssessPolicyChangeDto } from '../services/assess_change';
import { assessChange } from '../services/assess_change';
import { createPolicyTool } from './create_policy_tool';
import {
  ASSESS_POLICY_CHANGE_TOOL_ID,
  assessPolicyChangeSchema,
  createAssessPolicyChangeTool,
} from './assess_policy_change';
import { estimateGuardedEnvelopeTokens, fitsGuardedEnvelope } from './trim_policy_result';

jest.mock('./create_policy_tool', () => {
  const actual = jest.requireActual('./create_policy_tool');
  return {
    ...actual,
    createPolicyTool: jest.fn((options) => actual.createPolicyTool(options)),
  };
});

const mockedCreatePolicyTool = jest.mocked(createPolicyTool);

jest.mock('../services/assess_change', () => ({
  assessChange: jest.fn(),
}));

const SPACE_ID = 'space-marketing';
const getStartServices = jest.fn(async () => [
  { savedObjects: { getScopedClient: jest.fn().mockReturnValue({}) } },
]) as unknown as StartServicesAccessor;
const mockedAssessChange = jest.mocked(assessChange);

const MIXED_STATUS: Readonly<Record<string, number>> = {
  all: 27,
  active: 22,
  online: 14,
  offline: 6,
  updating: 3,
  error: 2,
  inactive: 1,
  unenrolled: 2,
  events: 0,
  other: 1,
  orphaned: 1,
  uninstalled: 1,
  quarantined: 3,
  draining: 4,
};

const VALID_PARAMS: AssessPolicyChangeParams = {
  idOrName: 'policy-1',
  changes: [{ op: 'set_protection_enabled', protection: 'malware', enabled: true }],
};

const createFact = (index: number, path = `windows.malware.mode.${index}`): PolicyChangeFact => ({
  path,
  from: 'off',
  to: ProtectionModes.prevent,
  origin: { operationIndex: 0, op: 'set_protection_enabled', kind: 'direct' },
  registry: {
    path,
    os: [PolicyOperatingSystem.windows],
    kind: 'protection',
    tier: 1,
    documentation: 'malware mode',
    source: 'factory',
    userEditable: true,
  },
  eligibility: { eligible: true },
});

interface AssessmentFixture {
  policy?: Pick<
    AssessPolicyChangeDto['assessment']['policy']['snapshot']['identity'],
    'id' | 'name' | 'revision' | 'version'
  >;
  spaceId?: string;
  requestedOperations?: AssessPolicyChangeParams['changes'];
  changes?: PolicyChangeFact[];
  normalizedDiff?: AssessPolicyChangeDto['assessment']['normalizedDiff'];
  sideEffects?: AssessPolicyChangeDto['assessment']['sideEffects'];
  globalBlockers?: AssessPolicyChangeDto['assessment']['globalBlockers'];
  enrollment?: AssessPolicyChangeDto['enrollment'];
}

const createDto = (overrides: AssessmentFixture = {}): AssessPolicyChangeDto => {
  const policy = overrides.policy ?? {
    id: 'policy-1',
    name: 'Endpoint Policy',
    revision: 3,
    version: 'WzEsMV0=',
  };
  const requestedOperations = overrides.requestedOperations ?? VALID_PARAMS.changes;
  const changes = overrides.changes ?? [createFact(0, 'windows.malware.mode')];
  const normalizedDiff = overrides.normalizedDiff ?? [
    { path: 'windows.malware.mode', from: 'off', to: ProtectionModes.prevent },
  ];
  const sideEffects = overrides.sideEffects ?? [
    {
      path: 'windows.antivirus_registration.enabled',
      from: false,
      to: true,
      reason: 'derived_field_update' as const,
      registry: {
        path: 'windows.antivirus_registration.enabled',
        os: [PolicyOperatingSystem.windows],
        kind: 'other' as const,
        tier: 1,
        source: 'factory' as const,
      },
    },
  ];
  const enrollment = overrides.enrollment ?? {
    population: 'enrolled_agents' as const,
    source: 'fleet_status_aggregation' as const,
    status: MIXED_STATUS,
  };

  return {
    spaceId: overrides.spaceId ?? SPACE_ID,
    enrollment,
    assessment: {
      policy: { snapshot: { identity: policy } } as AssessPolicyChangeDto['assessment']['policy'],
      proposed: {} as AssessPolicyChangeDto['assessment']['proposed'],
      fields: [],
      requestedOperations,
      changes,
      normalizedDiff,
      sideEffects,
      globalBlockers: overrides.globalBlockers ?? [],
    },
  };
};

const createContext = (
  logger: ReturnType<typeof loggingSystemMock.createLogger> = loggingSystemMock.createLogger()
) =>
  createToolHandlerContext(
    httpServerMock.createKibanaRequest(),
    elasticsearchClientMock.createScopedClusterClient(),
    logger,
    { spaceId: SPACE_ID }
  );

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

const getResult = async (
  params: { idOrName: string; changes: AssessPolicyChangeParams['changes'] },
  options: {
    endpointAppContextService?: ReturnType<typeof createMockEndpointAppContextService>;
    ctx?: ReturnType<typeof createContext>;
  } = {}
) => {
  const tool = createAssessPolicyChangeTool({
    endpointAppContextService: options.endpointAppContextService ?? createAuthorizedService(),
    getStartServices,
  });
  const result = await tool.handler(params, options.ctx ?? createContext());
  if (!('results' in result)) {
    throw new Error('expected a standard tool result');
  }
  return result.results[0];
};

describe('createAssessPolicyChangeTool', () => {
  beforeEach(() => {
    mockedAssessChange.mockReset();
  });

  it('registers the approved id, schema, and 12000-token budget', () => {
    const endpointAppContextService = createAuthorizedService();
    const tool = createAssessPolicyChangeTool({
      endpointAppContextService,
      getStartServices,
    });

    expect(mockedCreatePolicyTool).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointAppContextService,
        getStartServices,
        id: ASSESS_POLICY_CHANGE_TOOL_ID,
        schema: assessPolicyChangeSchema,
        maxResultTokens: 12_000,
      })
    );
    expect(tool.id).toBe('security.policy_management.assess_policy_change');
    expect(assessPolicyChangeSchema).toBe(assessPolicyChangeParamsSchema);
  });

  it('presents service DTO fields plus authoritative status map', async () => {
    const manifestFact: PolicyChangeFact = {
      ...createFact(0, 'global_manifest_version'),
      registry: {
        ...createFact(0, 'global_manifest_version').registry,
        productFeatureGate: ProductFeatureSecurityKey.endpointProtectionUpdates,
      },
    };
    mockedAssessChange.mockResolvedValue(
      createDto({
        changes: [manifestFact],
        globalBlockers: [{ reason: 'global_manifest_version_too_old' }],
      })
    );

    const result = await getResult(VALID_PARAMS);
    const presented = result.data as {
      requestedImpact: Array<{
        originKind?: string;
        registryKind?: string;
        origin: Record<string, unknown>;
        registry: { productFeatureGate?: string };
      }>;
      expandedChanges: Array<{
        originKind?: string;
        registryKind?: string;
        origin: Record<string, unknown>;
        registry: Record<string, unknown>;
      }>;
    } & Record<string, unknown>;
    const presentedExpanded = presented.expandedChanges[0];

    expect(presentedExpanded).toEqual(
      expect.objectContaining({
        originKind: 'direct',
        registryKind: 'protection',
        eligibility: { eligible: true },
      })
    );
    expect(presentedExpanded).not.toHaveProperty('kind');
    expect(presentedExpanded.origin).not.toHaveProperty('kind');
    expect(presentedExpanded.registry).not.toHaveProperty('kind');
    expect(presented.requestedImpact[0]?.registry.productFeatureGate).toBe(
      ProductFeatureSecurityKey.endpointProtectionUpdates
    );
    expect(presented.globalBlockers).toEqual([{ reason: 'global_manifest_version_too_old' }]);
    expect(presented).not.toHaveProperty('eligible');
    expect(presented).not.toHaveProperty('license');
    expect(presented).not.toHaveProperty('out_of_date');
    expect(presented).not.toHaveProperty('requested_impact_value_truncated');
  });

  it('annotates trimmed expanded rows and never filters blastRadius.status', async () => {
    const expandedChanges = Array.from({ length: 80 }, (_, index) => createFact(index));
    const normalizedDiff = expandedChanges.map(({ path, from, to }) => ({ path, from, to }));
    mockedAssessChange.mockResolvedValue(
      createDto({
        changes: expandedChanges,
        normalizedDiff,
      })
    );

    const result = await getResult(VALID_PARAMS);
    const presented = result.data as {
      expandedChanges: unknown[];
      normalizedDiff: unknown[];
      globalBlockers: unknown[];
      blastRadius: { status: Record<string, number> };
    } & Record<string, unknown>;

    expect(result.type).toBe(ToolResultType.other);
    expect(presented.expandedChanges).toHaveLength(50);
    expect(presented.normalizedDiff).toHaveLength(50);
    expect(presented).toEqual(
      expect.objectContaining({
        expanded_changes_value_truncated: true,
        expanded_changes_value_total: 80,
        normalized_diff_value_truncated: true,
        normalized_diff_value_total: 80,
      })
    );
    expect(presented.blastRadius.status).toEqual(MIXED_STATUS);
    expect(Object.keys(presented.blastRadius.status)).toEqual(Object.keys(MIXED_STATUS));
    expect(fitsGuardedEnvelope(presented, 12_000)).toBe(true);
    expect(estimateGuardedEnvelopeTokens(presented)).toBeLessThanOrEqual(12_000);
  });

  it('keeps marker and total for a detail array emptied only by trimming', async () => {
    const hugeFact = {
      ...createFact(0, 'windows.malware.mode'),
      origin: {
        operationIndex: 0,
        op: 'set_protection_enabled' as const,
        kind: 'coupled' as const,
      },
      registry: {
        ...createFact(0, 'windows.malware.mode').registry,
        documentation: 'D'.repeat(200_000),
      },
    };
    mockedAssessChange.mockResolvedValue(
      createDto({
        changes: [hugeFact],
        normalizedDiff: [],
        sideEffects: [],
      })
    );

    const result = await getResult(VALID_PARAMS);
    const presented = result.data as {
      requestedOperations: unknown[];
      requestedImpact: unknown[];
      expandedChanges: unknown[];
    } & Record<string, unknown>;

    expect(result.type).toBe(ToolResultType.other);
    expect(presented.requestedOperations).toEqual(VALID_PARAMS.changes);
    expect(presented.requestedImpact).toEqual([]);
    expect(presented.expandedChanges).toEqual([]);
    expect(presented).toEqual(
      expect.objectContaining({
        expanded_changes_value_truncated: true,
        expanded_changes_value_total: 1,
      })
    );
    expect(presented).not.toHaveProperty('requested_impact_value_truncated');
    expect(presented).not.toHaveProperty('requested_impact_value_total');
    expect(fitsGuardedEnvelope(presented, 12_000)).toBe(true);
  });
});
