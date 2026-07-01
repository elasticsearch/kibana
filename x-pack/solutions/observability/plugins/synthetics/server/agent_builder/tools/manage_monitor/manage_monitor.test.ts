/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { agentBuilderMocks } from '@kbn/agent-builder-plugin/server/mocks';
import type { ToolHandlerContextMock } from '@kbn/agent-builder-plugin/server/mocks';
import { MONITOR_ATTACHMENT_TYPE } from '../../../../common/agent_builder/attachments/monitor_attachment_schema';
import { syntheticsTools } from '../../common/constants';
import { manageMonitorTool } from './manage_monitor';
import type { MonitorOperation } from './operations';

const createContext = (): ToolHandlerContextMock => {
  const ctx = agentBuilderMocks.tools.createHandlerContext();
  ctx.attachments.add.mockResolvedValue({
    id: 'mock-attachment-id',
    current_version: 1,
  } as never);
  ctx.attachments.update.mockResolvedValue({
    id: 'mock-attachment-id',
    current_version: 2,
  } as never);
  return ctx;
};

const validCreateOperations: MonitorOperation[] = [
  { operation: 'set_metadata', name: 'example.com health' },
  { operation: 'set_url', urls: 'https://example.com' },
  { operation: 'set_schedule', number: '5', unit: 'm' },
  { operation: 'set_locations', locations: [{ id: 'us_central' }] },
  { operation: 'validate' },
];

describe('manageMonitorTool', () => {
  const tool = manageMonitorTool();

  it('exposes the namespaced tool id', () => {
    expect(tool.id).toBe(syntheticsTools.manageMonitor);
  });

  describe('handler — create flow', () => {
    it('creates a new attachment with the synthetics.monitor type', async () => {
      const ctx = createContext();

      const result = await tool.handler({ operations: validCreateOperations }, ctx);

      expect(ctx.attachments.add).toHaveBeenCalledTimes(1);
      expect(ctx.attachments.update).not.toHaveBeenCalled();

      const addCall = ctx.attachments.add.mock.calls[0][0] as {
        id: string;
        type: string;
        data: { type: string; metadata: { name: string } };
      };
      expect(addCall.type).toBe(MONITOR_ATTACHMENT_TYPE);
      expect(addCall.id).toEqual(expect.any(String));
      expect(addCall.data).toEqual(
        expect.objectContaining({
          type: 'http',
          urls: 'https://example.com',
          schedule: { number: '5', unit: 'm' },
        })
      );

      const { results } = result as {
        results: Array<{
          type: string;
          data?: { monitorAttachment?: { id?: string; name?: string } };
        }>;
      };
      expect(results[0].type).toBe(ToolResultType.other);
      expect(results[0].data?.monitorAttachment?.id).toBe('mock-attachment-id');
      expect(results[0].data?.monitorAttachment?.name).toBe('example.com health');
    });

    it('returns an error when creating without a monitor name', async () => {
      const ctx = createContext();

      const result = await tool.handler(
        {
          operations: [{ operation: 'set_url', urls: 'https://example.com' }],
        },
        ctx
      );

      expect(ctx.attachments.add).not.toHaveBeenCalled();
      const { results } = result as { results: Array<{ type: string; data: { message: string } }> };
      expect(results[0].type).toBe(ToolResultType.error);
      expect(results[0].data.message).toContain('monitor name is required');
    });

    it('returns an error when validate fails on a half-built monitor', async () => {
      const ctx = createContext();

      const result = await tool.handler(
        {
          operations: [{ operation: 'set_metadata', name: 'M' }, { operation: 'validate' }],
        },
        ctx
      );

      expect(ctx.attachments.add).not.toHaveBeenCalled();
      const { results } = result as { results: Array<{ type: string; data: { message: string } }> };
      expect(results[0].type).toBe(ToolResultType.error);
      expect(results[0].data.message).toContain('not ready to save');
    });
  });

  describe('handler — update flow', () => {
    it('updates an existing attachment when monitorAttachmentId is provided', async () => {
      const ctx = createContext();
      ctx.attachments.getAttachmentRecord.mockReturnValue({
        versions: [
          {
            data: {
              type: 'http',
              metadata: { name: 'Persisted' },
              urls: 'https://example.com',
              schedule: { number: '5', unit: 'm' },
              locations: [{ id: 'us_central' }],
            },
          },
        ],
      } as never);

      const result = await tool.handler(
        {
          monitorAttachmentId: 'persisting-id',
          operations: [{ operation: 'set_schedule', number: '10', unit: 'm' }],
        },
        ctx
      );

      expect(ctx.attachments.update).toHaveBeenCalledTimes(1);
      expect(ctx.attachments.add).not.toHaveBeenCalled();
      const updateCall = ctx.attachments.update.mock.calls[0];
      expect(updateCall[0]).toBe('persisting-id');
      expect((updateCall[1] as { data: { schedule: { number: string } } }).data.schedule).toEqual({
        number: '10',
        unit: 'm',
      });

      const { results } = result as { results: Array<{ type: string }> };
      expect(results[0].type).toBe(ToolResultType.other);
    });
  });

  describe('handler — error handling', () => {
    it('returns an error when attachment persistence resolves undefined', async () => {
      const ctx = createContext();
      ctx.attachments.add.mockResolvedValue(undefined as never);

      const result = await tool.handler({ operations: validCreateOperations }, ctx);

      const { results } = result as { results: Array<{ type: string; data: { message: string } }> };
      expect(results[0].type).toBe(ToolResultType.error);
      expect(results[0].data.message).toContain('Failed to persist monitor attachment');
    });

    it('does not call synthetics APIs — handler only mutates attachments', async () => {
      const ctx = createContext();

      await tool.handler({ operations: validCreateOperations }, ctx);

      const esqlMock = ctx.esClient.asCurrentUser.esql.query as unknown as jest.Mock;
      expect(esqlMock).not.toHaveBeenCalled();
    });
  });

  describe('logger severity', () => {
    it('logs validation errors at debug (not warn or error)', async () => {
      const ctx = createContext();

      await tool.handler(
        { operations: [{ operation: 'set_url', urls: 'https://example.com' }] },
        ctx
      );

      expect(ctx.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('manage_monitor tool: invalid input')
      );
      expect(ctx.logger.warn).not.toHaveBeenCalled();
      expect(ctx.logger.error).not.toHaveBeenCalled();
    });

    it('logs unexpected errors at warn (not error)', async () => {
      const ctx = createContext();
      ctx.attachments.add.mockRejectedValueOnce(new Error('SO client exploded'));

      await tool.handler({ operations: validCreateOperations }, ctx);

      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error in manage_monitor tool')
      );
      expect(ctx.logger.error).not.toHaveBeenCalled();
    });
  });
});
