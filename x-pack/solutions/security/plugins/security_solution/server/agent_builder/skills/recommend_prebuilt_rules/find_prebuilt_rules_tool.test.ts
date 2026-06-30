/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import {
  createToolHandlerContext,
  createToolTestMocks,
  setupMockCoreStartServices,
} from '../../__mocks__/test_helpers';
import {
  FIND_PREBUILT_RULES_INLINE_TOOL_ID,
  createFindPrebuiltRulesInlineTool,
  findPrebuiltRulesSchema,
  reduceMitreToTacticsOnly,
} from './find_prebuilt_rules_tool';
import { buildPrebuiltRulesToolFilter } from './find_prebuilt_rules_filter';
import { createPrebuiltRuleAssetsClient } from '../../../lib/detection_engine/prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { createPrebuiltRuleObjectsClient } from '../../../lib/detection_engine/prebuilt_rules/logic/rule_objects/prebuilt_rule_objects_client';
import { getInstallableRulesForReview } from '../../../lib/detection_engine/prebuilt_rules/logic/get_installable_rules_for_review';
import { buildMlAuthz } from '../../../lib/machine_learning/authz';
import type { RuleResponse } from '../../../../common/api/detection_engine';

jest.mock(
  '../../../lib/detection_engine/prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client',
  () => ({ createPrebuiltRuleAssetsClient: jest.fn() })
);
jest.mock(
  '../../../lib/detection_engine/prebuilt_rules/logic/rule_objects/prebuilt_rule_objects_client',
  () => ({ createPrebuiltRuleObjectsClient: jest.fn() })
);
jest.mock(
  '../../../lib/detection_engine/prebuilt_rules/logic/get_installable_rules_for_review',
  () => ({ getInstallableRulesForReview: jest.fn() })
);
jest.mock('../../../lib/machine_learning/authz', () => ({
  buildMlAuthz: jest.fn().mockReturnValue({
    validateRuleType: jest.fn().mockResolvedValue({ valid: true, message: undefined }),
  }),
}));

const mockCreatePrebuiltRuleAssetsClient = jest.mocked(createPrebuiltRuleAssetsClient);
const mockCreatePrebuiltRuleObjectsClient = jest.mocked(createPrebuiltRuleObjectsClient);
const mockGetInstallableRulesForReview = jest.mocked(getInstallableRulesForReview);
const mockBuildMlAuthz = jest.mocked(buildMlAuthz);

const mockMl = { mlSystemProvider: jest.fn() } as unknown as Parameters<
  typeof createFindPrebuiltRulesInlineTool
>[0]['ml'];
const mockLicense = { hasAtLeast: jest.fn() };

const makeRule = (overrides: Partial<RuleResponse> = {}): RuleResponse =>
  ({
    rule_id: 'rule-1',
    name: 'Test Rule',
    severity: 'high',
    risk_score: 73,
    tags: ['OS: Windows'],
    threat: [
      {
        framework: 'MITRE ATT&CK',
        tactic: { id: 'TA0001', name: 'Initial Access', reference: 'https://example' },
        technique: [
          { id: 'T1059', name: 'Command and Scripting Interpreter', reference: 'https://example' },
        ],
      },
    ],
    related_integrations: [{ package: 'windows', version: '^1.0.0' }],
    ...overrides,
  } as RuleResponse);

const createMockDeps = () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const mockCoreStart = setupMockCoreStartServices(mockCore, mockEsClient);

  mockCoreStart.savedObjects.getScopedClient = jest.fn().mockReturnValue({});

  const alertingPlugin = {
    getRulesClientWithRequest: jest.fn().mockResolvedValue({}),
  };
  const licensingPlugin = {
    getLicense: jest.fn().mockResolvedValue(mockLicense),
  };
  const startPlugins: Record<string, unknown> = {
    alerting: alertingPlugin,
    licensing: licensingPlugin,
  };
  mockCore.getStartServices.mockResolvedValue([mockCoreStart, startPlugins, {}] as never);

  mockCreatePrebuiltRuleAssetsClient.mockReturnValue({
    fetchLatestAssets: jest.fn(),
    fetchLatestVersions: jest.fn(),
    fetchAssetsByVersion: jest.fn(),
    fetchTagsByVersion: jest.fn(),
    fetchDeprecatedRules: jest.fn(),
  });
  mockCreatePrebuiltRuleObjectsClient.mockReturnValue({
    fetchInstalledRulesByIds: jest.fn(),
    fetchInstalledRules: jest.fn(),
    fetchInstalledRuleVersionsByIds: jest.fn(),
    fetchInstalledRuleVersions: jest.fn().mockResolvedValue([]),
  });

  return {
    getStartServices: mockCore.getStartServices,
    mockLogger,
    mockEsClient,
    mockRequest,
    ml: mockMl,
  };
};

describe('reduceMitreToTacticsOnly', () => {
  it('abridges threat to MITRE tactics and passes every other field through unchanged', () => {
    const result = reduceMitreToTacticsOnly(makeRule());
    expect(result).toEqual({
      rule_id: 'rule-1',
      name: 'Test Rule',
      severity: 'high',
      risk_score: 73,
      tags: ['OS: Windows'],
      threat: [{ tactic: { id: 'TA0001', name: 'Initial Access' } }],
      related_integrations: [{ package: 'windows', version: '^1.0.0' }],
    });
  });

  it('abridges absent threat to an empty array', () => {
    const result = reduceMitreToTacticsOnly(makeRule({ threat: undefined }));
    expect(result.threat).toEqual([]);
  });
});

describe('findPrebuiltRulesSchema', () => {
  it('accepts structured filter parameters under `filter`', () => {
    expect(findPrebuiltRulesSchema.safeParse({ filter: { keywords: 'mimikatz' } }).success).toBe(
      true
    );
    expect(findPrebuiltRulesSchema.safeParse({ filter: { ruleType: ['esql'] } }).success).toBe(
      true
    );
    expect(
      findPrebuiltRulesSchema.safeParse({ filter: { mitreTactic: ['TA0001', 'TA0006'] } }).success
    ).toBe(true);
    expect(
      findPrebuiltRulesSchema.safeParse({ filter: { mitreTechnique: ['T1059', 'T1071'] } }).success
    ).toBe(true);
    expect(findPrebuiltRulesSchema.safeParse({ fields: ['description', 'threat'] }).success).toBe(
      true
    );
  });

  it('rejects unknown parameters at the top level and inside `filter`', () => {
    expect(findPrebuiltRulesSchema.safeParse({ ruleSource: 'prebuilt' }).success).toBe(false);
    expect(findPrebuiltRulesSchema.safeParse({ enabled: true }).success).toBe(false);
    // Filter params are not accepted at the top level.
    expect(findPrebuiltRulesSchema.safeParse({ keywords: 'mimikatz' }).success).toBe(false);
    // Unknown keys inside `filter` are rejected too.
    expect(findPrebuiltRulesSchema.safeParse({ filter: { enabled: true } }).success).toBe(false);
  });

  it('rejects malformed MITRE technique IDs', () => {
    expect(
      findPrebuiltRulesSchema.safeParse({ filter: { mitreTechnique: ['TA0001'] } }).success
    ).toBe(false);
    expect(
      findPrebuiltRulesSchema.safeParse({ filter: { mitreTechnique: ['powershell'] } }).success
    ).toBe(false);
    // Sub-techniques (T####.###) are not accepted — the filter only matches the technique id.
    expect(
      findPrebuiltRulesSchema.safeParse({ filter: { mitreTechnique: ['T1059.001'] } }).success
    ).toBe(false);
    // A non-array value is no longer accepted.
    expect(findPrebuiltRulesSchema.safeParse({ filter: { mitreTechnique: 'T1059' } }).success).toBe(
      false
    );
    // Lowercase IDs are rejected — the keyword field is case-sensitive, so a lowercased value
    // would silently match zero rules. Reject it up front so the agent can correct the case.
    expect(
      findPrebuiltRulesSchema.safeParse({ filter: { mitreTechnique: ['t1059'] } }).success
    ).toBe(false);
  });

  it('rejects MITRE tactic values that are not TA-prefixed IDs', () => {
    // Tactic display names must be converted to IDs
    expect(
      findPrebuiltRulesSchema.safeParse({ filter: { mitreTactic: ['Initial Access'] } }).success
    ).toBe(false);
    expect(findPrebuiltRulesSchema.safeParse({ filter: { mitreTactic: ['T1059'] } }).success).toBe(
      false
    );
    // Lowercase IDs are rejected for the same case-sensitivity reason as techniques.
    expect(findPrebuiltRulesSchema.safeParse({ filter: { mitreTactic: ['ta0005'] } }).success).toBe(
      false
    );
  });

  it('caps ruleIds at 50', () => {
    const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);
    expect(findPrebuiltRulesSchema.safeParse({ filter: { ruleIds: ids } }).success).toBe(false);
  });

  it('defaults perPage to 10 and leaves sort unset when omitted', () => {
    const parsed = findPrebuiltRulesSchema.parse({});
    expect(parsed.perPage).toBe(10);
    expect(parsed.sort).toBeUndefined();
  });

  it('defaults sort order to desc when a sort field is given', () => {
    const parsed = findPrebuiltRulesSchema.parse({ sort: { field: 'risk_score' } });
    expect(parsed.sort).toEqual({ field: 'risk_score', order: 'desc' });
  });
});

describe('createFindPrebuiltRulesInlineTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('has the correct id and type', () => {
    const { getStartServices, mockLogger, ml } = createMockDeps();
    const tool = createFindPrebuiltRulesInlineTool({ getStartServices, logger: mockLogger, ml });
    expect(tool.id).toBe(FIND_PREBUILT_RULES_INLINE_TOOL_ID);
    expect(tool.id).toBe('security.find_prebuilt_rules');
    expect(tool.type).toBe(ToolType.builtin);
  });

  describe('handler', () => {
    const runHandler = async (
      input: Record<string, unknown>,
      result: { rules: RuleResponse[]; total: number }
    ) => {
      const { getStartServices, mockLogger, mockEsClient, mockRequest, ml } = createMockDeps();
      mockGetInstallableRulesForReview.mockResolvedValue(result);
      const tool = createFindPrebuiltRulesInlineTool({ getStartServices, logger: mockLogger, ml });
      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      // Parse through the schema so zod defaults (perPage, sort.order) are applied, exactly
      // as the Agent Builder framework does before invoking the handler in production.
      const validatedInput = findPrebuiltRulesSchema.parse(input);
      const toolResult = await tool.handler(validatedInput, context);
      return { toolResult, mockLogger };
    };

    it('builds mlAuthz from the request license and ML plugin and forwards it to the review query', async () => {
      const { getStartServices, mockLogger, mockEsClient, mockRequest, ml } = createMockDeps();
      mockGetInstallableRulesForReview.mockResolvedValue({ rules: [], total: 0 });
      const savedObjectsClient = { tag: 'so-client' };
      const [coreStart] = await getStartServices();
      (coreStart.savedObjects.getScopedClient as jest.Mock).mockReturnValue(savedObjectsClient);
      const builtMlAuthz = {
        validateRuleType: jest.fn().mockResolvedValue({ valid: true, message: undefined }),
      };
      mockBuildMlAuthz.mockReturnValue(builtMlAuthz);

      const tool = createFindPrebuiltRulesInlineTool({ getStartServices, logger: mockLogger, ml });
      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      await tool.handler(findPrebuiltRulesSchema.parse({}), context);

      expect(mockBuildMlAuthz).toHaveBeenCalledWith({
        license: mockLicense,
        ml,
        request: mockRequest,
        savedObjectsClient,
      });
      expect(mockGetInstallableRulesForReview.mock.calls[0][0].mlAuthz).toBe(builtMlAuthz);
    });

    it('passes no KQL filter and the default triage projection for an empty call', async () => {
      await runHandler({}, { rules: [], total: 0 });

      expect(mockGetInstallableRulesForReview).toHaveBeenCalledTimes(1);
      const args = mockGetInstallableRulesForReview.mock.calls[0][0];
      expect(args.filter).toBeUndefined();
      expect(args.page).toBe(1);
      expect(args.perPage).toBe(10);
      expect(args.sort).toBeUndefined();
      expect(args.fields).toEqual([
        'severity',
        'risk_score',
        'tags',
        'threat',
        'related_integrations',
      ]);
    });

    it('delegates filter construction to buildPrebuiltRulesToolFilter and passes the result through', async () => {
      const filter = { keywords: 'mimikatz', severity: ['critical'] };
      await runHandler({ filter }, { rules: [], total: 0 });
      const args = mockGetInstallableRulesForReview.mock.calls[0][0];
      // Assert delegation, not the exact KQL — the string format itself is owned by
      // find_prebuilt_rules_filter.test.ts.
      expect(args.filter).toBe(buildPrebuiltRulesToolFilter(filter));
    });

    it('maps the sort object to the prebuilt-asset sort shape', async () => {
      await runHandler(
        { sort: { field: 'risk_score', order: 'asc' }, perPage: 5 },
        { rules: [], total: 0 }
      );
      const args = mockGetInstallableRulesForReview.mock.calls[0][0];
      expect(args.sort).toEqual([{ field: 'risk_score', order: 'asc' }]);
      expect(args.perPage).toBe(5);
    });

    it('abridges threat to tactics and passes related_integrations through in full', async () => {
      const { toolResult } = await runHandler({}, { rules: [makeRule()], total: 1 });
      expect('results' in toolResult).toBe(true);
      if ('results' in toolResult) {
        const data = toolResult.results[0].data as {
          total: number;
          rules: Array<{
            related_integrations: Array<{ package: string }>;
            threat: unknown[];
          }>;
        };
        expect(toolResult.results[0].type).toBe(ToolResultType.other);
        expect(data.total).toBe(1);
        // `threat` is abridged to tactics only, under the same `threat` key.
        expect(data.rules[0].threat).toEqual([
          { tactic: { id: 'TA0001', name: 'Initial Access' } },
        ]);
        // related_integrations is passed through in full (not trimmed to `package` only).
        expect(data.rules[0].related_integrations).toEqual([
          { package: 'windows', version: '^1.0.0' },
        ]);
        // Deep fields are not pulled in unless requested.
        expect(data.rules[0]).not.toHaveProperty('description');
      }
    });

    it('returns the untrimmed projected rule and widens the projection when deep fields are requested', async () => {
      const deepRule = makeRule({ description: 'Detects mimikatz' } as Partial<RuleResponse>);
      const { toolResult } = await runHandler(
        { fields: ['description', 'threat'] },
        { rules: [deepRule], total: 1 }
      );

      const args = mockGetInstallableRulesForReview.mock.calls[0][0];
      // Triage fields are still fetched, plus the requested deep attributes (projected directly).
      expect(args.fields).toEqual(
        expect.arrayContaining([
          'severity',
          'risk_score',
          'tags',
          'threat',
          'related_integrations',
          'description',
        ])
      );

      if ('results' in toolResult) {
        const data = toolResult.results[0].data as { rules: RuleResponse[] };
        // Not trimmed — the raw projected RuleResponse is returned.
        expect(data.rules[0]).toBe(deepRule);
        expect(data.rules[0].description).toBe('Detects mimikatz');
      }
    });

    it('reports the full total alongside the returned page when results are truncated', async () => {
      const { toolResult } = await runHandler({ perPage: 2 }, { rules: [makeRule()], total: 84 });
      if ('results' in toolResult) {
        const { total, rules } = toolResult.results[0].data as {
          total: number;
          rules: unknown[];
        };
        expect(total).toBe(84);
        expect(rules).toHaveLength(1);
      }
    });

    it('returns an error result when the backend throws', async () => {
      const { getStartServices, mockLogger, mockEsClient, mockRequest, ml } = createMockDeps();
      mockGetInstallableRulesForReview.mockRejectedValue(new Error('ES is down'));
      const tool = createFindPrebuiltRulesInlineTool({ getStartServices, logger: mockLogger, ml });
      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

      const toolResult = await tool.handler({ perPage: 10 }, context);
      if ('results' in toolResult) {
        expect(toolResult.results[0].type).toBe(ToolResultType.error);
        expect((toolResult.results[0].data as { message: string }).message).toContain('ES is down');
      }
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('ES is down'));
    });
  });
});
