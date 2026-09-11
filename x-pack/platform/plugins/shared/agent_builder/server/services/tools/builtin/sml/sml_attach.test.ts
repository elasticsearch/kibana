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
import { createSmlAttachTool } from './sml_attach';

const mockResolveSmlAttachItems = jest.fn();
const mockAttachmentsAdd = jest.fn();

const getAgentBuilderSml = jest.fn(() => ({
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
    const tool = createSmlAttachTool({ getAgentBuilderSml });
    expect(tool.id).toBe(platformCoreTools.smlAttach);
    expect(tool.type).toBe(ToolType.builtin);
    expect(tool.tags).toEqual(['sml', 'attachment']);
  });

  it('returns error result when resolveSmlAttachItems reports access denied', async () => {
    mockResolveSmlAttachItems.mockResolvedValue([
      {
        success: false,
        entry_id: 'entry-1',
        message: 'Access denied: you do not have the required permissions',
      },
    ]);
    const tool = createSmlAttachTool({ getAgentBuilderSml });
    const result = (await tool.handler(
      { entry_ids: ['entry-1'] },
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
        entry_id: 'entry-1',
        message: "SML document 'entry-1' not found in the index",
      },
    ]);
    const tool = createSmlAttachTool({ getAgentBuilderSml });
    const result = (await tool.handler(
      { entry_ids: ['entry-1'] },
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
        entry_id: 'entry-1',
        attachment: {
          type: 'visualization',
          data: { layers: [] },
          origin: 'ref-1',
          description: 'visualization/Test',
        },
      },
    ]);
    mockAttachmentsAdd.mockResolvedValue({ id: 'att-123' });
    const tool = createSmlAttachTool({ getAgentBuilderSml });
    const result = (await tool.handler(
      { entry_ids: ['entry-1'] },
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
      { success: false, entry_id: 'denied-entry', message: 'Access denied' },
      {
        success: true,
        entry_id: 'ok-entry',
        attachment: { type: 'visualization', data: {}, origin: 'ref-2', description: 'vis/Test' },
      },
    ]);
    mockAttachmentsAdd.mockResolvedValue({ id: 'att-456' });
    const tool = createSmlAttachTool({ getAgentBuilderSml });
    const result = (await tool.handler(
      { entry_ids: ['denied-entry', 'ok-entry'] },
      mockContext as unknown as ToolHandlerContext
    )) as { results: unknown[] };
    expect(result.results).toHaveLength(2);
    expect((result.results[0] as { type: string }).type).toBe(ToolResultType.error);
    expect((result.results[1] as { type: string }).type).toBe(ToolResultType.other);
  });

  it('calls resolveSmlAttachItems with correct params', async () => {
    mockResolveSmlAttachItems.mockResolvedValue([]);
    const tool = createSmlAttachTool({ getAgentBuilderSml });
    await tool.handler(
      { entry_ids: ['entry-a', 'entry-b'] },
      mockContext as unknown as ToolHandlerContext
    );
    expect(mockResolveSmlAttachItems).toHaveBeenCalledWith({
      entryIds: ['entry-a', 'entry-b'],
      esClient: mockContext.esClient,
      request: mockContext.request,
      spaceId: 'default',
      savedObjectsClient: mockContext.savedObjectsClient,
      logger: mockLogger,
    });
  });
});
