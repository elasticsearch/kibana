/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType, type ErrorResult, type OtherResult } from '@kbn/agent-builder-common';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import type { ExperimentalFeatures } from '../../../../../common';
import { createToolHandlerContext, createToolTestMocks } from '../../../__mocks__/test_helpers';
import { listLeadsTool } from './list_leads_tool';
import { createLeadDataClient } from '../../../../lib/entity_analytics/lead_generation/lead_data_client';
import { getUserLeadPrivileges } from '../../../../lib/entity_analytics/lead_generation/get_user_lead_privileges';
import type { Lead } from '../../../../../common/entity_analytics/lead_generation/types';

jest.mock('../../../../lib/entity_analytics/lead_generation/lead_data_client');
jest.mock('../../../../lib/entity_analytics/lead_generation/get_user_lead_privileges');

const mockCreateLeadDataClient = createLeadDataClient as jest.Mock;
const mockGetUserLeadPrivileges = getUserLeadPrivileges as jest.Mock;

const makeTestLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'lead-1',
  title: 'Suspicious lateral movement detected',
  byline: 'User admin shows brute-force indicators',
  description: 'Detailed investigation guide.',
  entities: [{ type: 'user', name: 'admin' }],
  tags: ['brute_force', 'T1110'],
  priority: 8,
  chatRecommendations: ['Check risk score history'],
  timestamp: new Date().toISOString(),
  staleness: 'fresh',
  status: 'active',
  observations: [],
  executionUuid: '550e8400-e29b-41d4-a716-446655440000',
  sourceType: 'adhoc',
  ...overrides,
});

const makeStatusResult = (overrides: Record<string, unknown> = {}) => ({
  isEnabled: true,
  indexExists: true,
  totalLeads: 5,
  lastRun: new Date().toISOString(),
  ...overrides,
});

const mockExperimentalFeatures = { leadGenerationEnabled: true } as ExperimentalFeatures;

describe('listLeadsTool', () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const tool = listLeadsTool(mockCore, mockLogger, mockExperimentalFeatures);

  let mockFindLeads: jest.Mock;
  let mockGetStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFindLeads = jest.fn();
    mockGetStatus = jest.fn();
    mockCreateLeadDataClient.mockReturnValue({
      findLeads: mockFindLeads,
      getStatus: mockGetStatus,
    });
    mockGetUserLeadPrivileges.mockResolvedValue({
      adhoc: { has_read_permissions: true, has_write_permissions: true },
      scheduled: { has_read_permissions: true, has_write_permissions: true },
      has_all_required: true,
      privileges: {},
    });
  });

  describe('schema', () => {
    it('accepts all optional params', () => {
      const result = tool.schema.safeParse({
        perPage: 50,
        status: 'active',
        sortField: 'priority',
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty params object', () => {
      expect(tool.schema.safeParse({}).success).toBe(true);
    });

    it('rejects invalid status value', () => {
      expect(tool.schema.safeParse({ status: 'invalid' }).success).toBe(false);
    });

    it('rejects perPage above 100', () => {
      expect(tool.schema.safeParse({ perPage: 101 }).success).toBe(false);
    });
  });

  describe('handler', () => {
    const handlerContext = () =>
      createToolHandlerContext(mockRequest, mockEsClient, mockLogger, { spaceId: 'default' });

    it('returns permission error when user lacks read permissions', async () => {
      mockGetUserLeadPrivileges.mockResolvedValue({
        adhoc: { has_read_permissions: false, has_write_permissions: false },
        scheduled: { has_read_permissions: false, has_write_permissions: false },
        has_all_required: false,
        privileges: {},
      });

      const result = (await tool.handler({}, handlerContext())) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      const errResult = result.results[0] as ErrorResult;
      expect(errResult.type).toBe(ToolResultType.error);
      expect((errResult.data as { message: string }).message).toContain('permission');
      expect(mockFindLeads).not.toHaveBeenCalled();
    });

    it('returns leads and generation status on success', async () => {
      const lead = makeTestLead();
      mockFindLeads.mockResolvedValue({ leads: [lead], total: 1, page: 1, perPage: 20 });
      mockGetStatus.mockResolvedValue(makeStatusResult({ isEnabled: true, totalLeads: 1 }));

      const result = (await tool.handler({}, handlerContext())) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      const other = result.results[0] as OtherResult;
      expect(other.type).toBe(ToolResultType.other);

      const data = other.data as {
        leads: Array<Record<string, unknown>>;
        total: number;
        perPage: number;
        lastGeneratedAt: string | null;
      };

      expect(data.total).toBe(1);
      expect(data.leads).toHaveLength(1);

      // All Lead fields except executionUuid should be present
      expect(data.leads[0]).toMatchObject({
        id: lead.id,
        title: lead.title,
        byline: lead.byline,
        description: lead.description,
        priority: lead.priority,
        status: lead.status,
        staleness: lead.staleness,
        tags: lead.tags,
        entities: lead.entities,
        observations: lead.observations,
        chatRecommendations: lead.chatRecommendations,
        sourceType: lead.sourceType,
      });
      expect(data.leads[0]).not.toHaveProperty('executionUuid');

      expect(data.lastGeneratedAt).toEqual(expect.any(String));
    });

    it('returns empty leads array when no leads exist', async () => {
      mockFindLeads.mockResolvedValue({ leads: [], total: 0, page: 1, perPage: 20 });
      mockGetStatus.mockResolvedValue(makeStatusResult({ totalLeads: 0 }));

      const result = (await tool.handler({}, handlerContext())) as ToolHandlerStandardReturn;

      const other = result.results[0] as OtherResult;
      expect(other.type).toBe(ToolResultType.other);
      const data = other.data as { leads: unknown[]; total: number };
      expect(data.leads).toHaveLength(0);
      expect(data.total).toBe(0);
    });

    it('returns error result on any exception', async () => {
      mockFindLeads.mockRejectedValue(new Error('test error'));
      mockGetStatus.mockResolvedValue(makeStatusResult());

      const result = (await tool.handler({}, handlerContext())) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      const errResult = result.results[0] as ErrorResult;
      expect(errResult.type).toBe(ToolResultType.error);
    });

    it('passes status filter through to findLeads', async () => {
      mockFindLeads.mockResolvedValue({ leads: [], total: 0, page: 1, perPage: 20 });
      mockGetStatus.mockResolvedValue(makeStatusResult());

      await tool.handler({ status: 'dismissed' }, handlerContext());

      expect(mockFindLeads).toHaveBeenCalledWith(expect.objectContaining({ status: 'dismissed' }));
    });

    it('always passes sortOrder desc regardless of params', async () => {
      mockFindLeads.mockResolvedValue({ leads: [], total: 0, page: 1, perPage: 20 });
      mockGetStatus.mockResolvedValue(makeStatusResult());

      await tool.handler({ sortField: 'timestamp' }, handlerContext());

      expect(mockFindLeads).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 'desc' }));
    });

    it('uses esClient.asCurrentUser for lead data client', async () => {
      mockFindLeads.mockResolvedValue({ leads: [], total: 0, page: 1, perPage: 20 });
      mockGetStatus.mockResolvedValue(makeStatusResult());

      await tool.handler({}, handlerContext());

      expect(mockCreateLeadDataClient).toHaveBeenCalledWith(
        expect.objectContaining({ esClient: mockEsClient.asCurrentUser })
      );
    });
  });
});
