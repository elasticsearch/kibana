/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import {
  ToolResultType,
  type ErrorResult,
  type OtherResult,
} from '@kbn/agent-builder-common/tools/tool_result';
import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools/handler';
import type { ToolAvailabilityContext } from '@kbn/agent-builder-server';
import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  CONTEXT_ENGINE_ENABLED_SETTING_ID,
} from '@kbn/management-settings-ids';
import { createSmlAttachTool } from './sml_attach';

const buildAvailabilityContext = (flags: Record<string, boolean>) =>
  ({
    uiSettings: {
      get: jest.fn(async (key: string) => flags[key]),
    },
  } as unknown as ToolAvailabilityContext);

const mockResolveSmlAttachItems = jest.fn();
const mockAttachmentsAdd = jest.fn();

const getAgentContextLayer = jest.fn(() => ({
  search: jest.fn(),
  indexAttachment: jest.fn(),
  deleteAttachment: jest.fn(),
  getDocuments: jest.fn(),
  getTypeDefinition: jest.fn(),
  resolveSmlAttachItems: mockResolveSmlAttachItems,
}));

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };

const mockContext = {
  spaceId: 'default',
  esClient: { asCurrentUser: {}, asInternalUser: {} },
  request: {},
  savedObjectsClient: {},
  attachments: { add: mockAttachmentsAdd },
  logger: mockLogger,
};

describe('createSmlAttachTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('has correct id and tags', () => {
    const tool = createSmlAttachTool({ getAgentContextLayer });
    expect(tool.id).toBe(platformCoreTools.smlAttach);
    expect(tool.type).toBe(ToolType.builtin);
    expect(tool.tags).toEqual(['sml', 'attachment']);
  });

  describe('availability', () => {
    it('is available only when both experimental features and the Context Engine are enabled', async () => {
      const tool = createSmlAttachTool({ getAgentContextLayer });
      const result = await tool.availability!.handler(
        buildAvailabilityContext({
          [AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID]: true,
          [CONTEXT_ENGINE_ENABLED_SETTING_ID]: true,
        })
      );
      expect(result.status).toBe('available');
    });

    it('is unavailable when experimental features are disabled', async () => {
      const tool = createSmlAttachTool({ getAgentContextLayer });
      const result = await tool.availability!.handler(
        buildAvailabilityContext({
          [AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID]: false,
          [CONTEXT_ENGINE_ENABLED_SETTING_ID]: true,
        })
      );
      expect(result.status).toBe('unavailable');
    });

    it('is unavailable when the Context Engine is disabled', async () => {
      const tool = createSmlAttachTool({ getAgentContextLayer });
      const result = await tool.availability!.handler(
        buildAvailabilityContext({
          [AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID]: true,
          [CONTEXT_ENGINE_ENABLED_SETTING_ID]: false,
        })
      );
      expect(result.status).toBe('unavailable');
    });
  });

  it('returns error result when resolveSmlAttachItems reports access denied', async () => {
    mockResolveSmlAttachItems.mockResolvedValue([
      {
        success: false,
        chunk_id: 'chunk-1',
        message: 'Access denied: you do not have the required permissions',
      },
    ]);
    const tool = createSmlAttachTool({ getAgentContextLayer });
    const result = (await tool.handler(
      { chunk_ids: ['chunk-1'] },
      mockContext as unknown as ToolHandlerContext
    )) as { results: unknown[] };
    expect(result.results).toHaveLength(1);
    expect((result.results[0] as { type: string }).type).toBe(ToolResultType.error);
    expect((result.results[0] as ErrorResult).data.message).toContain('Access denied');
  });

  it('returns error result when resolveSmlAttachItems reports document not found', async () => {
    mockResolveSmlAttachItems.mockResolvedValue([
      {
        success: false,
        chunk_id: 'chunk-1',
        message: "SML document 'chunk-1' not found in the index",
      },
    ]);
    const tool = createSmlAttachTool({ getAgentContextLayer });
    const result = (await tool.handler(
      { chunk_ids: ['chunk-1'] },
      mockContext as unknown as ToolHandlerContext
    )) as { results: unknown[] };
    expect(result.results).toHaveLength(1);
    expect((result.results[0] as { type: string }).type).toBe(ToolResultType.error);
    expect((result.results[0] as ErrorResult).data.message).toContain('not found in the index');
  });

  it('returns success when resolveSmlAttachItems returns attachment and add succeeds', async () => {
    mockResolveSmlAttachItems.mockResolvedValue([
      {
        success: true,
        chunk_id: 'chunk-1',
        attachment: {
          type: 'visualization',
          data: { layers: [] },
          origin: 'ref-1',
          description: 'visualization/Test',
        },
      },
    ]);
    mockAttachmentsAdd.mockResolvedValue({ id: 'att-123' });
    const tool = createSmlAttachTool({ getAgentContextLayer });
    const result = (await tool.handler(
      { chunk_ids: ['chunk-1'] },
      mockContext as unknown as ToolHandlerContext
    )) as { results: unknown[] };
    expect(result.results).toHaveLength(1);
    expect((result.results[0] as { type: string }).type).toBe(ToolResultType.other);
    const successData = (
      result.results[0] as OtherResult<{
        success: boolean;
        attachment_id: string;
        attachment_type: string;
      }>
    ).data;
    expect(successData.success).toBe(true);
    expect(successData.attachment_id).toBe('att-123');
    expect(successData.attachment_type).toBe('visualization');
  });

  it('handles multiple items with mix of success and failure', async () => {
    mockResolveSmlAttachItems.mockResolvedValue([
      { success: false, chunk_id: 'denied-chunk', message: 'Access denied' },
      {
        success: true,
        chunk_id: 'ok-chunk',
        attachment: { type: 'visualization', data: {}, origin: 'ref-2', description: 'vis/Test' },
      },
    ]);
    mockAttachmentsAdd.mockResolvedValue({ id: 'att-456' });
    const tool = createSmlAttachTool({ getAgentContextLayer });
    const result = (await tool.handler(
      { chunk_ids: ['denied-chunk', 'ok-chunk'] },
      mockContext as unknown as ToolHandlerContext
    )) as { results: unknown[] };
    expect(result.results).toHaveLength(2);
    expect((result.results[0] as { type: string }).type).toBe(ToolResultType.error);
    expect((result.results[1] as { type: string }).type).toBe(ToolResultType.other);
  });

  it('calls resolveSmlAttachItems with correct params', async () => {
    mockResolveSmlAttachItems.mockResolvedValue([]);
    const tool = createSmlAttachTool({ getAgentContextLayer });
    await tool.handler(
      { chunk_ids: ['chunk-a', 'chunk-b'] },
      mockContext as unknown as ToolHandlerContext
    );
    expect(mockResolveSmlAttachItems).toHaveBeenCalledWith({
      chunkIds: ['chunk-a', 'chunk-b'],
      esClient: mockContext.esClient,
      request: mockContext.request,
      spaceId: 'default',
      savedObjectsClient: mockContext.savedObjectsClient,
      logger: mockLogger,
    });
  });
});
