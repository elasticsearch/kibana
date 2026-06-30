/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType, type ErrorResult, type OtherResult } from '@kbn/agent-builder-common';
import { ConfirmationStatus } from '@kbn/agent-builder-common/agents/prompts';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import type { ExperimentalFeatures } from '../../../../common';
import {
  createToolHandlerContext,
  createToolTestMocks,
  setupMockCoreStartServices,
} from '../../__mocks__/test_helpers';
import { setAssetCriticalityTool } from './set_asset_criticality_tool';

const ENTITY_ID = 'host:server1';
const ENTITY_TYPE = 'host' as const;
const CRITICALITY = 'high_impact' as const;

const mockExperimentalFeatures = {
  entityAnalyticsEntityStoreV2: true,
} as unknown as ExperimentalFeatures;

describe('setAssetCriticalityTool', () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();

  let mockBulkUpdateEntity: jest.Mock;
  let mockCreateCRUDClient: jest.Mock;

  const handlerContext = () => createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

  beforeEach(() => {
    jest.clearAllMocks();
    mockBulkUpdateEntity = jest.fn().mockResolvedValue([]);
    mockCreateCRUDClient = jest.fn().mockReturnValue({
      bulkUpdateEntity: mockBulkUpdateEntity,
    });

    const mockCoreStart = setupMockCoreStartServices(mockCore, mockEsClient);
    mockCore.getStartServices.mockResolvedValue([
      mockCoreStart,
      {
        entityStore: { createCRUDClient: mockCreateCRUDClient },
      },
      {},
    ]);
  });

  const tool = setAssetCriticalityTool(mockCore, mockLogger, mockExperimentalFeatures);

  describe('schema', () => {
    it('accepts valid inputs', () => {
      expect(
        tool.schema.safeParse({
          entityId: ENTITY_ID,
          entityType: ENTITY_TYPE,
          criticality: CRITICALITY,
        }).success
      ).toBe(true);
    });

    it('accepts all valid criticality levels', () => {
      for (const level of [
        'low_impact',
        'medium_impact',
        'high_impact',
        'extreme_impact',
        'unassigned',
      ]) {
        expect(
          tool.schema.safeParse({
            entityId: ENTITY_ID,
            entityType: ENTITY_TYPE,
            criticality: level,
          }).success
        ).toBe(true);
      }
    });

    it('accepts all valid entity types', () => {
      for (const entityType of ['host', 'user', 'service', 'generic']) {
        expect(
          tool.schema.safeParse({ entityId: ENTITY_ID, entityType, criticality: CRITICALITY })
            .success
        ).toBe(true);
      }
    });

    it('rejects empty entityId', () => {
      expect(
        tool.schema.safeParse({ entityId: '', entityType: ENTITY_TYPE, criticality: CRITICALITY })
          .success
      ).toBe(false);
    });

    it('rejects missing entityId', () => {
      expect(
        tool.schema.safeParse({ entityType: ENTITY_TYPE, criticality: CRITICALITY }).success
      ).toBe(false);
    });

    it('rejects invalid criticality level', () => {
      expect(
        tool.schema.safeParse({
          entityId: ENTITY_ID,
          entityType: ENTITY_TYPE,
          criticality: 'critical',
        }).success
      ).toBe(false);
    });

    it('rejects invalid entity type', () => {
      expect(
        tool.schema.safeParse({
          entityId: ENTITY_ID,
          entityType: 'process',
          criticality: CRITICALITY,
        }).success
      ).toBe(false);
    });
  });

  describe('handler — HITL', () => {
    it('returns confirmation prompt when status is unprompted', async () => {
      const ctx = handlerContext();
      (ctx.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.unprompted,
      });
      (ctx.prompts.askForConfirmation as jest.Mock).mockReturnValue({ type: 'confirmation' });

      const result = await tool.handler(
        { entityId: ENTITY_ID, entityType: ENTITY_TYPE, criticality: CRITICALITY },
        ctx
      );

      expect(result).toEqual({ type: 'confirmation' });
      expect(mockBulkUpdateEntity).not.toHaveBeenCalled();
    });

    it('includes the entity id in the confirmation message', async () => {
      const ctx = handlerContext();
      (ctx.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.unprompted,
      });
      (ctx.prompts.askForConfirmation as jest.Mock).mockReturnValue({ type: 'confirmation' });

      await tool.handler(
        { entityId: ENTITY_ID, entityType: ENTITY_TYPE, criticality: CRITICALITY },
        ctx
      );

      expect(ctx.prompts.askForConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(ENTITY_ID),
        })
      );
    });

    it('includes the criticality level in the confirmation message', async () => {
      const ctx = handlerContext();
      (ctx.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.unprompted,
      });
      (ctx.prompts.askForConfirmation as jest.Mock).mockReturnValue({ type: 'confirmation' });

      await tool.handler(
        { entityId: ENTITY_ID, entityType: ENTITY_TYPE, criticality: CRITICALITY },
        ctx
      );

      expect(ctx.prompts.askForConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(CRITICALITY),
        })
      );
    });

    it('uses "unassigned" wording in message when removing criticality', async () => {
      const ctx = handlerContext();
      (ctx.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.unprompted,
      });
      (ctx.prompts.askForConfirmation as jest.Mock).mockReturnValue({ type: 'confirmation' });

      await tool.handler(
        { entityId: ENTITY_ID, entityType: ENTITY_TYPE, criticality: 'unassigned' },
        ctx
      );

      expect(ctx.prompts.askForConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('remove'),
        })
      );
    });

    it('returns cancelled error when status is rejected', async () => {
      const ctx = handlerContext();
      (ctx.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.rejected,
      });

      const result = (await tool.handler(
        { entityId: ENTITY_ID, entityType: ENTITY_TYPE, criticality: CRITICALITY },
        ctx
      )) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      const errResult = result.results[0] as ErrorResult;
      expect(errResult.type).toBe(ToolResultType.error);
      expect((errResult.data as { message: string }).message).toContain('cancelled');
      expect(mockBulkUpdateEntity).not.toHaveBeenCalled();
    });
  });

  describe('handler — accepted', () => {
    const acceptedCtx = () => {
      const ctx = handlerContext();
      (ctx.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.accepted,
      });
      return ctx;
    };

    it('calls bulkUpdateEntity with the entity id, type, and criticality level', async () => {
      const ctx = acceptedCtx();
      await tool.handler(
        { entityId: ENTITY_ID, entityType: ENTITY_TYPE, criticality: CRITICALITY },
        ctx
      );

      expect(mockBulkUpdateEntity).toHaveBeenCalledWith({
        objects: [
          {
            type: ENTITY_TYPE,
            doc: expect.objectContaining({
              entity: { id: ENTITY_ID },
              asset: { criticality: CRITICALITY },
            }),
          },
        ],
        force: true,
      });
    });

    it('passes null to bulkUpdateEntity when criticality is "unassigned"', async () => {
      const ctx = acceptedCtx();
      await tool.handler(
        { entityId: ENTITY_ID, entityType: ENTITY_TYPE, criticality: 'unassigned' },
        ctx
      );

      expect(mockBulkUpdateEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          objects: [
            expect.objectContaining({
              doc: expect.objectContaining({
                asset: { criticality: null },
              }),
            }),
          ],
        })
      );
    });

    it('returns success result on successful update', async () => {
      const ctx = acceptedCtx();
      const result = (await tool.handler(
        { entityId: ENTITY_ID, entityType: ENTITY_TYPE, criticality: CRITICALITY },
        ctx
      )) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      const other = result.results[0] as OtherResult;
      expect(other.type).toBe(ToolResultType.other);
      expect((other.data as { success: boolean }).success).toBe(true);
      expect((other.data as { entityId: string }).entityId).toBe(ENTITY_ID);
      expect((other.data as { criticality: string }).criticality).toBe(CRITICALITY);
    });

    it('returns error result when bulkUpdateEntity returns errors', async () => {
      mockBulkUpdateEntity.mockResolvedValue([
        {
          _id: 'abc',
          status: 400,
          type: 'illegal_argument_exception',
          reason: 'Engine not running',
        },
      ]);
      const ctx = acceptedCtx();
      const result = (await tool.handler(
        { entityId: ENTITY_ID, entityType: ENTITY_TYPE, criticality: CRITICALITY },
        ctx
      )) as ToolHandlerStandardReturn;

      const errResult = result.results[0] as ErrorResult;
      expect(errResult.type).toBe(ToolResultType.error);
      expect((errResult.data as { message: string }).message).toContain('Engine not running');
    });

    it('returns error result when bulkUpdateEntity throws', async () => {
      mockBulkUpdateEntity.mockRejectedValue(new Error('ES unavailable'));
      const ctx = acceptedCtx();
      const result = (await tool.handler(
        { entityId: ENTITY_ID, entityType: ENTITY_TYPE, criticality: CRITICALITY },
        ctx
      )) as ToolHandlerStandardReturn;

      const errResult = result.results[0] as ErrorResult;
      expect(errResult.type).toBe(ToolResultType.error);
      expect((errResult.data as { message: string }).message).toContain('ES unavailable');
    });
  });
});
