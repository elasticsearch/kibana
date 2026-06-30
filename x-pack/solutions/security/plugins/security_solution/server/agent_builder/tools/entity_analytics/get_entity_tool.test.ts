/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ToolResultType,
  type ErrorResult,
  type EsqlResults,
  type OtherResult,
} from '@kbn/agent-builder-common';
import { executeEsql } from '@kbn/agent-builder-genai-utils';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import type { coreMock } from '@kbn/core/server/mocks';
import { EnrichEntityService } from '../../../lib/entity_analytics/enriched_entity';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import {
  createToolAvailabilityContext,
  createToolHandlerContext,
  createToolTestMocks,
  setupMockCoreStartServices,
} from '../../__mocks__/test_helpers';
import type { ExperimentalFeatures } from '../../../../common';
import type { EntityRiskScoreRecord } from '../../../../common/api/entity_analytics/common';
import { SecurityAgentBuilderAttachments } from '../../../../common/constants';
import { ENTITY_ANALYTICS_AI_TOOL_USAGE_EVENT } from '../../../lib/telemetry/event_based/events';
import { buildRenderAttachmentTag, buildSingleEntityAttachmentId } from './entity_attachment_utils';
import { getEntityTool, SECURITY_GET_ENTITY_TOOL_ID } from './get_entity_tool';
import type { SharedServices } from '@kbn/ml-plugin/server/shared_services';

jest.mock('../../utils/get_agent_builder_resource_availability', () => ({
  getAgentBuilderResourceAvailability: jest.fn(),
}));

jest.mock('@kbn/agent-builder-genai-utils', () => ({
  executeEsql: jest.fn(),
}));

jest.mock('../../../lib/entity_analytics/enriched_entity', () => ({
  EnrichEntityService: jest.fn(),
}));

const mockGetAgentBuilderResourceAvailability = getAgentBuilderResourceAvailability as jest.Mock;

const mockExperimentalFeatures = {
  entityAnalyticsEntityStoreV2: true,
} as ExperimentalFeatures;

const buildEmptyRiskSearchResponse = () => ({
  took: 1,
  timed_out: false,
  _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
  hits: {
    hits: [] as Array<{ _id: string; _index: string; _source: unknown }>,
    total: { value: 0, relation: 'eq' as const },
  },
});

describe('getEntityTool', () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const tool = getEntityTool(
    mockCore,
    mockLogger,
    null as unknown as SharedServices,
    mockExperimentalFeatures
  );
  let mockCoreStart: ReturnType<typeof coreMock.createStart>;
  const mockGetEnrichedEntities = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCoreStart = setupMockCoreStartServices(mockCore, mockEsClient);
    (EnrichEntityService as jest.Mock).mockImplementation(() => ({
      getEnrichedEntities: mockGetEnrichedEntities,
    }));
    mockGetEnrichedEntities.mockResolvedValue({ entities: [] });
    mockGetAgentBuilderResourceAvailability.mockResolvedValue({
      status: 'available',
    });
    // Default to an empty risk index so existing tests that don't care
    // about the attachment payload's risk enrichment still pass. The
    // risk enrichment path issues `esClient.asCurrentUser.search` against
    // the time-series risk index; mocking a zero-hit response is the
    // cheapest safe default.
    mockEsClient.asCurrentUser.search.mockResolvedValue(buildEmptyRiskSearchResponse());
  });

  describe('schema', () => {
    it('validates correct schema', () => {
      const result = tool.schema.safeParse({ entityType: 'host', entityId: 'host:server1' });
      expect(result.success).toBe(true);
    });

    it('allows optional entity type', () => {
      const result = tool.schema.safeParse({ entityId: 'host:server1' });
      expect(result.success).toBe(true);
    });

    it('rejects empty entity id', () => {
      const result = tool.schema.safeParse({ entityType: 'host', entityId: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('availability', () => {
    it('returns unavailable when resource availability check fails', async () => {
      mockGetAgentBuilderResourceAvailability.mockResolvedValueOnce({
        status: 'unavailable',
      });

      const result = await tool.availability!.handler(
        createToolAvailabilityContext(mockRequest, 'default')
      );

      expect(result.status).toBe('unavailable');
    });

    it('returns unavailable when entity store v2 experimental feature is disabled', async () => {
      const disabledTool = getEntityTool(mockCore, mockLogger, null as unknown as SharedServices, {
        ...mockExperimentalFeatures,
        entityAnalyticsEntityStoreV2: false,
      });

      const result = await disabledTool.availability!.handler(
        createToolAvailabilityContext(mockRequest, 'default')
      );

      expect(result.status).toBe('unavailable');
      expect(result.reason).toContain('Entity Store V2 is not enabled');
    });

    it('returns unavailable when entity store v2 index does not exist', async () => {
      mockEsClient.asInternalUser.indices.exists.mockResolvedValueOnce(false);

      const result = await tool.availability!.handler(
        createToolAvailabilityContext(mockRequest, 'default')
      );

      expect(result.status).toBe('unavailable');
      expect(result.reason).toBe('Entity Store V2 index does not exist for this space');
    });

    it('returns available when all requirements are met', async () => {
      mockEsClient.asInternalUser.indices.exists.mockResolvedValueOnce(true);

      const result = await tool.availability!.handler(
        createToolAvailabilityContext(mockRequest, 'default')
      );

      expect(result.status).toBe('available');
      expect(mockEsClient.asInternalUser.indices.exists).toHaveBeenCalledWith({
        index: 'entities-latest-default',
      });
    });
  });

  describe('handler', () => {
    it('normalizes non-prefixed entity ids in ES|QL query', async () => {
      (executeEsql as jest.Mock).mockResolvedValueOnce({
        columns: [{ name: 'entity.id', type: 'keyword' }],
        values: [['host:server1']],
      });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(1);
      expect((executeEsql as jest.Mock).mock.calls[0][0].query).toEqual(
        `FROM entities-latest-default | WHERE entity.id == \"host:server1\" | LIMIT 1`
      );
      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.esqlResults);
    });

    it('keeps already-prefixed entity ids unchanged', async () => {
      (executeEsql as jest.Mock).mockResolvedValueOnce({
        columns: [{ name: 'entity.id', type: 'keyword' }],
        values: [['host:server1']],
      });

      await tool.handler(
        { entityType: 'host', entityId: 'host:server1' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      );

      expect((executeEsql as jest.Mock).mock.calls[0][0].query).toContain(
        'WHERE entity.id == "host:server1"'
      );
      expect((executeEsql as jest.Mock).mock.calls[0][0].query).not.toContain(
        'WHERE entity.id == "host:host:server1"'
      );
    });

    it('merges alert data as risk_score_inputs column into entity result', async () => {
      (executeEsql as jest.Mock).mockResolvedValueOnce({
        columns: [
          { name: 'entity.id', type: 'keyword' },
          { name: 'entity.name', type: 'keyword' },
          { name: 'entity.EngineMetadata.Type', type: 'keyword' },
          { name: 'entity.risk.calculated_score_norm', type: 'double' },
        ],
        values: [['host:server1', 'server1', 'host', 75.5]],
      });
      mockGetEnrichedEntities.mockResolvedValueOnce({
        entities: [
          {
            entity: {} as never,
            alertDocuments: [
              { _id: 'alert-1', 'kibana.alert.rule.name': 'Rule A' },
              { _id: 'alert-2', 'kibana.alert.rule.name': 'Rule B' },
            ],
          },
        ],
      });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(1);

      // Single merged esqlResults result
      expect(result.results).toHaveLength(1);
      const mergedResult = result.results[0] as EsqlResults;
      expect(mergedResult.type).toBe(ToolResultType.esqlResults);

      const { columns, values } = mergedResult.data;

      // Entity columns come first, then a single risk_score_inputs column
      expect(columns.map((c) => c.name)).toEqual([
        'entity.id',
        'entity.name',
        'entity.EngineMetadata.Type',
        'entity.risk.calculated_score_norm',
        'risk_score_inputs',
      ]);

      // Single merged row: entity values followed by the JSON-serialised array of alert objects
      expect(values).toHaveLength(1);
      expect(values[0]).toEqual([
        'host:server1',
        'server1',
        'host',
        75.5,
        JSON.stringify([
          { _id: 'alert-1', 'kibana.alert.rule.name': 'Rule A' },
          { _id: 'alert-2', 'kibana.alert.rule.name': 'Rule B' },
        ]),
      ]);
    });

    it('skips alert lookup when entity has no risk score', async () => {
      (executeEsql as jest.Mock).mockResolvedValueOnce({
        columns: [
          { name: 'entity.id', type: 'keyword' },
          { name: 'entity.name', type: 'keyword' },
          { name: 'entity.type', type: 'keyword' },
        ],
        values: [['host:server1', 'server1', 'host']],
      });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.esqlResults);
    });

    it('appends profile_history column when interval is provided', async () => {
      (executeEsql as jest.Mock)
        // 1. Entity lookup
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
          ],
          values: [['host:server1', 'server1']],
        })
        // 2. Snapshot lookup
        .mockResolvedValueOnce({
          columns: [
            { name: '@timestamp', type: 'date' },
            { name: 'entity.risk.calculated_score_norm', type: 'double' },
          ],
          values: [
            ['2024-01-02T00:00:00Z', 80.0],
            ['2024-01-01T00:00:00Z', 70.0],
          ],
        });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1', interval: '7d' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(2);

      expect(result.results).toHaveLength(1);
      const esqlResult = result.results[0] as EsqlResults;
      expect(esqlResult.type).toBe(ToolResultType.esqlResults);

      const { columns, values } = esqlResult.data;

      expect(columns.map((c) => c.name)).toEqual(['entity.id', 'entity.name', 'profile_history']);

      expect(values).toHaveLength(1);
      expect(values[0]).toEqual([
        'host:server1',
        'server1',
        JSON.stringify([
          { '@timestamp': '2024-01-02T00:00:00Z', 'entity.risk.calculated_score_norm': 80.0 },
          { '@timestamp': '2024-01-01T00:00:00Z', 'entity.risk.calculated_score_norm': 70.0 },
        ]),
      ]);
    });

    it('includes both risk_score_inputs and profile_history when entity has a risk score and interval is provided', async () => {
      (executeEsql as jest.Mock)
        // 1. Entity lookup: entity has a risk score
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.EngineMetadata.Type', type: 'keyword' },
            { name: 'entity.risk.calculated_score_norm', type: 'double' },
          ],
          values: [['host:server1', 'server1', 'host', 75.5]],
        })
        // 2. Snapshot lookup
        .mockResolvedValueOnce({
          columns: [
            { name: '@timestamp', type: 'date' },
            { name: 'entity.risk.calculated_score_norm', type: 'double' },
          ],
          values: [
            ['2024-01-02T00:00:00Z', 80.0],
            ['2024-01-01T00:00:00Z', 70.0],
          ],
        });
      mockGetEnrichedEntities.mockResolvedValueOnce({
        entities: [
          {
            entity: {} as never,
            alertDocuments: [
              { _id: 'alert-1', 'kibana.alert.rule.name': 'Rule A' },
              { _id: 'alert-2', 'kibana.alert.rule.name': 'Rule B' },
            ],
          },
        ],
      });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1', interval: '7d' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(2);

      expect(result.results).toHaveLength(1);
      const esqlResult = result.results[0] as EsqlResults;
      expect(esqlResult.type).toBe(ToolResultType.esqlResults);

      const { columns, values } = esqlResult.data;

      expect(columns.map((c) => c.name)).toEqual([
        'entity.id',
        'entity.name',
        'entity.EngineMetadata.Type',
        'entity.risk.calculated_score_norm',
        'risk_score_inputs',
        'profile_history',
      ]);

      expect(values).toHaveLength(1);
      expect(values[0]).toEqual([
        'host:server1',
        'server1',
        'host',
        75.5,
        JSON.stringify([
          { _id: 'alert-1', 'kibana.alert.rule.name': 'Rule A' },
          { _id: 'alert-2', 'kibana.alert.rule.name': 'Rule B' },
        ]),
        JSON.stringify([
          { '@timestamp': '2024-01-02T00:00:00Z', 'entity.risk.calculated_score_norm': 80.0 },
          { '@timestamp': '2024-01-01T00:00:00Z', 'entity.risk.calculated_score_norm': 70.0 },
        ]),
      ]);
    });

    it('returns only profile_history for a specific date, skipping risk inputs', async () => {
      (executeEsql as jest.Mock)
        // 1. Entity lookup: entity has a risk score (but risk inputs should still be skipped)
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.EngineMetadata.Type', type: 'keyword' },
            { name: 'entity.risk.calculated_score_norm', type: 'double' },
          ],
          values: [['host:server1', 'server1', 'host', 75.5]],
        })
        // 2. Date-range snapshot lookup
        .mockResolvedValueOnce({
          columns: [
            { name: '@timestamp', type: 'date' },
            { name: 'entity.risk.calculated_score_norm', type: 'double' },
          ],
          values: [['2024-01-15T10:00:00.000Z', 72.0]],
        });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1', date: '2024-01-15T00:00:00Z' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(2);

      // Snapshot query should use the UTC day range derived from the date
      expect((executeEsql as jest.Mock).mock.calls[1][0].query).toContain(
        '@timestamp >= "2024-01-15T00:00:00.000Z" AND @timestamp <= "2024-01-15T23:59:59.999Z"'
      );

      expect(result.results).toHaveLength(1);
      const esqlResult = result.results[0] as EsqlResults;
      expect(esqlResult.type).toBe(ToolResultType.esqlResults);

      const { columns, values } = esqlResult.data;

      // No risk_score_inputs column; profile_history is the only synthetic column
      expect(columns.map((c) => c.name)).toEqual([
        'entity.id',
        'entity.name',
        'entity.EngineMetadata.Type',
        'entity.risk.calculated_score_norm',
        'profile_history',
      ]);

      expect(values).toHaveLength(1);
      expect(values[0]).toEqual([
        'host:server1',
        'server1',
        'host',
        75.5,
        JSON.stringify([
          { '@timestamp': '2024-01-15T10:00:00.000Z', 'entity.risk.calculated_score_norm': 72.0 },
        ]),
      ]);
    });

    it('date takes priority over interval when both are supplied', async () => {
      (executeEsql as jest.Mock)
        // 1. Entity lookup
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.EngineMetadata.Type', type: 'keyword' },
            { name: 'entity.risk.calculated_score_norm', type: 'double' },
          ],
          values: [['host:server1', 'server1', 'host', 75.5]],
        })
        // 2. Date-range snapshot lookup (only this snapshot query should run)
        .mockResolvedValueOnce({
          columns: [{ name: '@timestamp', type: 'date' }],
          values: [['2024-01-15T08:00:00.000Z']],
        });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1', date: '2024-01-15T00:00:00Z', interval: '7d' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      // Only 2 calls: entity lookup + date snapshot; no risk inputs, no interval snapshot
      expect(executeEsql).toHaveBeenCalledTimes(2);

      // Snapshot query uses date range, not NOW() - interval
      expect((executeEsql as jest.Mock).mock.calls[1][0].query).toContain(
        '@timestamp >= "2024-01-15T00:00:00.000Z"'
      );
      expect((executeEsql as jest.Mock).mock.calls[1][0].query).not.toContain('NOW()');

      const esqlResult = result.results[0] as EsqlResults;
      expect(esqlResult.data.columns.map((c) => c.name)).toContain('profile_history');
      expect(esqlResult.data.columns.map((c) => c.name)).not.toContain('risk_score_inputs');
    });

    it('returns error result when no entity is found', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — nothing found
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — nothing found
        .mockResolvedValueOnce({ columns: [{ name: 'entity.name', type: 'keyword' }], values: [] })
        // 3. entity.id RLIKE fallback — also nothing found
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 4. entity.name RLIKE fallback — also nothing found
        .mockResolvedValueOnce({ columns: [{ name: 'entity.name', type: 'keyword' }], values: [] });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(4);
      expect(result.results).toHaveLength(1);
      const errorResult = result.results[0] as ErrorResult;
      expect(errorResult.type).toBe(ToolResultType.error);
      expect(errorResult.data.message).toContain('No entity found');
    });

    it('returns LIKE fallback results when exact match finds no entity', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.name', type: 'keyword' }], values: [] })
        // 3. LIKE fallback
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
          ],
          values: [['host:server1', 'server1']],
        });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(3);
      const rlikeQuery = (executeEsql as jest.Mock).mock.calls[2][0].query;
      expect(rlikeQuery).toContain('RLIKE ".*server1.*"');
      expect(rlikeQuery).toContain('LIMIT 5');
      expect(result.results).toHaveLength(1);
      const esqlResult = result.results[0] as EsqlResults;
      expect(esqlResult.type).toBe(ToolResultType.esqlResults);
      expect(esqlResult.data.values).toHaveLength(1);
    });

    it('uses raw entityId (not normalized) as the RLIKE pattern', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 3. entity.id RLIKE fallback — empty (just checking query shape)
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 4. entity.name RLIKE fallback — empty
        .mockResolvedValueOnce({ columns: [], values: [] });

      await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      );

      const rlikeQuery = (executeEsql as jest.Mock).mock.calls[2][0].query;
      expect(rlikeQuery).toContain('RLIKE ".*server1.*"');
      expect(rlikeQuery).not.toContain('RLIKE ".*host:server1.*"');
    });

    it('returns entity.name RLIKE fallback results when entity.id searches find nothing', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.name', type: 'keyword' }], values: [] })
        // 3. entity.id RLIKE fallback — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 4. entity.name RLIKE fallback — returns a match
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
          ],
          values: [['host:server1', 'server1']],
        });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(4);
      const nameQuery = (executeEsql as jest.Mock).mock.calls[3][0].query;
      expect(nameQuery).toContain('entity.name RLIKE ".*server1.*"');
      expect(nameQuery).toContain('user.full_name RLIKE ".*server1.*"');
      expect(nameQuery).toContain('LIMIT 5');
      expect(result.results).toHaveLength(1);
      const esqlResult = result.results[0] as EsqlResults;
      expect(esqlResult.type).toBe(ToolResultType.esqlResults);
      expect(esqlResult.data.values).toHaveLength(1);
    });

    it('returns user.full_name RLIKE match when user is found by full name', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — empty (this test specifically exercises the RLIKE
        // fallback, so the exact-name rung is mocked as a miss to force fall-through)
        .mockResolvedValueOnce({ columns: [{ name: 'entity.name', type: 'keyword' }], values: [] })
        // 3. entity.id RLIKE fallback — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 4. entity.name / user.full_name RLIKE fallback — returns a user entity matched by full name
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'user.full_name', type: 'keyword' },
          ],
          values: [['user:jdoe', 'jdoe', 'John Doe']],
        });

      const result = (await tool.handler(
        { entityType: 'user', entityId: 'John Doe' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(4);
      const nameQuery = (executeEsql as jest.Mock).mock.calls[3][0].query;
      expect(nameQuery).toContain('user.full_name RLIKE ".*John Doe.*"');
      expect(result.results).toHaveLength(1);
      const esqlResult = result.results[0] as EsqlResults;
      expect(esqlResult.type).toBe(ToolResultType.esqlResults);
      expect(esqlResult.data.values).toHaveLength(1);
      expect(esqlResult.data.values[0]).toContain('John Doe');
    });

    it('uses raw entityId (not normalized) as the entity.name RLIKE pattern', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 3. entity.id RLIKE fallback — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 4. entity.name RLIKE fallback — empty (just checking query shape)
        .mockResolvedValueOnce({ columns: [], values: [] });

      await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      );

      const nameQuery = (executeEsql as jest.Mock).mock.calls[3][0].query;
      expect(nameQuery).toContain('entity.name RLIKE ".*server1.*"');
      expect(nameQuery).toContain('user.full_name RLIKE ".*server1.*"');
      expect(nameQuery).not.toContain('entity.name RLIKE ".*host:server1.*"');
      expect(nameQuery).not.toContain('user.full_name RLIKE ".*host:server1.*"');
    });

    it('escapes regex metacharacters in the entity.name RLIKE pattern', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 3. entity.id RLIKE fallback — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 4. entity.name RLIKE fallback — empty
        .mockResolvedValueOnce({ columns: [], values: [] });

      await tool.handler(
        { entityId: 'server.1*test' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      );

      const nameQuery = (executeEsql as jest.Mock).mock.calls[3][0].query;
      expect(nameQuery).toContain('entity.name RLIKE ".*server\\\\.1\\\\*test.*"');
      expect(nameQuery).toContain('user.full_name RLIKE ".*server\\\\.1\\\\*test.*"');
    });

    it('escapes regex metacharacters in the entity.id RLIKE pattern', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 3. entity.id RLIKE fallback — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 4. entity.name RLIKE fallback — empty
        .mockResolvedValueOnce({ columns: [], values: [] });

      await tool.handler(
        { entityId: 'server.1*test' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      );

      const rlikeQuery = (executeEsql as jest.Mock).mock.calls[2][0].query;
      expect(rlikeQuery).toContain('RLIKE ".*server\\\\.1\\\\*test.*"');
    });

    it('uses resolved entity.id from RLIKE result for subsequent snapshot queries', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 3. RLIKE fallback — returns entity with a prefixed ID
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
          ],
          values: [['host:server1', 'server1']],
        })
        // 4. Interval snapshot
        .mockResolvedValueOnce({ columns: [{ name: '@timestamp', type: 'date' }], values: [] });

      await tool.handler(
        { entityId: 'server1', interval: '7d' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      );

      expect(executeEsql).toHaveBeenCalledTimes(4);
      const snapshotQuery = (executeEsql as jest.Mock).mock.calls[3][0].query;
      expect(snapshotQuery).toContain('WHERE entity.id == "host:server1"');
    });

    it('returns one result per RLIKE entity with profile_history when interval is provided', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 3. RLIKE fallback — 2 entities (no risk score, so no extra enrichment calls)
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
          ],
          values: [
            ['host:server1', 'server1'],
            ['host:server10', 'server10'],
          ],
        })
        // 4. Interval snapshot for host:server1
        .mockResolvedValueOnce({
          columns: [{ name: '@timestamp', type: 'date' }],
          values: [['2024-01-01T00:00:00Z']],
        })
        // 5. Interval snapshot for host:server10
        .mockResolvedValueOnce({
          columns: [{ name: '@timestamp', type: 'date' }],
          values: [['2024-01-02T00:00:00Z']],
        });

      const result = (await tool.handler(
        { entityId: 'server', interval: '7d' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(5);
      expect(result.results).toHaveLength(2);

      const [r1, r2] = result.results as EsqlResults[];
      expect(r1.type).toBe(ToolResultType.esqlResults);
      expect(r2.type).toBe(ToolResultType.esqlResults);

      expect(r1.data.values).toHaveLength(1);
      expect(r2.data.values).toHaveLength(1);

      expect(r1.data.columns.map((c) => c.name)).toContain('profile_history');
      expect(r2.data.columns.map((c) => c.name)).toContain('profile_history');

      // Each snapshot query uses the entity.id from the respective RLIKE result row
      const snapshotCalls = (executeEsql as jest.Mock).mock.calls.slice(3);
      expect(snapshotCalls[0][0].query).toContain('WHERE entity.id == "host:server1"');
      expect(snapshotCalls[1][0].query).toContain('WHERE entity.id == "host:server10"');
    });

    it('returns one result per RLIKE entity when date is provided with early exit', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [], values: [] })
        // 3. RLIKE fallback — 2 entities (with risk score; date path exits before risk score fetch)
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.risk.calculated_score_norm', type: 'double' },
          ],
          values: [
            ['host:server1', 'server1', 75.5],
            ['host:server10', 'server10', 60.0],
          ],
        })
        // 4. Date snapshot for host:server1
        .mockResolvedValueOnce({
          columns: [{ name: '@timestamp', type: 'date' }],
          values: [['2024-01-15T10:00:00Z']],
        })
        // 5. Date snapshot for host:server10
        .mockResolvedValueOnce({
          columns: [{ name: '@timestamp', type: 'date' }],
          values: [['2024-01-15T11:00:00Z']],
        });

      const result = (await tool.handler(
        { entityId: 'server', date: '2024-01-15T00:00:00Z' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(executeEsql).toHaveBeenCalledTimes(5);
      expect(result.results).toHaveLength(2);

      const [r1, r2] = result.results as EsqlResults[];
      expect(r1.type).toBe(ToolResultType.esqlResults);
      expect(r2.type).toBe(ToolResultType.esqlResults);

      // Date path: profile_history column, no risk_score_inputs
      expect(r1.data.columns.map((c) => c.name)).toContain('profile_history');
      expect(r2.data.columns.map((c) => c.name)).toContain('profile_history');
      expect(r1.data.columns.map((c) => c.name)).not.toContain('risk_score_inputs');
      expect(r2.data.columns.map((c) => c.name)).not.toContain('risk_score_inputs');
    });

    it('returns unenriched entity result when enrichment query fails', async () => {
      (executeEsql as jest.Mock).mockResolvedValueOnce({
        columns: [
          { name: 'entity.id', type: 'keyword' },
          { name: 'entity.name', type: 'keyword' },
          { name: 'entity.EngineMetadata.Type', type: 'keyword' },
          { name: 'entity.risk.calculated_score_norm', type: 'double' },
        ],
        values: [['host:server1', 'server1', 'host', 75.5]],
      });
      mockGetEnrichedEntities.mockRejectedValueOnce(new Error('risk index unavailable'));

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      const esqlResult = result.results[0] as EsqlResults;
      expect(esqlResult.type).toBe(ToolResultType.esqlResults);

      const { columns, values } = esqlResult.data;
      expect(columns.map((c) => c.name)).not.toContain('risk_score_inputs');
      expect(columns.map((c) => c.name)).not.toContain('profile_history');
      expect(values).toHaveLength(1);
      expect(values[0]).toEqual(['host:server1', 'server1', 'host', 75.5]);
    });

    it('returns error result when ES|QL query fails', async () => {
      (executeEsql as jest.Mock).mockRejectedValueOnce(new Error('ES|QL failure'));

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      const errorResult = result.results[0] as ErrorResult;
      expect(errorResult.type).toBe(ToolResultType.error);
      expect(errorResult.data.message).toContain(
        'Error fetching entity from Entity Store: ES|QL failure'
      );
    });

    describe('telemetry', () => {
      it('reports success=true and entitiesReturned=1 when an entity is found', async () => {
        (executeEsql as jest.Mock).mockResolvedValueOnce({
          columns: [{ name: 'entity.id', type: 'keyword' }],
          values: [['host:server1']],
        });

        await tool.handler(
          { entityType: 'host', entityId: 'server1' },
          createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
        );

        expect(mockCoreStart.analytics.reportEvent).toHaveBeenCalledWith(
          ENTITY_ANALYTICS_AI_TOOL_USAGE_EVENT.eventType,
          {
            toolId: SECURITY_GET_ENTITY_TOOL_ID,
            entityTypes: ['host'],
            spaceId: 'default',
            success: true,
            entitiesReturned: 1,
            errorMessage: undefined,
          }
        );
      });

      it('reports success=true and entitiesReturned=0 when no entity is found', async () => {
        (executeEsql as jest.Mock)
          .mockResolvedValueOnce({ columns: [], values: [] })
          .mockResolvedValueOnce({ columns: [], values: [] })
          .mockResolvedValueOnce({ columns: [], values: [] })
          .mockResolvedValueOnce({ columns: [], values: [] });

        await tool.handler(
          { entityType: 'host', entityId: 'server1' },
          createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
        );

        expect(mockCoreStart.analytics.reportEvent).toHaveBeenCalledWith(
          ENTITY_ANALYTICS_AI_TOOL_USAGE_EVENT.eventType,
          {
            toolId: SECURITY_GET_ENTITY_TOOL_ID,
            entityTypes: ['host'],
            spaceId: 'default',
            success: true,
            entitiesReturned: 0,
            errorMessage: undefined,
          }
        );
      });

      it('reports success=false and errorMessage when the query throws', async () => {
        (executeEsql as jest.Mock).mockRejectedValueOnce(new Error('ES|QL failure'));

        await tool.handler(
          { entityType: 'host', entityId: 'server1' },
          createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
        );

        expect(mockCoreStart.analytics.reportEvent).toHaveBeenCalledWith(
          ENTITY_ANALYTICS_AI_TOOL_USAGE_EVENT.eventType,
          {
            toolId: SECURITY_GET_ENTITY_TOOL_ID,
            entityTypes: ['host'],
            spaceId: 'default',
            success: false,
            entitiesReturned: 0,
            errorMessage: 'ES|QL failure',
          }
        );
      });

      it('reports entityTypes=[] when no entityType param is provided', async () => {
        (executeEsql as jest.Mock).mockResolvedValueOnce({
          columns: [{ name: 'entity.id', type: 'keyword' }],
          values: [['host:server1']],
        });

        await tool.handler(
          { entityId: 'server1' },
          createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
        );

        expect(mockCoreStart.analytics.reportEvent).toHaveBeenCalledWith(
          ENTITY_ANALYTICS_AI_TOOL_USAGE_EVENT.eventType,
          expect.objectContaining({ entityTypes: [] })
        );
      });
    });
  });

  describe('entity attachment side effect', () => {
    const expectedAttachmentId = buildSingleEntityAttachmentId('host', 'server1');

    const exactHitResponse = {
      columns: [
        { name: 'entity.id', type: 'keyword' },
        { name: 'entity.name', type: 'keyword' },
        { name: 'entity.EngineMetadata.Type', type: 'keyword' },
      ],
      values: [['host:server1', 'server1', 'host']],
    };

    it('creates a security.entity attachment on exact single hit and appends an other result', async () => {
      (executeEsql as jest.Mock).mockResolvedValueOnce(exactHitResponse);

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
      (context.attachments.add as jest.Mock).mockResolvedValueOnce({
        id: expectedAttachmentId,
        current_version: 1,
      });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        context
      )) as ToolHandlerStandardReturn;

      expect(context.attachments.add).toHaveBeenCalledTimes(1);
      expect(context.attachments.add).toHaveBeenCalledWith({
        id: expectedAttachmentId,
        type: SecurityAgentBuilderAttachments.entity,
        data: {
          identifierType: 'host',
          identifier: 'server1',
          attachmentLabel: 'host: server1',
          entityStoreId: 'host:server1',
        },
        description: 'host: server1',
      });
      expect(context.attachments.update).not.toHaveBeenCalled();

      expect(result.results).toHaveLength(2);
      expect(result.results[0].type).toBe(ToolResultType.esqlResults);
      const otherResult = result.results[1] as OtherResult<{
        attachmentId: string;
        version: number;
        renderTag: string;
      }>;
      expect(otherResult.type).toBe(ToolResultType.other);
      expect(otherResult.data).toEqual({
        attachmentId: expectedAttachmentId,
        version: 1,
        renderTag: buildRenderAttachmentTag({
          attachmentId: expectedAttachmentId,
          version: 1,
        }),
      });
    });

    it('updates the existing attachment (bumping version) on a repeat exact hit for the same entity', async () => {
      (executeEsql as jest.Mock).mockResolvedValueOnce(exactHitResponse);

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce({
        id: expectedAttachmentId,
        current_version: 1,
      });
      (context.attachments.update as jest.Mock).mockResolvedValueOnce({
        id: expectedAttachmentId,
        current_version: 2,
      });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        context
      )) as ToolHandlerStandardReturn;

      expect(context.attachments.update).toHaveBeenCalledTimes(1);
      expect(context.attachments.update).toHaveBeenCalledWith(expectedAttachmentId, {
        data: {
          identifierType: 'host',
          identifier: 'server1',
          attachmentLabel: 'host: server1',
          entityStoreId: 'host:server1',
        },
        description: 'host: server1',
      });
      expect(context.attachments.add).not.toHaveBeenCalled();

      const otherResult = result.results[1] as OtherResult<{
        attachmentId: string;
        version: number;
        renderTag: string;
      }>;
      expect(otherResult.type).toBe(ToolResultType.other);
      expect(otherResult.data).toEqual({
        attachmentId: expectedAttachmentId,
        version: 2,
        renderTag: buildRenderAttachmentTag({
          attachmentId: expectedAttachmentId,
          version: 2,
        }),
      });
    });

    it('creates an attachment when the entity.id RLIKE fallback returns a single row whose stripped id equals the input', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty (input "server1" vs stored "host:server1")
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.name', type: 'keyword' }], values: [] })
        // 3. entity.id RLIKE fallback — single match where stripped id equals the user input
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.EngineMetadata.Type', type: 'keyword' },
          ],
          values: [['host:server1', 'server1', 'host']],
        });

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
      (context.attachments.add as jest.Mock).mockResolvedValueOnce({
        id: expectedAttachmentId,
        current_version: 1,
      });

      const result = (await tool.handler(
        { entityId: 'server1' },
        context
      )) as ToolHandlerStandardReturn;

      expect(context.attachments.add).toHaveBeenCalledTimes(1);
      expect(context.attachments.add).toHaveBeenCalledWith({
        id: expectedAttachmentId,
        type: SecurityAgentBuilderAttachments.entity,
        data: {
          identifierType: 'host',
          identifier: 'server1',
          attachmentLabel: 'host: server1',
          entityStoreId: 'host:server1',
        },
        description: 'host: server1',
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].type).toBe(ToolResultType.esqlResults);
      const otherResult = result.results[1] as OtherResult<{
        attachmentId: string;
        version: number;
        renderTag: string;
      }>;
      expect(otherResult.type).toBe(ToolResultType.other);
      expect(otherResult.data).toEqual({
        attachmentId: expectedAttachmentId,
        version: 1,
        renderTag: buildRenderAttachmentTag({
          attachmentId: expectedAttachmentId,
          version: 1,
        }),
      });
    });

    it('creates an attachment when resolved via exact entity.name match', async () => {
      const expectedHostAttachmentId = buildSingleEntityAttachmentId('host', 'LAPTOP-SALES04');

      (executeEsql as jest.Mock)
        // 1. Exact id match — empty (the input is the canonical name, not the id)
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — single hit
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.EngineMetadata.Type', type: 'keyword' },
          ],
          values: [['host:LAPTOP-SALES04', 'LAPTOP-SALES04', 'host']],
        });

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
      (context.attachments.add as jest.Mock).mockResolvedValueOnce({
        id: expectedHostAttachmentId,
        current_version: 1,
      });

      const result = (await tool.handler(
        { entityId: 'LAPTOP-SALES04' },
        context
      )) as ToolHandlerStandardReturn;

      const nameExactQuery = (executeEsql as jest.Mock).mock.calls[1][0].query;
      expect(nameExactQuery).toContain('entity.name == "LAPTOP-SALES04"');
      expect(nameExactQuery).toContain('MV_CONTAINS(user.full_name, "LAPTOP-SALES04")');
      expect(nameExactQuery).toContain('MV_CONTAINS(host.name, "LAPTOP-SALES04")');
      expect(nameExactQuery).toContain('LIMIT 2');

      expect(context.attachments.add).toHaveBeenCalledTimes(1);
      expect(context.attachments.add).toHaveBeenCalledWith({
        id: expectedHostAttachmentId,
        type: SecurityAgentBuilderAttachments.entity,
        data: {
          identifierType: 'host',
          identifier: 'LAPTOP-SALES04',
          attachmentLabel: 'host: LAPTOP-SALES04',
          entityStoreId: 'host:LAPTOP-SALES04',
        },
        description: 'host: LAPTOP-SALES04',
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].type).toBe(ToolResultType.esqlResults);
      const otherResult = result.results[1] as OtherResult<{
        attachmentId: string;
        version: number;
        renderTag: string;
      }>;
      expect(otherResult.type).toBe(ToolResultType.other);
      expect(otherResult.data).toEqual({
        attachmentId: expectedHostAttachmentId,
        version: 1,
        renderTag: buildRenderAttachmentTag({
          attachmentId: expectedHostAttachmentId,
          version: 1,
        }),
      });
    });

    it('creates an attachment when resolved via exact user.full_name match', async () => {
      const expectedUserAttachmentId = buildSingleEntityAttachmentId('user', 'jdoe');

      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — single hit via user.full_name
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.EngineMetadata.Type', type: 'keyword' },
            { name: 'user.full_name', type: 'keyword' },
          ],
          values: [['user:jdoe', 'jdoe', 'user', 'John Doe']],
        });

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
      (context.attachments.add as jest.Mock).mockResolvedValueOnce({
        id: expectedUserAttachmentId,
        current_version: 1,
      });

      const result = (await tool.handler(
        { entityId: 'John Doe' },
        context
      )) as ToolHandlerStandardReturn;

      const nameExactQuery = (executeEsql as jest.Mock).mock.calls[1][0].query;
      expect(nameExactQuery).toContain('MV_CONTAINS(user.full_name, "John Doe")');

      expect(context.attachments.add).toHaveBeenCalledTimes(1);
      expect(context.attachments.add).toHaveBeenCalledWith({
        id: expectedUserAttachmentId,
        type: SecurityAgentBuilderAttachments.entity,
        data: {
          identifierType: 'user',
          identifier: 'jdoe',
          attachmentLabel: 'user: jdoe',
          entityStoreId: 'user:jdoe',
        },
        description: 'user: jdoe',
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[1].type).toBe(ToolResultType.other);
    });

    it('creates an attachment when resolved via exact host.name match (historical hostname)', async () => {
      // Simulates a renamed host: the queried id only survives in the
      // multi-valued `host.name` array, while `entity.name` holds the newer
      // canonical name. MV_CONTAINS(host.name, ...) must still resolve the
      // row so the rich attachment is created under the current entity.name.
      const expectedHostAttachmentId = buildSingleEntityAttachmentId('host', 'LAPTOP-SALES05');

      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — single hit via host.name (historical value)
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.EngineMetadata.Type', type: 'keyword' },
            { name: 'host.name', type: 'keyword' },
          ],
          values: [
            ['host:LAPTOP-SALES05', 'LAPTOP-SALES05', 'host', ['LAPTOP-SALES04', 'LAPTOP-SALES05']],
          ],
        });

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
      (context.attachments.add as jest.Mock).mockResolvedValueOnce({
        id: expectedHostAttachmentId,
        current_version: 1,
      });

      const result = (await tool.handler(
        { entityId: 'LAPTOP-SALES04' },
        context
      )) as ToolHandlerStandardReturn;

      const nameExactQuery = (executeEsql as jest.Mock).mock.calls[1][0].query;
      expect(nameExactQuery).toContain('MV_CONTAINS(host.name, "LAPTOP-SALES04")');

      expect(context.attachments.add).toHaveBeenCalledTimes(1);
      expect(context.attachments.add).toHaveBeenCalledWith({
        id: expectedHostAttachmentId,
        type: SecurityAgentBuilderAttachments.entity,
        data: {
          identifierType: 'host',
          identifier: 'LAPTOP-SALES05',
          attachmentLabel: 'host: LAPTOP-SALES05',
          entityStoreId: 'host:LAPTOP-SALES05',
        },
        description: 'host: LAPTOP-SALES05',
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[1].type).toBe(ToolResultType.other);
    });

    it('carries the composite entity.id on the attachment for a local user so the client can rehydrate by entity.id', async () => {
      const compositeEntityId = "user:Lena Medhurst@Lena's MacBook Pro@local";
      const compositeEntityName = "Lena Medhurst@Lena's MacBook Pro";
      const expectedLocalUserAttachmentId = buildSingleEntityAttachmentId(
        'user',
        compositeEntityName
      );

      (executeEsql as jest.Mock)
        // 1. Exact id match — empty (the input is the bare name, not the id)
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — the composite entity.name hit
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.EngineMetadata.Type', type: 'keyword' },
          ],
          values: [[compositeEntityId, compositeEntityName, 'user']],
        });

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
      (context.attachments.add as jest.Mock).mockResolvedValueOnce({
        id: expectedLocalUserAttachmentId,
        current_version: 1,
      });

      await tool.handler({ entityId: compositeEntityName }, context);

      expect(context.attachments.add).toHaveBeenCalledTimes(1);
      expect(context.attachments.add).toHaveBeenCalledWith({
        id: expectedLocalUserAttachmentId,
        type: SecurityAgentBuilderAttachments.entity,
        data: {
          identifierType: 'user',
          identifier: compositeEntityName,
          attachmentLabel: `user: ${compositeEntityName}`,
          entityStoreId: compositeEntityId,
        },
        description: `user: ${compositeEntityName}`,
      });
    });

    it('does not create an attachment when exact name match returns two rows (ambiguous)', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — two rows (a host and a user share the same name)
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.EngineMetadata.Type', type: 'keyword' },
          ],
          values: [
            ['host:bob', 'bob', 'host'],
            ['user:bob', 'bob', 'user'],
          ],
        });

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

      const result = (await tool.handler(
        { entityId: 'bob' },
        context
      )) as ToolHandlerStandardReturn;

      expect(context.attachments.add).not.toHaveBeenCalled();
      expect(context.attachments.update).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(2);
      expect(result.results[0].type).toBe(ToolResultType.esqlResults);
      expect(result.results[1].type).toBe(ToolResultType.esqlResults);
    });

    it('does not create an attachment when entity.id RLIKE single hit has a non-matching stripped id', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.name', type: 'keyword' }], values: [] })
        // 3. entity.id RLIKE single hit, but the stripped id ("server1") does NOT
        // equal the user input ("server"), so this is a true substring match and
        // should not authoritatively render a card.
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.EngineMetadata.Type', type: 'keyword' },
          ],
          values: [['host:server1', 'server1', 'host']],
        });

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

      const result = (await tool.handler(
        { entityId: 'server' },
        context
      )) as ToolHandlerStandardReturn;

      expect(context.attachments.add).not.toHaveBeenCalled();
      expect(context.attachments.update).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.esqlResults);
    });

    it('does not create an attachment when the match came from the entity.name RLIKE fallback', async () => {
      (executeEsql as jest.Mock)
        // 1. Exact id match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 2. Exact name match — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.name', type: 'keyword' }], values: [] })
        // 3. entity.id RLIKE fallback — empty
        .mockResolvedValueOnce({ columns: [{ name: 'entity.id', type: 'keyword' }], values: [] })
        // 4. entity.name RLIKE fallback — single match
        .mockResolvedValueOnce({
          columns: [
            { name: 'entity.id', type: 'keyword' },
            { name: 'entity.name', type: 'keyword' },
            { name: 'entity.EngineMetadata.Type', type: 'keyword' },
          ],
          values: [['host:server1', 'server1', 'host']],
        });

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        context
      )) as ToolHandlerStandardReturn;

      expect(context.attachments.add).not.toHaveBeenCalled();
      expect(context.attachments.update).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.esqlResults);
    });

    it('does not create an attachment when zero hits are returned', async () => {
      (executeEsql as jest.Mock)
        .mockResolvedValueOnce({ columns: [], values: [] })
        .mockResolvedValueOnce({ columns: [], values: [] })
        .mockResolvedValueOnce({ columns: [], values: [] })
        .mockResolvedValueOnce({ columns: [], values: [] });

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        context
      )) as ToolHandlerStandardReturn;

      expect(context.attachments.add).not.toHaveBeenCalled();
      expect(context.attachments.update).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.error);
    });

    it('skips the attachment when the resolved row has an unknown entity type', async () => {
      (executeEsql as jest.Mock).mockResolvedValueOnce({
        columns: [
          { name: 'entity.id', type: 'keyword' },
          { name: 'entity.name', type: 'keyword' },
          { name: 'entity.EngineMetadata.Type', type: 'keyword' },
        ],
        values: [['device:d1', 'd1', 'device']],
      });

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

      const result = (await tool.handler({ entityId: 'd1' }, context)) as ToolHandlerStandardReturn;

      expect(context.attachments.add).not.toHaveBeenCalled();
      expect(context.attachments.update).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.esqlResults);
    });

    it('keeps the other result when enrichment fails on the happy path', async () => {
      (executeEsql as jest.Mock).mockResolvedValueOnce({
        columns: [
          { name: 'entity.id', type: 'keyword' },
          { name: 'entity.name', type: 'keyword' },
          { name: 'entity.EngineMetadata.Type', type: 'keyword' },
          { name: 'entity.risk.calculated_score_norm', type: 'double' },
        ],
        values: [['host:server1', 'server1', 'host', 75.5]],
      });
      mockGetEnrichedEntities.mockRejectedValueOnce(new Error('risk index unavailable'));

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
      (context.attachments.add as jest.Mock).mockResolvedValueOnce({
        id: expectedAttachmentId,
        current_version: 1,
      });

      const result = (await tool.handler(
        { entityType: 'host', entityId: 'server1' },
        context
      )) as ToolHandlerStandardReturn;

      expect(context.attachments.add).toHaveBeenCalledTimes(1);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].type).toBe(ToolResultType.esqlResults);
      expect(result.results[1].type).toBe(ToolResultType.other);
    });

    describe('attachment risk stats enrichment', () => {
      const buildRiskRecord = (
        override: Partial<EntityRiskScoreRecord> = {}
      ): EntityRiskScoreRecord =>
        ({
          '@timestamp': '2024-05-01T00:00:00Z',
          id_field: 'host.name',
          id_value: 'host:server1',
          calculated_level: 'High',
          calculated_score: 50,
          calculated_score_norm: 75,
          category_1_score: 45,
          category_1_count: 6,
          category_2_score: 5,
          category_2_count: 1,
          notes: [],
          inputs: [
            {
              id: 'alert-1',
              index: '.alerts-security.alerts-default',
              category: '',
              description: '',
              risk_score: 0,
              timestamp: '',
            },
          ],
          score_type: 'base',
          ...override,
        } as unknown as EntityRiskScoreRecord);

      const buildRiskSearchResponse = (records: EntityRiskScoreRecord[]) => ({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: {
          hits: records.map((risk, index) => ({
            _id: `risk-doc-${index}`,
            _index: 'risk-score.risk-score-default',
            _source: { host: { risk } },
          })),
          total: { value: records.length, relation: 'eq' as const },
        },
      });

      const primaryHitResponse = {
        columns: [
          { name: 'entity.id', type: 'keyword' },
          { name: 'entity.name', type: 'keyword' },
          { name: 'entity.EngineMetadata.Type', type: 'keyword' },
        ],
        values: [['host:server1', 'server1', 'host']],
      };

      const createEntityStoreStartMock = (group: {
        group_size: number;
        target: Record<string, unknown>;
      }) => ({
        createCRUDClient: jest.fn().mockReturnValue({}),
        createResolutionClient: jest.fn().mockReturnValue({
          getResolutionGroup: jest.fn().mockResolvedValue(group),
        }),
      });

      it('embeds the primary risk stats on the attachment data (and strips inputs)', async () => {
        (executeEsql as jest.Mock).mockResolvedValueOnce(primaryHitResponse);

        mockEsClient.asCurrentUser.search.mockResolvedValueOnce(
          buildRiskSearchResponse([buildRiskRecord()])
        );

        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
        (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
        (context.attachments.add as jest.Mock).mockResolvedValueOnce({
          id: expectedAttachmentId,
          current_version: 1,
        });

        await tool.handler({ entityType: 'host', entityId: 'server1' }, context);

        expect(context.attachments.add).toHaveBeenCalledTimes(1);
        const addCall = (context.attachments.add as jest.Mock).mock.calls[0][0];
        expect(addCall.data.riskStats).toBeDefined();
        expect(addCall.data.riskStats).toEqual(
          expect.objectContaining({
            calculated_level: 'High',
            calculated_score: 50,
            calculated_score_norm: 75,
            category_1_score: 45,
            category_1_count: 6,
            category_2_score: 5,
            category_2_count: 1,
          })
        );
        // `inputs` (and any other heavy fields) must never reach the
        // attachment payload — keeps the persisted state small.
        expect(addCall.data.riskStats).not.toHaveProperty('inputs');
        expect(addCall.data.resolutionRiskStats).toBeUndefined();
      });

      it('queries the risk time-series index with both V2 (prefixed EUID) and V1 (bare name) candidates and excludes resolution docs', async () => {
        (executeEsql as jest.Mock).mockResolvedValueOnce(primaryHitResponse);

        mockEsClient.asCurrentUser.search.mockResolvedValueOnce(
          buildRiskSearchResponse([buildRiskRecord()])
        );

        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
        (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
        (context.attachments.add as jest.Mock).mockResolvedValueOnce({
          id: expectedAttachmentId,
          current_version: 1,
        });

        await tool.handler({ entityType: 'host', entityId: 'server1' }, context);

        expect(mockEsClient.asCurrentUser.search).toHaveBeenCalledTimes(1);
        const searchCall = mockEsClient.asCurrentUser.search.mock.calls[0][0] as {
          index: string;
          ignore_unavailable?: boolean;
          size: number;
          query: {
            bool: { filter: unknown[]; must_not?: unknown[] };
          };
        };
        expect(searchCall.index).toBe('risk-score.risk-score-default');
        expect(searchCall.size).toBe(1);
        // `ignore_unavailable: true` keeps spaces without a risk engine from
        // tripping `index_not_found_exception` — the tool's availability gate
        // only guarantees the entity-store index, not the risk time-series
        // one, so a missing risk index should degrade to "no risk stats"
        // rather than throw.
        expect(searchCall.ignore_unavailable).toBe(true);
        // Filter matches both the prefixed EUID (V2 `user.risk.id_value`
        // convention — mirrored for hosts) and the bare identifier (V1
        // convention), which is how the flyout stays robust across
        // deployments. We mirror that here.
        expect(searchCall.query.bool.filter).toContainEqual({
          terms: { 'host.risk.id_value': ['host:server1', 'server1'] },
        });
        // The primary fetch explicitly excludes resolution-group docs so
        // the card reflects the entity's own score rather than the
        // resolution override.
        expect(searchCall.query.bool.must_not).toContainEqual({
          term: { 'host.risk.score_type': 'resolution' },
        });
      });

      it('embeds both primary and resolution risk stats when the entity is part of a resolution group', async () => {
        (executeEsql as jest.Mock).mockResolvedValueOnce(primaryHitResponse);

        const primaryRecord = buildRiskRecord({
          score_type: 'base',
          calculated_level: 'High',
          calculated_score_norm: 75,
          category_1_score: 45,
          category_1_count: 6,
        });
        const resolutionRecord = buildRiskRecord({
          score_type: 'resolution',
          calculated_level: 'Critical',
          calculated_score_norm: 95,
          category_1_score: 80,
          category_1_count: 12,
          id_value: 'host:server-canonical',
        });
        mockEsClient.asCurrentUser.search
          .mockResolvedValueOnce(buildRiskSearchResponse([primaryRecord]))
          .mockResolvedValueOnce(buildRiskSearchResponse([resolutionRecord]));

        const entityStoreStart = createEntityStoreStartMock({
          group_size: 2,
          target: {
            entity: {
              EngineMetadata: { Type: 'host' },
              id: 'host:server-canonical',
              name: 'server-canonical',
            },
          },
        });
        mockCore.getStartServices.mockResolvedValueOnce([
          mockCoreStart,
          { entityStore: entityStoreStart },
          {},
        ]);

        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
        (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
        (context.attachments.add as jest.Mock).mockResolvedValueOnce({
          id: expectedAttachmentId,
          current_version: 1,
        });

        await tool.handler({ entityType: 'host', entityId: 'server1' }, context);

        expect(entityStoreStart.createResolutionClient).toHaveBeenCalledTimes(1);
        // Resolution group is keyed on the entity-store `entity.id`, not
        // the stripped identifier.
        const resolutionClient = entityStoreStart.createResolutionClient.mock.results[0].value;
        expect(resolutionClient.getResolutionGroup).toHaveBeenCalledWith('host:server1');

        // Two risk-index queries: one for the primary (no-resolution) doc,
        // one for the resolution doc keyed on the group target's id(s).
        expect(mockEsClient.asCurrentUser.search).toHaveBeenCalledTimes(2);
        const resolutionSearchCall = mockEsClient.asCurrentUser.search.mock.calls[1][0] as {
          query: { bool: { filter: Array<Record<string, unknown>> } };
        };
        expect(resolutionSearchCall.query.bool.filter).toContainEqual({
          terms: { 'host.risk.id_value': ['host:server-canonical', 'server-canonical'] },
        });
        expect(resolutionSearchCall.query.bool.filter).toContainEqual({
          term: { 'host.risk.score_type': 'resolution' },
        });

        const addCall = (context.attachments.add as jest.Mock).mock.calls[0][0];
        expect(addCall.data.riskStats).toEqual(
          expect.objectContaining({
            calculated_level: 'High',
            calculated_score_norm: 75,
          })
        );
        expect(addCall.data.resolutionRiskStats).toEqual(
          expect.objectContaining({
            calculated_level: 'Critical',
            calculated_score_norm: 95,
            category_1_score: 80,
            category_1_count: 12,
          })
        );
        expect(addCall.data.resolutionRiskStats).not.toHaveProperty('inputs');
      });

      it('does not fetch a resolution risk doc when the group only has one member', async () => {
        (executeEsql as jest.Mock).mockResolvedValueOnce(primaryHitResponse);

        mockEsClient.asCurrentUser.search.mockResolvedValueOnce(
          buildRiskSearchResponse([buildRiskRecord()])
        );

        const entityStoreStart = createEntityStoreStartMock({
          group_size: 1,
          target: {
            entity: { EngineMetadata: { Type: 'host' }, id: 'host:server1', name: 'server1' },
          },
        });
        mockCore.getStartServices.mockResolvedValueOnce([
          mockCoreStart,
          { entityStore: entityStoreStart },
          {},
        ]);

        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
        (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
        (context.attachments.add as jest.Mock).mockResolvedValueOnce({
          id: expectedAttachmentId,
          current_version: 1,
        });

        await tool.handler({ entityType: 'host', entityId: 'server1' }, context);

        // Only the primary risk-index query should run for a solo group.
        expect(mockEsClient.asCurrentUser.search).toHaveBeenCalledTimes(1);
        const addCall = (context.attachments.add as jest.Mock).mock.calls[0][0];
        expect(addCall.data.resolutionRiskStats).toBeUndefined();
      });

      it('omits riskStats when the risk index has no document for the entity', async () => {
        (executeEsql as jest.Mock).mockResolvedValueOnce(primaryHitResponse);

        mockEsClient.asCurrentUser.search.mockResolvedValueOnce(buildRiskSearchResponse([]));

        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
        (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
        (context.attachments.add as jest.Mock).mockResolvedValueOnce({
          id: expectedAttachmentId,
          current_version: 1,
        });

        await tool.handler({ entityType: 'host', entityId: 'server1' }, context);

        const addCall = (context.attachments.add as jest.Mock).mock.calls[0][0];
        expect(addCall.data.riskStats).toBeUndefined();
        expect(addCall.data.resolutionRiskStats).toBeUndefined();
      });

      it('still creates the attachment (without risk stats) when the risk index query throws', async () => {
        (executeEsql as jest.Mock).mockResolvedValueOnce(primaryHitResponse);

        mockEsClient.asCurrentUser.search.mockRejectedValueOnce(
          new Error('risk index unavailable')
        );

        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
        (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
        (context.attachments.add as jest.Mock).mockResolvedValueOnce({
          id: expectedAttachmentId,
          current_version: 1,
        });

        await tool.handler({ entityType: 'host', entityId: 'server1' }, context);

        expect(context.attachments.add).toHaveBeenCalledTimes(1);
        const addCall = (context.attachments.add as jest.Mock).mock.calls[0][0];
        expect(addCall.data.riskStats).toBeUndefined();
      });

      it('embeds primary risk stats when the resolution fetch fails but the primary succeeds', async () => {
        (executeEsql as jest.Mock).mockResolvedValueOnce(primaryHitResponse);

        mockEsClient.asCurrentUser.search.mockResolvedValueOnce(
          buildRiskSearchResponse([buildRiskRecord()])
        );

        const entityStoreStart = {
          createCRUDClient: jest.fn().mockReturnValue({}),
          createResolutionClient: jest.fn().mockReturnValue({
            getResolutionGroup: jest
              .fn()
              .mockRejectedValueOnce(new Error('resolution index unavailable')),
          }),
        };
        mockCore.getStartServices.mockResolvedValueOnce([
          mockCoreStart,
          { entityStore: entityStoreStart },
          {},
        ]);

        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
        (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValueOnce(undefined);
        (context.attachments.add as jest.Mock).mockResolvedValueOnce({
          id: expectedAttachmentId,
          current_version: 1,
        });

        await tool.handler({ entityType: 'host', entityId: 'server1' }, context);

        const addCall = (context.attachments.add as jest.Mock).mock.calls[0][0];
        expect(addCall.data.riskStats).toBeDefined();
        expect(addCall.data.resolutionRiskStats).toBeUndefined();
      });
    });
  });
});
