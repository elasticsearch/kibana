/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import { ToolResultType, type OtherResult } from '@kbn/agent-builder-common/tools/tool_result';
import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools/handler';
import type { ToolAvailabilityContext } from '@kbn/agent-builder-server';
import type { SmlSearchResult } from '@kbn/agent-context-layer-plugin/server';
import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  CONTEXT_ENGINE_ENABLED_SETTING_ID,
} from '@kbn/management-settings-ids';
import { createSmlSearchTool } from './sml_search';

const buildAvailabilityContext = (flags: Record<string, boolean>) =>
  ({
    uiSettings: {
      get: jest.fn(async (key: string) => flags[key]),
    },
  } as unknown as ToolAvailabilityContext);

const mockSearch = jest.fn();
const getAgentContextLayer = jest.fn(() => ({
  search: mockSearch,
  indexAttachment: jest.fn(),
  deleteAttachment: jest.fn(),
  getDocuments: jest.fn(),
  getTypeDefinition: jest.fn(),
  resolveSmlAttachItems: jest.fn(),
}));

const mockContext = {
  spaceId: 'default',
  esClient: { asCurrentUser: {}, asInternalUser: {} },
  request: {},
  savedObjectsClient: {},
  attachments: { add: jest.fn() },
};

describe('createSmlSearchTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('has correct id and tags', () => {
    const tool = createSmlSearchTool({ getAgentContextLayer });
    expect(tool.id).toBe(platformCoreTools.smlSearch);
    expect(tool.type).toBe(ToolType.builtin);
    expect(tool.tags).toEqual(['sml', 'search']);
  });

  describe('availability', () => {
    it('is available only when both experimental features and the Context Engine are enabled', async () => {
      const tool = createSmlSearchTool({ getAgentContextLayer });
      const result = await tool.availability!.handler(
        buildAvailabilityContext({
          [AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID]: true,
          [CONTEXT_ENGINE_ENABLED_SETTING_ID]: true,
        })
      );
      expect(result.status).toBe('available');
    });

    it('is unavailable when experimental features are disabled', async () => {
      const tool = createSmlSearchTool({ getAgentContextLayer });
      const result = await tool.availability!.handler(
        buildAvailabilityContext({
          [AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID]: false,
          [CONTEXT_ENGINE_ENABLED_SETTING_ID]: true,
        })
      );
      expect(result.status).toBe('unavailable');
    });

    it('is unavailable when the Context Engine is disabled', async () => {
      const tool = createSmlSearchTool({ getAgentContextLayer });
      const result = await tool.availability!.handler(
        buildAvailabilityContext({
          [AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID]: true,
          [CONTEXT_ENGINE_ENABLED_SETTING_ID]: false,
        })
      );
      expect(result.status).toBe('unavailable');
    });
  });

  it('description mentions workflows, wildcard query, and the types/tags filters', () => {
    const tool = createSmlSearchTool({ getAgentContextLayer });
    expect(tool.description).toContain('workflows');
    expect(tool.description).toContain('"*"');
    expect(tool.description).toContain('types');
    expect(tool.description).toContain('tags');
    expect(tool.description).toContain('sml_attach');
  });

  it('calls search with correct params (no constraints, no filters by default)', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    const tool = createSmlSearchTool({ getAgentContextLayer });
    await tool.handler(
      { query: 'cpu usage', size: 20 },
      mockContext as unknown as ToolHandlerContext
    );
    expect(getAgentContextLayer).toHaveBeenCalled();
    expect(mockSearch).toHaveBeenCalledWith({
      query: 'cpu usage',
      size: 20,
      spaceId: 'default',
      esClient: mockContext.esClient,
      request: mockContext.request,
      constraints: undefined,
      filters: undefined,
    });
  });

  it('forwards agent-supplied types and tags as `filters` to the service', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    const tool = createSmlSearchTool({ getAgentContextLayer });
    await tool.handler(
      { query: 'sales', types: ['dashboard'], tags: ['production'] },
      mockContext as unknown as ToolHandlerContext
    );
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { types: ['dashboard'], tags: ['production'] },
      })
    );
  });

  it('omits filters when types/tags are empty arrays (treated as no constraint)', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    const tool = createSmlSearchTool({ getAgentContextLayer });
    await tool.handler(
      { query: 'sales', types: [], tags: [] },
      mockContext as unknown as ToolHandlerContext
    );
    expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ filters: undefined }));
  });

  it('maps document fields to the LLM-friendly hit shape', async () => {
    const hits: SmlSearchResult[] = [
      {
        id: 'chunk-1',
        origin: { uri: 'visualization://ref-1' },
        type: 'visualization',
        title: 'CPU Chart',
        content: 'cpu usage data',
        description: 'A CPU chart',
        tags: ['perf'],
        references: [{ uri: 'dashboard://abc' }],
        spaces: ['default'],
        permissions: { kibana: { privileges: [] }, elasticsearch: { indices: [] } },
      },
    ];
    mockSearch.mockResolvedValue({ results: hits });
    const tool = createSmlSearchTool({ getAgentContextLayer });
    const result = (await tool.handler(
      { query: 'cpu' },
      mockContext as unknown as ToolHandlerContext
    )) as {
      results: unknown[];
    };
    expect(result.results).toHaveLength(1);
    const data = (result.results[0] as OtherResult<{ items: unknown[] }>).data;
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toEqual({
      chunk_id: 'chunk-1',
      attachment_id: 'visualization://ref-1',
      attachment_type: 'visualization',
      type: 'visualization',
      title: 'CPU Chart',
      content: 'cpu usage data',
      description: 'A CPU chart',
      tags: ['perf'],
      references: ['dashboard://abc'],
    });
    expect((result.results[0] as { type: string }).type).toBe(ToolResultType.other);
  });

  it('returns "No results found" when empty', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    const tool = createSmlSearchTool({ getAgentContextLayer });
    const result = (await tool.handler(
      { query: 'nonexistent' },
      mockContext as unknown as ToolHandlerContext
    )) as {
      results: unknown[];
    };
    expect(result.results).toHaveLength(1);
    const data = (
      result.results[0] as OtherResult<{
        message: string;
        query: string;
        items: unknown[];
      }>
    ).data;
    expect(data.message).toBe('No results found in the Semantic Metadata Layer.');
    expect(data.query).toBe('nonexistent');
    expect(data.items).toEqual([]);
    expect((result.results[0] as { type: string }).type).toBe(ToolResultType.other);
  });

  it('uses default size when not provided', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    const tool = createSmlSearchTool({ getAgentContextLayer });
    await tool.handler({ query: 'test' }, mockContext as unknown as ToolHandlerContext);
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'test',
        size: undefined,
      })
    );
  });

  it('passes connector_ids as `constraints` (runtime-imposed) from agentConfiguration', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    const contextWithConnectors = {
      ...mockContext,
      agentConfiguration: { connector_ids: ['conn-1', 'conn-2'], tools: [] },
    };

    const tool = createSmlSearchTool({ getAgentContextLayer });
    await tool.handler({ query: 'test' }, contextWithConnectors as unknown as ToolHandlerContext);

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        constraints: { connector: { ids: ['conn-1', 'conn-2'] } },
        filters: undefined,
      })
    );
  });

  it('does not pass constraints when agentConfiguration has no connector_ids', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    const contextWithoutConnectors = {
      ...mockContext,
      agentConfiguration: { tools: [] },
    };

    const tool = createSmlSearchTool({ getAgentContextLayer });
    await tool.handler(
      { query: 'test' },
      contextWithoutConnectors as unknown as ToolHandlerContext
    );

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        constraints: undefined,
      })
    );
  });

  it('passes empty connector ids constraints when connector_ids is []', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    const contextWithEmptyConnectors = {
      ...mockContext,
      agentConfiguration: { connector_ids: [], tools: [] },
    };

    const tool = createSmlSearchTool({ getAgentContextLayer });
    await tool.handler(
      { query: 'test' },
      contextWithEmptyConnectors as unknown as ToolHandlerContext
    );

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        constraints: { connector: { ids: [] } },
      })
    );
  });

  it('does not pass constraints when agentConfiguration is undefined', async () => {
    mockSearch.mockResolvedValue({ results: [] });

    const tool = createSmlSearchTool({ getAgentContextLayer });
    await tool.handler({ query: 'test' }, mockContext as unknown as ToolHandlerContext);

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        constraints: undefined,
      })
    );
  });

  it('combines runtime constraints (connectors) with agent-supplied filters', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    const contextWithConnectors = {
      ...mockContext,
      agentConfiguration: { connector_ids: ['conn-1'], tools: [] },
    };

    const tool = createSmlSearchTool({ getAgentContextLayer });
    await tool.handler(
      { query: 'test', types: ['connector'], tags: ['prod'] },
      contextWithConnectors as unknown as ToolHandlerContext
    );

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        constraints: { connector: { ids: ['conn-1'] } },
        filters: { types: ['connector'], tags: ['prod'] },
      })
    );
  });
});
