/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType, type ErrorResult, type OtherResult } from '@kbn/agent-builder-common';
import { ConfirmationStatus } from '@kbn/agent-builder-common/agents/prompts';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import type { ExperimentalFeatures } from '../../../../../common';
import { createToolHandlerContext, createToolTestMocks } from '../../../__mocks__/test_helpers';
import { dismissLeadTool } from './dismiss_lead_tool';
import { createLeadDataClient } from '../../../../lib/entity_analytics/lead_generation/lead_data_client';
import { getUserLeadPrivileges } from '../../../../lib/entity_analytics/lead_generation/get_user_lead_privileges';

jest.mock('../../../../lib/entity_analytics/lead_generation/lead_data_client');
jest.mock('../../../../lib/entity_analytics/lead_generation/get_user_lead_privileges');

const mockCreateLeadDataClient = createLeadDataClient as jest.Mock;
const mockGetUserLeadPrivileges = getUserLeadPrivileges as jest.Mock;

const mockExperimentalFeatures = { leadGenerationEnabled: true } as ExperimentalFeatures;

const LEAD_ID = 'lead-abc-123';
const LEAD_TITLE = 'Suspicious lateral movement detected';

describe('dismissLeadTool', () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const tool = dismissLeadTool(mockCore, mockLogger, mockExperimentalFeatures);

  let mockDismissLead: jest.Mock;

  const handlerContext = () => createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

  beforeEach(() => {
    jest.clearAllMocks();
    mockDismissLead = jest.fn().mockResolvedValue(true);
    mockCreateLeadDataClient.mockReturnValue({ dismissLead: mockDismissLead });
    mockGetUserLeadPrivileges.mockResolvedValue({
      adhoc: { has_read_permissions: true, has_write_permissions: true },
      scheduled: { has_read_permissions: true, has_write_permissions: true },
      has_all_required: true,
      privileges: {},
    });
  });

  describe('schema', () => {
    it('accepts a valid lead id', () => {
      expect(tool.schema.safeParse({ id: LEAD_ID }).success).toBe(true);
    });

    it('accepts id with optional title', () => {
      expect(tool.schema.safeParse({ id: LEAD_ID, title: LEAD_TITLE }).success).toBe(true);
    });

    it('rejects an empty id string', () => {
      expect(tool.schema.safeParse({ id: '' }).success).toBe(false);
    });

    it('rejects missing id', () => {
      expect(tool.schema.safeParse({}).success).toBe(false);
    });
  });

  describe('handler — privilege check', () => {
    it('returns permission error when user lacks write permissions', async () => {
      mockGetUserLeadPrivileges.mockResolvedValue({
        adhoc: { has_read_permissions: true, has_write_permissions: false },
        scheduled: { has_read_permissions: true, has_write_permissions: false },
        has_all_required: false,
        privileges: {},
      });
      const ctx = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

      const result = (await tool.handler({ id: LEAD_ID }, ctx)) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      const errResult = result.results[0] as ErrorResult;
      expect(errResult.type).toBe(ToolResultType.error);
      expect((errResult.data as { message: string }).message).toContain('permission');
      expect(mockDismissLead).not.toHaveBeenCalled();
    });
  });

  describe('handler — HITL', () => {
    it('shows lead title in confirmation message when title is provided', async () => {
      const ctx = handlerContext();
      (ctx.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.unprompted,
      });
      (ctx.prompts.askForConfirmation as jest.Mock).mockReturnValue({ type: 'confirmation' });

      await tool.handler({ id: LEAD_ID, title: LEAD_TITLE }, ctx);

      expect(ctx.prompts.askForConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Dismiss lead',
          message: expect.stringContaining(LEAD_TITLE),
        })
      );
    });

    it('falls back to lead id in confirmation message when title is not provided', async () => {
      const ctx = handlerContext();
      (ctx.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.unprompted,
      });
      (ctx.prompts.askForConfirmation as jest.Mock).mockReturnValue({ type: 'confirmation' });

      await tool.handler({ id: LEAD_ID }, ctx);

      expect(ctx.prompts.askForConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(LEAD_ID),
        })
      );
    });

    it('returns a confirmation prompt when status is unprompted', async () => {
      const ctx = handlerContext();
      (ctx.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.unprompted,
      });
      (ctx.prompts.askForConfirmation as jest.Mock).mockReturnValue({ type: 'confirmation' });

      const result = await tool.handler({ id: LEAD_ID }, ctx);

      expect(mockDismissLead).not.toHaveBeenCalled();
      expect(result).toEqual({ type: 'confirmation' });
    });

    it('returns cancelled error when status is rejected', async () => {
      const ctx = handlerContext();
      (ctx.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.rejected,
      });

      const result = (await tool.handler({ id: LEAD_ID }, ctx)) as ToolHandlerStandardReturn;

      expect(result.results).toHaveLength(1);
      const errResult = result.results[0] as ErrorResult;
      expect(errResult.type).toBe(ToolResultType.error);
      expect((errResult.data as { message: string }).message).toContain('cancelled');
      expect(mockDismissLead).not.toHaveBeenCalled();
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

    it('returns success when lead is dismissed', async () => {
      const ctx = acceptedCtx();
      const result = (await tool.handler({ id: LEAD_ID }, ctx)) as ToolHandlerStandardReturn;

      expect(mockDismissLead).toHaveBeenCalledWith(LEAD_ID);
      expect(result.results).toHaveLength(1);
      const other = result.results[0] as OtherResult;
      expect(other.type).toBe(ToolResultType.other);
      expect((other.data as { success: boolean; id: string }).success).toBe(true);
      expect((other.data as { success: boolean; id: string }).id).toBe(LEAD_ID);
    });

    it('returns not-found error when dismissLead returns false', async () => {
      mockDismissLead.mockResolvedValue(false);
      const ctx = acceptedCtx();
      const result = (await tool.handler({ id: LEAD_ID }, ctx)) as ToolHandlerStandardReturn;

      const errResult = result.results[0] as ErrorResult;
      expect(errResult.type).toBe(ToolResultType.error);
      expect((errResult.data as { message: string }).message).toContain('not found');
    });

    it('returns error result when dismissLead throws', async () => {
      mockDismissLead.mockRejectedValue(new Error('ES unavailable'));
      const ctx = acceptedCtx();
      const result = (await tool.handler({ id: LEAD_ID }, ctx)) as ToolHandlerStandardReturn;

      const errResult = result.results[0] as ErrorResult;
      expect(errResult.type).toBe(ToolResultType.error);
      expect((errResult.data as { message: string }).message).toContain('ES unavailable');
    });
  });
});
