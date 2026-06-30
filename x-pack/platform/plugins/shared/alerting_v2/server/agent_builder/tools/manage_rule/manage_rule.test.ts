/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { agentBuilderMocks } from '@kbn/agent-builder-plugin/server/mocks';
import type { ToolHandlerContextMock } from '@kbn/agent-builder-plugin/server/mocks';
import { manageRuleTool } from './manage_rule';
import { AGENT_BUILDER_TAG } from '../../common/constants';

const getEsqlQueryMock = (ctx: ToolHandlerContextMock) =>
  ctx.esClient.asCurrentUser.esql.query as unknown as jest.Mock;

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

describe('manageRuleTool', () => {
  const tool = manageRuleTool();

  describe('handler', () => {
    it('creates a new rule attachment with valid operations', async () => {
      const ctx = createContext();
      getEsqlQueryMock(ctx).mockResolvedValueOnce({
        columns: [
          { name: 'host.name', type: 'keyword' },
          { name: 'avg_cpu', type: 'double' },
        ],
        values: [],
      });

      const result = await tool.handler(
        {
          operations: [
            { operation: 'set_metadata', name: 'CPU Alert', description: 'High CPU' },
            { operation: 'set_kind', kind: 'alert' },
            {
              operation: 'set_query',
              query: {
                format: 'standalone',
                breach: { query: 'FROM metrics-* | STATS avg_cpu = AVG(cpu) BY host.name' },
              },
            },
          ],
        },
        ctx
      );

      expect(ctx.attachments.add).toHaveBeenCalledTimes(1);
      expect(ctx.attachments.update).not.toHaveBeenCalled();
      expect(result).toHaveProperty('results');
      const { results } = result as {
        results: Array<{ type: string; data?: { ruleAttachment?: { ruleId?: string } } }>;
      };
      expect(results[0].type).toBe(ToolResultType.other);

      // Pre-assigned rule ID is returned in the tool result
      expect(results[0].data?.ruleAttachment?.ruleId).toBeDefined();
      expect(typeof results[0].data?.ruleAttachment?.ruleId).toBe('string');

      // The attachment data stored via add() includes the pre-assigned rule ID
      const addCall = ctx.attachments.add.mock.calls[0][0] as { data: { id?: string } };
      expect(addCall.data.id).toBeDefined();
      expect(addCall.data.id).toBe(results[0].data?.ruleAttachment?.ruleId);
    });

    it('passes esClient to executeRuleOperations for query validation', async () => {
      const ctx = createContext();
      const esqlMock = getEsqlQueryMock(ctx);
      esqlMock.mockResolvedValueOnce({
        columns: [{ name: 'count', type: 'long' }],
        values: [],
      });

      await tool.handler(
        {
          operations: [
            { operation: 'set_metadata', name: 'Test' },
            {
              operation: 'set_query',
              query: { format: 'standalone', breach: { query: 'FROM logs-* | STATS COUNT(*)' } },
            },
          ],
        },
        ctx
      );

      expect(esqlMock).toHaveBeenCalledWith({
        query: 'FROM logs-* | STATS COUNT(*) | LIMIT 0',
        format: 'json',
      });
    });

    it('returns an error result when query validation fails', async () => {
      const ctx = createContext();
      getEsqlQueryMock(ctx).mockRejectedValueOnce(new Error('Unknown index [bad-index-*]'));

      const result = await tool.handler(
        {
          operations: [
            { operation: 'set_metadata', name: 'Bad Query Rule' },
            {
              operation: 'set_query',
              query: {
                format: 'standalone',
                breach: { query: 'FROM bad-index-* | STATS COUNT(*)' },
              },
            },
          ],
        },
        ctx
      );

      expect(ctx.attachments.add).not.toHaveBeenCalled();
      const { results } = result as { results: Array<{ type: string; data: { message: string } }> };
      expect(results[0].type).toBe(ToolResultType.error);
      expect(results[0].data.message).toContain('Invalid ES|QL query');
      expect(results[0].data.message).toContain('Unknown index [bad-index-*]');
    });

    it('returns an error when creating a rule without a name', async () => {
      const ctx = createContext();

      const result = await tool.handler(
        {
          operations: [{ operation: 'set_kind', kind: 'alert' }],
        },
        ctx
      );

      const { results } = result as { results: Array<{ type: string; data: { message: string } }> };
      expect(results[0].type).toBe(ToolResultType.error);
      expect(results[0].data.message).toContain('rule name is required');
    });

    it('stores recovery_strategy and no_data_strategy from set_query', async () => {
      const ctx = createContext();
      getEsqlQueryMock(ctx).mockResolvedValueOnce({
        columns: [{ name: 'host.name', type: 'keyword' }],
        values: [],
      });

      await tool.handler(
        {
          operations: [
            { operation: 'set_metadata', name: 'Recovery Rule' },
            { operation: 'set_kind', kind: 'alert' },
            {
              operation: 'set_query',
              query: {
                format: 'standalone',
                breach: { query: 'FROM metrics-* | WHERE cpu > 0.9' },
                recovery: { query: 'FROM metrics-* | WHERE cpu < 0.5' },
              },
              recovery_strategy: 'query',
            },
          ],
        },
        ctx
      );

      const addCall = ctx.attachments.add.mock.calls[0][0] as {
        data: { recovery_strategy?: string };
      };
      expect(addCall.data.recovery_strategy).toBe('query');
    });

    it('stores no_data_strategy and no_data from set_query', async () => {
      const ctx = createContext();
      getEsqlQueryMock(ctx).mockResolvedValueOnce({
        columns: [{ name: 'host.name', type: 'keyword' }],
        values: [],
      });

      await tool.handler(
        {
          operations: [
            { operation: 'set_metadata', name: 'No-Data Rule' },
            { operation: 'set_kind', kind: 'alert' },
            {
              operation: 'set_query',
              query: {
                format: 'standalone',
                breach: { query: 'FROM metrics-* | WHERE cpu > 0.9' },
                no_data: { query: 'FROM heartbeat-* | STATS count = COUNT(*) BY host.name' },
              },
              no_data_strategy: 'emit',
            },
          ],
        },
        ctx
      );

      const addCall = ctx.attachments.add.mock.calls[0][0] as {
        data: { no_data_strategy?: string };
      };
      expect(addCall.data.no_data_strategy).toBe('emit');
    });

    it('updates an persisted attachment when ruleAttachmentId is provided', async () => {
      const ctx = createContext();
      ctx.attachments.getAttachmentRecord.mockReturnValue({
        versions: [
          {
            data: {
              metadata: { name: 'Persisted Rule' },
              kind: 'alert',
              query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 1' } },
            },
          },
        ],
      } as never);

      const result = await tool.handler(
        {
          ruleAttachmentId: 'persisting-id',
          operations: [{ operation: 'set_kind', kind: 'signal' }],
        },
        ctx
      );

      expect(ctx.attachments.update).toHaveBeenCalledTimes(1);
      expect(ctx.attachments.add).not.toHaveBeenCalled();
      const { results } = result as { results: Array<{ type: string }> };
      expect(results[0].type).toBe(ToolResultType.other);

      // The agent-builder-assisted tag is stamped on the data persisted via update()
      const updateCall = ctx.attachments.update.mock.calls[0][1] as {
        data: { metadata?: { tags?: string[] } };
      };
      expect(updateCall.data.metadata?.tags).toContain(AGENT_BUILDER_TAG);
    });

    it('returns an error when attachment persistence fails', async () => {
      const ctx = createContext();
      ctx.attachments.add.mockResolvedValue(undefined as never);

      const result = await tool.handler(
        {
          operations: [{ operation: 'set_metadata', name: 'Failing Rule' }],
        },
        ctx
      );

      const { results } = result as { results: Array<{ type: string; data: { message: string } }> };
      expect(results[0].type).toBe(ToolResultType.error);
      expect(results[0].data.message).toContain('Failed to persist rule attachment');
    });
  });

  describe('logger severity', () => {
    it('logs validation errors at debug level (not warn or error)', async () => {
      const ctx = createContext();

      await tool.handler({ operations: [{ operation: 'set_kind', kind: 'alert' }] }, ctx);

      expect(ctx.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('manage_rule tool: invalid input')
      );
      expect(ctx.logger.warn).not.toHaveBeenCalled();
      expect(ctx.logger.error).not.toHaveBeenCalled();
    });

    it('logs unexpected errors at warn level (not error)', async () => {
      const ctx = createContext();
      ctx.attachments.add.mockRejectedValueOnce(new Error('ES exploded'));

      await tool.handler(
        {
          operations: [{ operation: 'set_metadata', name: 'Boom' }],
        },
        ctx
      );

      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error in manage_rule tool')
      );
      expect(ctx.logger.error).not.toHaveBeenCalled();
    });
  });
});
