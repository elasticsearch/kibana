/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common';
import {
  createToolHandlerContext,
  createToolTestMocks,
  setupMockCoreStartServices,
} from '../../__mocks__/test_helpers';
import {
  GET_INSTALLABLE_CATALOG_OVERVIEW_INLINE_TOOL_ID,
  createGetInstallableCatalogOverviewTool,
} from './get_installable_catalog_overview_tool';
import { createPrebuiltRuleAssetsClient } from '../../../lib/detection_engine/prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { createPrebuiltRuleObjectsClient } from '../../../lib/detection_engine/prebuilt_rules/logic/rule_objects/prebuilt_rule_objects_client';
import { getInstallableRuleVersions } from '../../../lib/detection_engine/prebuilt_rules/logic/get_installable_rules_for_review';

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
  () => ({
    getInstallableRuleVersions: jest.fn(),
  })
);
jest.mock('../../../lib/machine_learning/authz', () => ({
  buildMlAuthz: jest.fn().mockReturnValue({
    validateRuleType: jest.fn().mockResolvedValue({ valid: true, message: undefined }),
  }),
}));

const mockCreatePrebuiltRuleAssetsClient = jest.mocked(createPrebuiltRuleAssetsClient);
const mockCreatePrebuiltRuleObjectsClient = jest.mocked(createPrebuiltRuleObjectsClient);
const mockGetInstallableRuleVersions = jest.mocked(getInstallableRuleVersions);

const mockMl = { mlSystemProvider: jest.fn() } as unknown as Parameters<
  typeof createGetInstallableCatalogOverviewTool
>[0]['ml'];
const mockLicense = { hasAtLeast: jest.fn() };

const makeVersion = (ruleId: string, version = 1) => ({
  rule_id: ruleId,
  version,
  type: 'query' as const,
});

const createMockDeps = () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const mockCoreStart = setupMockCoreStartServices(mockCore, mockEsClient);

  const mockSavedObjectsClient = {};
  mockCoreStart.savedObjects.getScopedClient = jest.fn().mockReturnValue(mockSavedObjectsClient);

  const mockRulesClientInstance = {};
  const alertingPlugin = {
    getRulesClientWithRequest: jest.fn().mockResolvedValue(mockRulesClientInstance),
  };
  const licensingPlugin = {
    getLicense: jest.fn().mockResolvedValue(mockLicense),
  };

  mockCore.getStartServices.mockResolvedValue([
    mockCoreStart,
    { alerting: alertingPlugin, licensing: licensingPlugin },
    {},
  ] as never);

  const mockRuleAssetsClient = {
    fetchLatestAssets: jest.fn(),
    fetchLatestVersions: jest.fn(),
    fetchAssetsByVersion: jest.fn(),
    fetchTagsByVersion: jest.fn(),
    fetchDeprecatedRules: jest.fn(),
  };
  mockCreatePrebuiltRuleAssetsClient.mockReturnValue(mockRuleAssetsClient);

  const mockRuleObjectsClient = {
    fetchInstalledRulesByIds: jest.fn(),
    fetchInstalledRules: jest.fn(),
    fetchInstalledRuleVersionsByIds: jest.fn(),
    fetchInstalledRuleVersions: jest.fn().mockResolvedValue([]),
  };
  mockCreatePrebuiltRuleObjectsClient.mockReturnValue(mockRuleObjectsClient);

  return {
    getStartServices: mockCore.getStartServices,
    mockLogger,
    mockRequest,
    mockRuleAssetsClient,
    mockRuleObjectsClient,
    mockSavedObjectsClient,
    ml: mockMl,
  };
};

describe('createGetInstallableCatalogOverviewTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool definition', () => {
    it('has the correct tool id constant', () => {
      expect(GET_INSTALLABLE_CATALOG_OVERVIEW_INLINE_TOOL_ID).toBe(
        'security.get_installable_catalog_overview'
      );
    });
  });

  describe('handler — happy path', () => {
    it('returns total count and mapped tags from aggregation', async () => {
      const { getStartServices, mockLogger, mockRequest, mockRuleAssetsClient, ml } =
        createMockDeps();
      // 50 installable rules; tags have overlapping membership so each count is <= 50
      const installableVersions = Array.from({ length: 50 }, (_, i) =>
        makeVersion(`rule-${i + 1}`)
      );
      mockGetInstallableRuleVersions.mockResolvedValue(installableVersions);
      mockRuleAssetsClient.fetchAssetsByVersion.mockResolvedValue({
        assets: [],
        aggregations: {
          facet_tags: {
            buckets: [
              { key: 'OS: Windows', doc_count: 42 },
              { key: 'Tactic: Initial Access', doc_count: 18 },
              { key: 'Domain: LLM', doc_count: 5 },
            ],
          },
        },
      });

      const tool = createGetInstallableCatalogOverviewTool({
        getStartServices,
        logger: mockLogger,
        ml,
      });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      expect('results' in result).toBe(true);
      if ('results' in result) {
        expect(result.results[0].type).toBe(ToolResultType.other);
        expect(result.results[0].data).toEqual({
          total_installable_count: 50,
          tags: [
            { value: 'OS: Windows', count: 42 },
            { value: 'Tactic: Initial Access', count: 18 },
            { value: 'Domain: LLM', count: 5 },
          ],
        });
      }
    });

    it('calls fetchAssetsByVersion with perPage=0 and tags aggregation', async () => {
      const { getStartServices, mockLogger, mockRequest, mockRuleAssetsClient, ml } =
        createMockDeps();
      const installableVersions = [makeVersion('rule-1')];
      mockGetInstallableRuleVersions.mockResolvedValue(installableVersions);
      mockRuleAssetsClient.fetchAssetsByVersion.mockResolvedValue({
        assets: [],
        aggregations: { facet_tags: { buckets: [] } },
      });

      const tool = createGetInstallableCatalogOverviewTool({
        getStartServices,
        logger: mockLogger,
        ml,
      });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      await tool.handler({}, context);

      expect(mockRuleAssetsClient.fetchAssetsByVersion).toHaveBeenCalledWith(
        installableVersions,
        expect.objectContaining({
          perPage: 0,
          aggs: expect.objectContaining({
            facet_tags: expect.objectContaining({
              terms: expect.objectContaining({ field: 'security-rule.tags' }),
            }),
          }),
        })
      );
    });

    it('returns empty tags array when aggregation has no buckets', async () => {
      const { getStartServices, mockLogger, mockRequest, mockRuleAssetsClient, ml } =
        createMockDeps();
      mockGetInstallableRuleVersions.mockResolvedValue([makeVersion('rule-1')]);
      mockRuleAssetsClient.fetchAssetsByVersion.mockResolvedValue({
        assets: [],
        aggregations: { facet_tags: { buckets: [] } },
      });

      const tool = createGetInstallableCatalogOverviewTool({
        getStartServices,
        logger: mockLogger,
        ml,
      });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      expect('results' in result).toBe(true);
      if ('results' in result) {
        expect(result.results[0].data).toEqual({
          total_installable_count: 1,
          tags: [],
        });
      }
    });

    it('returns empty tags array when aggregation is absent', async () => {
      const { getStartServices, mockLogger, mockRequest, mockRuleAssetsClient, ml } =
        createMockDeps();
      mockGetInstallableRuleVersions.mockResolvedValue([makeVersion('rule-1')]);
      mockRuleAssetsClient.fetchAssetsByVersion.mockResolvedValue({ assets: [] });

      const tool = createGetInstallableCatalogOverviewTool({
        getStartServices,
        logger: mockLogger,
        ml,
      });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      expect('results' in result).toBe(true);
      if ('results' in result) {
        expect(result.results[0].data).toEqual({
          total_installable_count: 1,
          tags: [],
        });
      }
    });
  });

  describe('handler — empty catalog', () => {
    it('returns zero count and empty tags without calling fetchAssetsByVersion', async () => {
      const { getStartServices, mockLogger, mockRequest, mockRuleAssetsClient, ml } =
        createMockDeps();
      mockGetInstallableRuleVersions.mockResolvedValue([]);

      const tool = createGetInstallableCatalogOverviewTool({
        getStartServices,
        logger: mockLogger,
        ml,
      });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      expect('results' in result).toBe(true);
      if ('results' in result) {
        expect(result.results[0].type).toBe(ToolResultType.other);
        expect(result.results[0].data).toEqual({
          total_installable_count: 0,
          tags: [],
        });
      }
      expect(mockRuleAssetsClient.fetchAssetsByVersion).not.toHaveBeenCalled();
    });
  });

  describe('handler — error path', () => {
    it('returns ToolResultType.error when getInstallableRuleVersions throws', async () => {
      const { getStartServices, mockLogger, mockRequest, ml } = createMockDeps();
      mockGetInstallableRuleVersions.mockRejectedValue(new Error('ES is down'));

      const tool = createGetInstallableCatalogOverviewTool({
        getStartServices,
        logger: mockLogger,
        ml,
      });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      expect('results' in result).toBe(true);
      if ('results' in result) {
        expect(result.results[0].type).toBe(ToolResultType.error);
        expect((result.results[0].data as { message: string }).message).toContain('ES is down');
      }
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('ES is down'));
    });
  });
});
