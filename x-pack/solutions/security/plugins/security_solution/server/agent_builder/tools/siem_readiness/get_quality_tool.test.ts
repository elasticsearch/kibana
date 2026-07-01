/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType, type OtherResult } from '@kbn/agent-builder-common';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import type { QualityPayload, CategoriesResponse } from '@kbn/siem-readiness';
import { getIndexCategoryMap } from '@kbn/siem-readiness';
import {
  createToolTestMocks,
  createToolHandlerContext,
  setupMockCoreStartServices,
} from '../../__mocks__/test_helpers';
import { getQualityTool } from './get_quality_tool';
import { getQuality } from '../../../lib/siem_readiness/dimensions';
import {
  getSiemReadinessSharedContext,
  fetchRuleFieldCaps,
} from '../../../lib/siem_readiness/fetchers';

jest.mock('../../../lib/siem_readiness/dimensions', () => ({ getQuality: jest.fn() }));
jest.mock('../../../lib/siem_readiness/fetchers', () => ({
  getSiemReadinessSharedContext: jest.fn(),
  fetchSiemReadinessSharedContext: jest.fn(),
  fetchRuleFieldCaps: jest.fn(),
}));

const mockGetQuality = getQuality as jest.Mock;
const mockGetSharedContext = getSiemReadinessSharedContext as jest.Mock;
const mockFetchRuleFieldCaps = fetchRuleFieldCaps as jest.Mock;

// Quality uses exact-match: DataQualityResultDocument.indexName must be in the category index list.
const IDENTITY_INDEX = 'logs-identity.auth-default';
const CLOUD_INDEX = 'logs-cloud.asset_inventory-default';

const mockCategories: CategoriesResponse = {
  rawCategoriesMap: [],
  mainCategoriesMap: [
    { category: 'Identity', indices: [{ indexName: IDENTITY_INDEX, docs: 300 }] },
    { category: 'Cloud', indices: [{ indexName: CLOUD_INDEX, docs: 150 }] },
  ],
};

// Shared context is now fetched once per request via getSiemReadinessSharedContext (Phase 1),
// which carries the categories the tool filters against — the tool no longer calls fetchCategories.
const mockSharedContext = {
  reverseMapResult: {
    indexToRules: new Map(),
    pipelineToIndices: new Map(),
    categoryToIndices: new Map(),
    tacticTotals: new Map(),
    mlRules: [],
    ruleRequiredFields: new Map(),
    errors: { pipelineMap: false, categoryMap: false, rulesPartial: false },
  },
  categoriesResult: mockCategories,
  indexToPlatform: new Map(),
};

const makePayload = (overrides: Partial<QualityPayload> = {}): QualityPayload => ({
  status: 'healthy',
  summary: 'All checked indices are ECS-compatible.',
  items: [],
  actionableFindings: [],
  missingFieldsByRule: [],
  ...overrides,
});

const makeQualityResult = (indexName: string, incompatibleFieldCount = 0) => ({
  indexName,
  incompatibleFieldCount,
  batchId: 'b1',
  isCheckAll: false,
  checkedAt: Date.now(),
  docsCount: 100,
  totalFieldCount: 50,
  ecsFieldCount: 48,
  customFieldCount: 2,
  sameFamilyFieldCount: 0,
  sameFamilyFields: [],
  sameFamilyFieldItems: [],
  incompatibleFieldMappingItems: [],
  incompatibleFieldValueItems: [],
  unallowedMappingFields: [],
  unallowedValueFields: [],
  sizeInBytes: 1024,
  markdownComments: [],
  ecsVersion: '8.11.0',
  error: null,
});

describe('getQualityTool', () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const tool = getQualityTool(mockCore, mockLogger);

  beforeEach(() => {
    jest.clearAllMocks();
    setupMockCoreStartServices(mockCore, mockEsClient);
    mockGetSharedContext.mockResolvedValue(mockSharedContext);
    // Default: no unmapped rule-required fields, so existing ECS-only assertions hold.
    mockFetchRuleFieldCaps.mockResolvedValue([]);
  });

  describe('handler — category filtering (exact-match)', () => {
    it('filters out results whose indexName is not in any category', async () => {
      mockGetQuality.mockResolvedValueOnce(
        makePayload({
          items: [makeQualityResult('logs-some-uncategorized-index')],
        })
      );

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.items).toHaveLength(0);
    });

    it('keeps results whose indexName is in the category map', async () => {
      mockGetQuality.mockResolvedValueOnce(
        makePayload({
          items: [makeQualityResult(IDENTITY_INDEX, 2), makeQualityResult('logs-uncategorized', 0)],
        })
      );

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.items).toHaveLength(1);
      expect(data.items[0].indexName).toBe(IDENTITY_INDEX);
    });

    it('keeps results from multiple categories', async () => {
      mockGetQuality.mockResolvedValueOnce(
        makePayload({
          items: [makeQualityResult(IDENTITY_INDEX), makeQualityResult(CLOUD_INDEX)],
        })
      );

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.items).toHaveLength(2);
    });
  });

  describe('handler — finding category enrichment', () => {
    it('assigns category to findings matched by indexName', async () => {
      mockGetQuality.mockResolvedValueOnce(
        makePayload({
          items: [makeQualityResult(CLOUD_INDEX, 3)],
          actionableFindings: [
            { severity: 'WARNING', message: '3 incompatible fields', resource: CLOUD_INDEX },
          ],
        })
      );

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.actionableFindings![0].category).toBe('Cloud');
    });

    it('filters out findings whose resource is not in any category', async () => {
      mockGetQuality.mockResolvedValueOnce(
        makePayload({
          items: [],
          actionableFindings: [
            { severity: 'WARNING', message: 'incompatible', resource: 'logs-not-categorized' },
          ],
        })
      );

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.actionableFindings).toHaveLength(0);
    });
  });

  describe('handler — summary recomputation after filtering', () => {
    it('recomputes status and summary from filtered items, not the pre-filter payload', async () => {
      // Orchestrator sees 5 items (3 incompatible), only 2 categorized (1 incompatible).
      mockGetQuality.mockResolvedValueOnce(
        makePayload({
          status: 'actionsRequired',
          summary: '3 of 5 indices have incompatible ECS field mappings.',
          items: [
            makeQualityResult(IDENTITY_INDEX, 2),
            makeQualityResult(CLOUD_INDEX, 0),
            makeQualityResult('logs-uncategorized-1', 3),
            makeQualityResult('logs-uncategorized-2', 1),
            makeQualityResult('logs-uncategorized-3', 0),
          ],
          actionableFindings: [
            { severity: 'WARNING', message: '2 incompatible fields', resource: IDENTITY_INDEX },
            { severity: 'WARNING', message: '3 incompatible', resource: 'logs-uncategorized-1' },
          ],
        })
      );

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.items).toHaveLength(2);
      expect(data.status).toBe('actionsRequired');
      // Summary must reference 1 of 2, not 3 of 5
      expect(data.summary).toContain('1');
      expect(data.summary).toContain('2');
      expect(data.summary).not.toContain('5');
      // Only the categorized finding survives
      expect(data.actionableFindings).toHaveLength(1);
      expect(data.actionableFindings![0].resource).toBe(IDENTITY_INDEX);
    });

    it('reports healthy when all categorized items are compatible, regardless of uncategorized', async () => {
      mockGetQuality.mockResolvedValueOnce(
        makePayload({
          status: 'actionsRequired',
          summary: '2 of 20 indices have incompatible ECS field mappings.',
          items: [
            makeQualityResult(IDENTITY_INDEX, 0),
            makeQualityResult(CLOUD_INDEX, 0),
            makeQualityResult('logs-uncategorized', 2),
          ],
        })
      );

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.status).toBe('healthy');
      // Summary is recomputed from the filtered set, not passed through — so the pre-filter
      // "2 of 20" narrative must not leak into the result.
      expect(data.summary).not.toContain('20');
    });

    it('reports noData when no categorized items survive filtering', async () => {
      mockGetQuality.mockResolvedValueOnce(
        makePayload({
          status: 'actionsRequired',
          summary: 'Some problems found.',
          items: [makeQualityResult('logs-uncategorized', 3)],
        })
      );

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.status).toBe('noData');
    });
  });

  describe('parity — agent tool matches getIndexCategoryMap filter (shared predicate)', () => {
    it('agent data.items contains exactly the items that match the category map', async () => {
      const allItems = [
        makeQualityResult(IDENTITY_INDEX, 0),
        makeQualityResult(CLOUD_INDEX, 1),
        makeQualityResult('logs-uncategorized', 2),
      ];
      mockGetQuality.mockResolvedValueOnce(makePayload({ items: allItems }));

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const agentItemNames = (result.results[0] as OtherResult<QualityPayload>).data.items.map(
        (i) => i.indexName
      );
      const categoryMap = getIndexCategoryMap(mockCategories);
      const sharedFilteredNames = allItems
        .filter((item) => categoryMap.has(item.indexName))
        .map((item) => item.indexName);

      expect(agentItemNames).toEqual(sharedFilteredNames);
    });
  });

  describe('handler — missing rule-required fields (Phase 2.5)', () => {
    const missingFieldsFixture = [
      { ruleId: 'rule-1', ruleName: 'Suspicious Login', missingFields: ['user.name', 'source.ip'] },
      { ruleId: 'rule-2', ruleName: 'Malware Detected', missingFields: ['process.hash.sha256'] },
    ];

    it('returns missingFieldsByRule verbatim from fetchRuleFieldCaps', async () => {
      mockGetQuality.mockResolvedValueOnce(makePayload());
      mockFetchRuleFieldCaps.mockResolvedValueOnce(missingFieldsFixture);

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.missingFieldsByRule).toEqual(missingFieldsFixture);
    });

    it('emits one WARNING missingField finding per unmapped field, naming the rule and field', async () => {
      mockGetQuality.mockResolvedValueOnce(makePayload());
      mockFetchRuleFieldCaps.mockResolvedValueOnce(missingFieldsFixture);

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      const missingFindings = data.actionableFindings!.filter((f) => f.type === 'missingField');

      // One finding per (rule, field) pair: 2 + 1 = 3
      expect(missingFindings).toHaveLength(3);
      expect(missingFindings.every((f) => f.severity === 'WARNING')).toBe(true);
      expect(missingFindings.map((f) => f.resource)).toEqual(
        expect.arrayContaining(['user.name', 'source.ip', 'process.hash.sha256'])
      );

      const userNameFinding = missingFindings.find((f) => f.resource === 'user.name');
      expect(userNameFinding?.message).toContain('Suspicious Login');
      expect(userNameFinding?.message).toContain('user.name');
    });

    it('keeps missingField findings even though their resource is a field name, not a categorized index', async () => {
      // No ECS quality items at all — only rule-required-field findings should come through,
      // and they must survive the category filter (field names are never in the category map).
      mockGetQuality.mockResolvedValueOnce(makePayload({ items: [] }));
      mockFetchRuleFieldCaps.mockResolvedValueOnce(missingFieldsFixture);

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.actionableFindings).toHaveLength(3);
      expect(data.actionableFindings!.every((f) => f.type === 'missingField')).toBe(true);
      // Missing-field findings are not enriched with a category (resource is a field, not an index).
      expect(data.actionableFindings!.every((f) => f.category === undefined)).toBe(true);
    });

    it('reports actionsRequired when only missing fields exist (no categorized items)', async () => {
      mockGetQuality.mockResolvedValueOnce(makePayload({ status: 'noData', items: [] }));
      mockFetchRuleFieldCaps.mockResolvedValueOnce(missingFieldsFixture);

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.status).toBe('actionsRequired');
      expect(data.summary).toContain('2 rule(s)');
    });

    it('includes both incompatible-field and missing-field counts in the summary', async () => {
      mockGetQuality.mockResolvedValueOnce(
        makePayload({ items: [makeQualityResult(IDENTITY_INDEX, 3)] })
      );
      mockFetchRuleFieldCaps.mockResolvedValueOnce(missingFieldsFixture);

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.status).toBe('actionsRequired');
      expect(data.summary).toContain('incompatible ECS field mappings');
      expect(data.summary).toContain('rule(s) have required fields not mapped');
    });

    it('emits no missingField findings and stays healthy when nothing is unmapped', async () => {
      mockGetQuality.mockResolvedValueOnce(
        makePayload({ items: [makeQualityResult(IDENTITY_INDEX, 0)] })
      );
      mockFetchRuleFieldCaps.mockResolvedValueOnce([]);

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const data = (result.results[0] as OtherResult<QualityPayload>).data;
      expect(data.missingFieldsByRule).toHaveLength(0);
      expect(data.actionableFindings!.some((f) => f.type === 'missingField')).toBe(false);
      expect(data.status).toBe('healthy');
    });
  });

  describe('handler — result shape', () => {
    it('returns ToolResultType.other on success', async () => {
      mockGetQuality.mockResolvedValueOnce(makePayload());
      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;
      expect(result.results[0].type).toBe(ToolResultType.other);
    });

    it('returns ToolResultType.error when getQuality throws', async () => {
      mockGetQuality.mockRejectedValueOnce(new Error('quality fetch failed'));
      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;
      expect(result.results[0].type).toBe(ToolResultType.error);
    });
  });
});
