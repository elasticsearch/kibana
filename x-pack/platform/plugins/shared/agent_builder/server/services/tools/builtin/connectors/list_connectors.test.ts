/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { OtherResult, ErrorResult } from '@kbn/agent-builder-common/tools/tool_result';
import type {
  ToolHandlerContext,
  ToolHandlerStandardReturn,
} from '@kbn/agent-builder-server/tools/handler';
import { getConnectorSpec } from '@kbn/connector-specs';
import { createListConnectorsTool } from './list_connectors';
import type { ConnectorToolsOptions } from './types';

jest.mock('@kbn/connector-specs', () => ({
  ...jest.requireActual('@kbn/connector-specs'),
  getConnectorSpec: jest.fn(),
}));

const getConnectorSpecMock = getConnectorSpec as jest.MockedFunction<typeof getConnectorSpec>;

const mockGetAll = jest.fn();
const mockGetActionsClientWithRequest = jest.fn(() => Promise.resolve({ getAll: mockGetAll }));
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
  actions: {},
  test: { handler: jest.fn(), enabled: false },
};

describe('createListConnectorsTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getConnectorSpecMock.mockImplementation((typeId: string) =>
      typeId === '.slack2' ? (slackSpec as any) : undefined
    );
  });

  it('has correct id, type, and tags', () => {
    const tool = createListConnectorsTool({ getActions, getInference });
    expect(tool.id).toBe(platformCoreTools.listConnectors);
    expect(tool.type).toBe(ToolType.builtin);
    expect(tool.tags).toEqual(['connector']);
  });

  it('calls getAll with includeSystemActions: false', async () => {
    mockGetAll.mockResolvedValue([]);
    const tool = createListConnectorsTool({ getActions, getInference });
    await tool.handler({}, mockContext);
    expect(mockGetAll).toHaveBeenCalledWith({ includeSystemActions: false });
  });

  it('returns an empty list when there are no connectors', async () => {
    mockGetAll.mockResolvedValue([]);
    const tool = createListConnectorsTool({ getActions, getInference });
    const result = await tool.handler({}, mockContext);

    expect((result as ToolHandlerStandardReturn).results).toHaveLength(1);
    const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
      total: number;
      connectors: unknown[];
    };
    expect(data).toEqual({ total: 0, connectors: [] });
  });

  it('filters out connector types with no registered connector spec', async () => {
    mockGetAll.mockResolvedValue([
      { id: 'conn-unknown', name: 'Unknown', actionTypeId: '.unknown' },
      { id: 'conn-slack', name: 'My Slack', actionTypeId: '.slack2' },
    ]);

    const tool = createListConnectorsTool({ getActions, getInference });
    const result = await tool.handler({}, mockContext);

    const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
      total: number;
      connectors: Array<{ connectorId: string }>;
    };
    expect(data.total).toBe(1);
    expect(data.connectors).toHaveLength(1);
    expect(data.connectors[0].connectorId).toBe('conn-slack');
  });

  it('returns a synthesized entry for MCP connectors without calling getConnectorSpec', async () => {
    mockGetAll.mockResolvedValue([{ id: 'conn-mcp', name: 'My MCP', actionTypeId: '.mcp' }]);

    const tool = createListConnectorsTool({ getActions, getInference });
    const result = await tool.handler({}, mockContext);

    const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
      total: number;
      connectors: Array<Record<string, unknown>>;
    };
    expect(data.total).toBe(1);
    expect(data.connectors[0]).toEqual({
      connectorId: 'conn-mcp',
      name: 'My MCP',
      connectorType: '.mcp',
      displayName: 'My MCP',
      description: 'MCP connector. Call get_connector for its available tools.',
      isMissingSecrets: false,
    });
    expect(getConnectorSpecMock).not.toHaveBeenCalled();
  });

  it('returns both MCP and spec-based connectors in a mixed list', async () => {
    mockGetAll.mockResolvedValue([
      { id: 'conn-mcp', name: 'My MCP', actionTypeId: '.mcp' },
      { id: 'conn-slack', name: 'My Slack', actionTypeId: '.slack2' },
    ]);

    const tool = createListConnectorsTool({ getActions, getInference });
    const result = await tool.handler({}, mockContext);

    const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
      total: number;
      connectors: Array<{ connectorId: string }>;
    };
    expect(data.total).toBe(2);
    expect(data.connectors.map((c) => c.connectorId)).toEqual(['conn-mcp', 'conn-slack']);
  });

  it('returns a lightweight shape with no sub-action details', async () => {
    mockGetAll.mockResolvedValue([
      { id: 'conn-slack', name: 'My Slack', actionTypeId: '.slack2', isMissingSecrets: false },
    ]);

    const tool = createListConnectorsTool({ getActions, getInference });
    const result = await tool.handler({}, mockContext);

    const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
      connectors: Array<Record<string, unknown>>;
    };

    expect(data.connectors).toHaveLength(1);
    expect(data.connectors[0]).toEqual({
      connectorId: 'conn-slack',
      name: 'My Slack',
      connectorType: '.slack2',
      displayName: 'Slack',
      description: 'Slack connector',
      isMissingSecrets: false,
    });
    expect(data.connectors[0]).not.toHaveProperty('subActions');
  });

  it('returns an error result when the actions client rejects', async () => {
    mockGetAll.mockRejectedValue(new Error('boom'));
    const tool = createListConnectorsTool({ getActions, getInference });
    const result = await tool.handler({}, mockContext);

    expect((result as ToolHandlerStandardReturn).results).toHaveLength(1);
    const errorResult = (result as ToolHandlerStandardReturn).results[0] as ErrorResult;
    expect(errorResult.type).toBe(ToolResultType.error);
    expect(errorResult.data.message).toContain('boom');
  });

  describe('agent connector scoping', () => {
    beforeEach(() => {
      mockGetAll.mockResolvedValue([
        { id: 'conn-slack', name: 'My Slack', actionTypeId: '.slack2' },
        { id: 'conn-slack-2', name: 'Other Slack', actionTypeId: '.slack2' },
      ]);
    });

    it('filters to agentConfiguration.connector_ids when set', async () => {
      const tool = createListConnectorsTool({ getActions, getInference });
      const result = await tool.handler(
        {},
        {
          ...mockContext,
          agentConfiguration: { connector_ids: ['conn-slack'], tools: [] },
        }
      );

      const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
        total: number;
        connectors: Array<{ connectorId: string }>;
      };
      expect(data.total).toBe(1);
      expect(data.connectors[0].connectorId).toBe('conn-slack');
    });

    it('returns no connectors when connector_ids is an empty array', async () => {
      const tool = createListConnectorsTool({ getActions, getInference });
      const result = await tool.handler(
        {},
        {
          ...mockContext,
          agentConfiguration: { connector_ids: [], tools: [] },
        }
      );

      const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
        total: number;
        connectors: unknown[];
      };
      expect(data).toEqual({ total: 0, connectors: [] });
    });

    it('returns every connector when agentConfiguration has no connector_ids', async () => {
      const tool = createListConnectorsTool({ getActions, getInference });
      const result = await tool.handler(
        {},
        {
          ...mockContext,
          agentConfiguration: { tools: [] },
        }
      );

      const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
        total: number;
      };
      expect(data.total).toBe(2);
    });

    it('returns every connector when agentConfiguration is absent', async () => {
      const tool = createListConnectorsTool({ getActions, getInference });
      const result = await tool.handler({}, mockContext);

      const data = ((result as ToolHandlerStandardReturn).results[0] as OtherResult).data as {
        total: number;
      };
      expect(data.total).toBe(2);
    });
  });

  describe('availability', () => {
    it('is unavailable when the experimental features flag is off', async () => {
      const tool = createListConnectorsTool({ getActions, getInference });
      const result = await tool.availability!.handler({
        uiSettings: { get: jest.fn().mockResolvedValue(false) },
      } as any);
      expect(result.status).toBe('unavailable');
    });

    it('is available when the experimental features flag is on', async () => {
      const tool = createListConnectorsTool({ getActions, getInference });
      const result = await tool.availability!.handler({
        uiSettings: { get: jest.fn().mockResolvedValue(true) },
      } as any);
      expect(result.status).toBe('available');
    });
  });
});
