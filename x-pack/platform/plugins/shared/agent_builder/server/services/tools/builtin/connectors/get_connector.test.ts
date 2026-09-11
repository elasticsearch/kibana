/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { OtherResult, ErrorResult } from '@kbn/agent-builder-common/tools/tool_result';
import type {
  ToolHandlerContext,
  ToolHandlerStandardReturn,
} from '@kbn/agent-builder-server/tools/handler';
import { getConnectorSpec } from '@kbn/connector-specs';
import { listMcpTools } from '../../tool_types/mcp/tool_type';
import { createGetConnectorTool } from './get_connector';
import type { ConnectorToolsOptions } from './types';

jest.mock('@kbn/connector-specs', () => ({
  ...jest.requireActual('@kbn/connector-specs'),
  getConnectorSpec: jest.fn(),
}));

jest.mock('../../tool_types/mcp/tool_type', () => ({
  listMcpTools: jest.fn(),
}));

const getConnectorSpecMock = getConnectorSpec as jest.MockedFunction<typeof getConnectorSpec>;
const listMcpToolsMock = listMcpTools as jest.MockedFunction<typeof listMcpTools>;

const mockGet = jest.fn();
const mockGetActionsClientWithRequest = jest.fn(() => Promise.resolve({ get: mockGet }));
const getActions: ConnectorToolsOptions['getActions'] = jest.fn(() =>
  Promise.resolve({
    getActionsClientWithRequest: mockGetActionsClientWithRequest,
  })
) as unknown as ConnectorToolsOptions['getActions'];

const getInference: ConnectorToolsOptions['getInference'] = jest.fn(() =>
  Promise.resolve({} as unknown as ReturnType<ConnectorToolsOptions['getInference']>)
);

const mockContext = {
  request: { id: 'test-request' },
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  uiSettings: { get: jest.fn().mockResolvedValue(true) },
} as unknown as ToolHandlerContext;

const slackSpec = {
  metadata: {
    id: '.slack2',
    displayName: 'Slack',
    description: 'Slack connector',
    minimumLicense: 'enterprise' as const,
    supportedFeatureIds: [],
  },
  actions: {
    searchMessages: {
      isTool: true,
      description: 'Search messages',
      input: z.object({ query: z.string() }),
      handler: jest.fn(),
    },
    sendMessage: {
      isTool: true,
      description: 'Send a message',
      scope: 'write' as const,
      input: z.object({ text: z.string() }),
      handler: jest.fn(),
    },
    deleteMessage: {
      isTool: true,
      description: 'Delete a message',
      scope: 'destroy' as const,
      handler: jest.fn(),
    },
    internalRefresh: {
      isTool: false,
      description: 'Not exposed to agents',
      handler: jest.fn(),
    },
  },
  test: { handler: jest.fn(), enabled: false },
};

describe('createGetConnectorTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ id: 'conn-slack', name: 'My Slack', actionTypeId: '.slack2' });
    getConnectorSpecMock.mockImplementation((typeId: string) =>
      typeId === '.slack2' ? (slackSpec as any) : undefined
    );
  });

  it('has correct id, type, and tags', () => {
    const tool = createGetConnectorTool({ getActions, getInference });
    expect(tool.id).toBe(platformCoreTools.getConnector);
    expect(tool.type).toBe(ToolType.builtin);
    expect(tool.tags).toEqual(['connector']);
  });

  it('only includes sub-actions marked isTool, with scope hints and parameter summaries', async () => {
    const tool = createGetConnectorTool({ getActions, getInference });
    const result = await tool.handler({ connectorId: 'conn-slack' }, mockContext);

    const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
      connectorId: string;
      name: string;
      connectorType: string;
      displayName: string;
      description: string;
      subActions: Array<{
        subAction: string;
        description: string;
        hint: string;
        parameters: string;
      }>;
    };

    expect(data).toMatchObject({
      connectorId: 'conn-slack',
      name: 'My Slack',
      connectorType: '.slack2',
      displayName: 'Slack',
      description: 'Slack connector',
    });

    const subActionNames = data.subActions.map((a) => a.subAction);
    expect(subActionNames).toEqual(['searchMessages', 'sendMessage', 'deleteMessage']);
    expect(subActionNames).not.toContain('internalRefresh');

    const searchMessages = data.subActions.find((a) => a.subAction === 'searchMessages');
    expect(searchMessages?.hint).toBe('');
    expect(searchMessages?.parameters).not.toBe('No parameters');

    const sendMessage = data.subActions.find((a) => a.subAction === 'sendMessage');
    expect(sendMessage?.hint).toBe('[WRITE]');

    const deleteMessage = data.subActions.find((a) => a.subAction === 'deleteMessage');
    expect(deleteMessage?.hint).toBe('[DESTROY]');
    expect(deleteMessage?.parameters).toBe('No parameters');
  });

  it('returns an error when no connector spec is found for the type', async () => {
    mockGet.mockResolvedValue({ id: 'conn-unknown', name: 'Unknown', actionTypeId: '.unknown' });
    getConnectorSpecMock.mockReturnValue(undefined);

    const tool = createGetConnectorTool({ getActions, getInference });
    const result = await tool.handler({ connectorId: 'conn-unknown' }, mockContext);

    const errorResult = (result as ToolHandlerStandardReturn).results[0] as ErrorResult;
    expect(errorResult.type).toBe(ToolResultType.error);
    expect(errorResult.data.message).toContain("No connector spec found for type '.unknown'");
  });

  describe('MCP connectors', () => {
    beforeEach(() => {
      mockGet.mockResolvedValue({ id: 'conn-mcp', name: 'My MCP', actionTypeId: '.mcp' });
    });

    it('returns synthesized subActions from listMcpTools, without calling getConnectorSpec', async () => {
      listMcpToolsMock.mockResolvedValue({
        tools: [
          {
            name: 'search_issues',
            description: 'Search issues',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
          },
          {
            name: 'no_args_tool',
            inputSchema: { type: 'object' },
          },
        ],
      } as any);

      const tool = createGetConnectorTool({ getActions, getInference });
      const result = await tool.handler({ connectorId: 'conn-mcp' }, mockContext);

      const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
        connectorId: string;
        name: string;
        connectorType: string;
        subActions: Array<{
          subAction: string;
          description: string;
          hint: string;
          parameters: string;
        }>;
      };

      expect(data).toMatchObject({
        connectorId: 'conn-mcp',
        name: 'My MCP',
        connectorType: '.mcp',
      });
      expect(data.subActions).toHaveLength(2);
      expect(data.subActions[0]).toMatchObject({
        subAction: 'search_issues',
        description: 'Search issues',
      });
      expect(data.subActions[1]).toMatchObject({
        subAction: 'no_args_tool',
        description: 'no_args_tool',
      });
      expect(getConnectorSpecMock).not.toHaveBeenCalled();
    });

    it.each([
      ['destructiveHint: true', { destructiveHint: true }, '[DESTROY]'],
      ['readOnlyHint: true', { readOnlyHint: true }, ''],
      ['no annotations', undefined, '[WRITE]'],
    ])('derives hint from MCP annotations (%s)', async (_label, annotations, expectedHint) => {
      listMcpToolsMock.mockResolvedValue({
        tools: [{ name: 'a_tool', inputSchema: { type: 'object' }, annotations }],
      } as any);

      const tool = createGetConnectorTool({ getActions, getInference });
      const result = await tool.handler({ connectorId: 'conn-mcp' }, mockContext);

      const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
        subActions: Array<{ hint: string }>;
      };
      expect(data.subActions[0].hint).toBe(expectedHint);
    });

    it('falls back to "No parameters" when the tool has no meaningful input schema', async () => {
      listMcpToolsMock.mockResolvedValue({
        tools: [{ name: 'a_tool', inputSchema: {} }],
      } as any);

      const tool = createGetConnectorTool({ getActions, getInference });
      const result = await tool.handler({ connectorId: 'conn-mcp' }, mockContext);

      const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
        subActions: Array<{ parameters: string }>;
      };
      expect(data.subActions[0].parameters).toBe('No parameters');
    });

    it('propagates a listMcpTools failure through the generic error result', async () => {
      listMcpToolsMock.mockRejectedValue(new Error('Failed to list MCP tools'));

      const tool = createGetConnectorTool({ getActions, getInference });
      const result = await tool.handler({ connectorId: 'conn-mcp' }, mockContext);

      const errorResult = (result as ToolHandlerStandardReturn).results[0] as ErrorResult;
      expect(errorResult.type).toBe(ToolResultType.error);
      expect(errorResult.data.message).toContain('Failed to list MCP tools');
    });
  });

  it('returns an error when connector resolution fails', async () => {
    mockGet.mockRejectedValue(new Error('Saved object not found'));

    const tool = createGetConnectorTool({ getActions, getInference });
    const result = await tool.handler({ connectorId: 'bad-id' }, mockContext);

    const errorResult = (result as ToolHandlerStandardReturn).results[0] as ErrorResult;
    expect(errorResult.type).toBe(ToolResultType.error);
    expect(errorResult.data.message).toContain("Failed to resolve connector 'bad-id'");
  });

  describe('agent connector scoping', () => {
    it('rejects a connectorId not in agentConfiguration.connector_ids without resolving it', async () => {
      const tool = createGetConnectorTool({ getActions, getInference });
      const result = await tool.handler(
        { connectorId: 'conn-slack' },
        {
          ...mockContext,
          agentConfiguration: { connector_ids: ['conn-999'], tools: [] },
        }
      );

      const errorResult = (result as ToolHandlerStandardReturn).results[0] as ErrorResult;
      expect(errorResult.type).toBe(ToolResultType.error);
      expect(errorResult.data.message).toContain("Connector 'conn-slack' is not available");
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('allows a connectorId that is in agentConfiguration.connector_ids', async () => {
      const tool = createGetConnectorTool({ getActions, getInference });
      const result = await tool.handler(
        { connectorId: 'conn-slack' },
        {
          ...mockContext,
          agentConfiguration: { connector_ids: ['conn-slack'], tools: [] },
        }
      );

      expect((result as ToolHandlerStandardReturn).results[0].type).toBe(ToolResultType.other);
      expect(mockGet).toHaveBeenCalled();
    });

    it('is unrestricted when agentConfiguration has no connector_ids', async () => {
      const tool = createGetConnectorTool({ getActions, getInference });
      const result = await tool.handler(
        { connectorId: 'conn-slack' },
        {
          ...mockContext,
          agentConfiguration: { tools: [] },
        }
      );

      expect((result as ToolHandlerStandardReturn).results[0].type).toBe(ToolResultType.other);
    });

    it('is unrestricted when agentConfiguration is absent', async () => {
      const tool = createGetConnectorTool({ getActions, getInference });
      const result = await tool.handler({ connectorId: 'conn-slack' }, mockContext);

      expect((result as ToolHandlerStandardReturn).results[0].type).toBe(ToolResultType.other);
    });
  });

  describe('availability', () => {
    it('is unavailable when the experimental features flag is off', async () => {
      const tool = createGetConnectorTool({ getActions, getInference });
      const result = await tool.availability!.handler({
        uiSettings: { get: jest.fn().mockResolvedValue(false) },
      } as any);
      expect(result.status).toBe('unavailable');
    });

    it('is available when the experimental features flag is on', async () => {
      const tool = createGetConnectorTool({ getActions, getInference });
      const result = await tool.availability!.handler({
        uiSettings: { get: jest.fn().mockResolvedValue(true) },
      } as any);
      expect(result.status).toBe('available');
    });
  });
});
