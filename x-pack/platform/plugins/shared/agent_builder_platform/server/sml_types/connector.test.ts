/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import type { SmlListItem } from '@kbn/agent-builder-sml-plugin/server';
import { AttachmentType } from '@kbn/agent-builder-common/attachments';
import { CONNECTOR_KI_TYPE } from '@kbn/agent-builder-elastic-ai-index-ki-types';
import { createConnectorSmlType } from './connector';

jest.mock('@kbn/connector-specs', () => ({
  getConnectorSpec: jest.fn(),
}));

jest.mock('../skills/connector_authoring/utils', () => ({
  isChatCallableConnectorType: jest.fn(),
}));

const { getConnectorSpec } = jest.requireMock('@kbn/connector-specs');
const { isChatCallableConnectorType } = jest.requireMock('../skills/connector_authoring/utils');

const mockFinder = {
  find: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockSavedObjectsClient = {
  get: jest.fn(),
  createPointInTimeFinder: jest.fn().mockReturnValue(mockFinder),
};

const mockGetActionSavedObjectsClient = jest.fn().mockResolvedValue(mockSavedObjectsClient);
const mockLogger = loggingSystemMock.createLogger();

const createContext = () => ({
  logger: loggingSystemMock.createLogger(),
  savedObjectsClient: mockSavedObjectsClient as any,
});

const createAttachmentContext = () => ({
  request: httpServerMock.createKibanaRequest(),
  spaceId: 'default',
});

async function collectPages(iterable: AsyncIterable<SmlListItem[]>): Promise<SmlListItem[]> {
  const items: SmlListItem[] = [];
  for await (const page of iterable) {
    items.push(...page);
  }
  return items;
}

describe('connectorSmlType', () => {
  const connectorSmlType = createConnectorSmlType({
    getActionSavedObjectsClient: mockGetActionSavedObjectsClient,
    logger: mockLogger,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('id', () => {
    it('equals CONNECTOR_KI_TYPE', () => {
      expect(connectorSmlType.id).toBe(CONNECTOR_KI_TYPE);
    });
  });

  describe('list', () => {
    const makeSo = (
      id: string,
      namespaces: string[],
      updatedAt: string,
      actionTypeId = '.mcp'
    ) => ({
      id,
      updated_at: updatedAt,
      namespaces,
      attributes: { actionTypeId },
    });

    beforeEach(() => {
      mockFinder.find.mockReset();
      mockFinder.close.mockReset().mockResolvedValue(undefined);
      isChatCallableConnectorType.mockReturnValue(true);
    });

    it('yields items from a single page', async () => {
      async function* singlePage() {
        yield {
          saved_objects: [
            makeSo('conn-1', ['default'], '2024-01-01T00:00:00.000Z'),
            makeSo('conn-2', ['space-a'], '2024-01-02T00:00:00.000Z'),
          ],
        };
      }
      mockFinder.find.mockReturnValue(singlePage());

      const result = await collectPages(connectorSmlType.list(createContext() as never));

      expect(result).toEqual([
        { id: 'conn-1', updatedAt: '2024-01-01T00:00:00.000Z', spaces: ['default'] },
        { id: 'conn-2', updatedAt: '2024-01-02T00:00:00.000Z', spaces: ['space-a'] },
      ]);
    });

    it('yields items across multiple pages', async () => {
      async function* twoPages() {
        yield { saved_objects: [makeSo('conn-1', ['default'], '2024-01-01T00:00:00.000Z')] };
        yield { saved_objects: [makeSo('conn-2', ['default'], '2024-01-02T00:00:00.000Z')] };
      }
      mockFinder.find.mockReturnValue(twoPages());

      const result = await collectPages(connectorSmlType.list(createContext() as never));

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['conn-1', 'conn-2']);
    });

    it('yields nothing when there are no connectors', async () => {
      async function* empty() {}
      mockFinder.find.mockReturnValue(empty());

      const result = await collectPages(connectorSmlType.list(createContext() as never));
      expect(result).toEqual([]);
    });

    it('calls createPointInTimeFinder with action type across all namespaces', async () => {
      async function* empty() {}
      mockFinder.find.mockReturnValue(empty());

      await collectPages(connectorSmlType.list(createContext() as never));

      expect(mockSavedObjectsClient.createPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'action', namespaces: ['*'] })
      );
    });

    it('closes the finder after iteration completes', async () => {
      async function* singlePage() {
        yield { saved_objects: [makeSo('conn-1', ['default'], '2024-01-01T00:00:00.000Z')] };
      }
      mockFinder.find.mockReturnValue(singlePage());

      await collectPages(connectorSmlType.list(createContext() as never));

      expect(mockFinder.close).toHaveBeenCalledTimes(1);
    });

    it('closes the finder even when iteration throws', async () => {
      async function* throwing() {
        yield { saved_objects: [makeSo('conn-1', ['default'], '2024-01-01T00:00:00.000Z')] };
        throw new Error('ES error');
      }
      mockFinder.find.mockReturnValue(throwing());

      await expect(collectPages(connectorSmlType.list(createContext() as never))).rejects.toThrow(
        'ES error'
      );

      expect(mockFinder.close).toHaveBeenCalledTimes(1);
    });

    it('propagates error when createPointInTimeFinder throws (e.g. action type mappings absent)', async () => {
      mockSavedObjectsClient.createPointInTimeFinder.mockImplementationOnce(() => {
        throw new Error("Unknown saved object type: 'action' is not a registered type");
      });

      await expect(collectPages(connectorSmlType.list(createContext() as never))).rejects.toThrow(
        "Unknown saved object type: 'action' is not a registered type"
      );
    });

    it('falls back to empty spaces array when namespaces is undefined', async () => {
      async function* singlePage() {
        yield {
          saved_objects: [
            {
              id: 'conn-1',
              updated_at: '2024-01-01T00:00:00.000Z',
              attributes: { actionTypeId: '.mcp' },
            },
          ],
        };
      }
      mockFinder.find.mockReturnValue(singlePage());

      const result = await collectPages(connectorSmlType.list(createContext() as never));

      expect(result[0].spaces).toEqual([]);
    });

    it('excludes connectors whose actionTypeId is not chat-callable', async () => {
      isChatCallableConnectorType.mockImplementation((id: string) => id === '.mcp');

      async function* singlePage() {
        yield {
          saved_objects: [
            makeSo('conn-chat', ['default'], '2024-01-01T00:00:00.000Z', '.mcp'),
            makeSo('conn-nonchat', ['default'], '2024-01-02T00:00:00.000Z', '.email'),
          ],
        };
      }
      mockFinder.find.mockReturnValue(singlePage());

      const result = await collectPages(connectorSmlType.list(createContext() as never));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('conn-chat');
    });

    it('passes actionTypeId to isChatCallableConnectorType for each connector', async () => {
      async function* singlePage() {
        yield {
          saved_objects: [
            makeSo('conn-1', ['default'], '2024-01-01T00:00:00.000Z', '.slack'),
            makeSo('conn-2', ['default'], '2024-01-02T00:00:00.000Z', '.mcp'),
          ],
        };
      }
      mockFinder.find.mockReturnValue(singlePage());

      await collectPages(connectorSmlType.list(createContext() as never));

      expect(isChatCallableConnectorType).toHaveBeenCalledWith('.slack');
      expect(isChatCallableConnectorType).toHaveBeenCalledWith('.mcp');
    });

    it('yields nothing when no connectors pass the chat-callable filter', async () => {
      isChatCallableConnectorType.mockReturnValue(false);

      async function* singlePage() {
        yield {
          saved_objects: [
            makeSo('conn-1', ['default'], '2024-01-01T00:00:00.000Z', '.email'),
            makeSo('conn-2', ['default'], '2024-01-02T00:00:00.000Z', '.pagerduty'),
          ],
        };
      }
      mockFinder.find.mockReturnValue(singlePage());

      const result = await collectPages(connectorSmlType.list(createContext() as never));

      expect(result).toEqual([]);
    });
  });

  describe('getSmlEntry', () => {
    it('returns chunk with connector name and description in content', async () => {
      mockSavedObjectsClient.get.mockResolvedValue({
        id: 'conn-1',
        type: 'action',
        attributes: { name: 'My MCP Connector', actionTypeId: '.mcp' },
        references: [],
      });

      getConnectorSpec.mockReturnValue({
        metadata: {
          id: '.mcp',
          displayName: 'MCP',
          description: 'Model Context Protocol connector',
        },
        actions: {},
      });

      const result = await connectorSmlType.getSmlEntry!('conn-1', createContext() as never);

      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('action', 'conn-1');
      expect(result).toEqual({
        type: 'connector',
        title: 'My MCP Connector',
        content: 'My MCP Connector\nMCP\nModel Context Protocol connector',
      });
      expect(result).not.toHaveProperty('permissions');
    });

    it('returns undefined on error and logs warning', async () => {
      mockSavedObjectsClient.get.mockRejectedValue(new Error('Not found'));
      const context = createContext();

      const result = await connectorSmlType.getSmlEntry!('missing-conn', context as never);

      expect(result).toBeUndefined();
      expect(context.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("failed to get data for 'missing-conn'")
      );
    });

    it('deduplicates content parts when name and displayName overlap', async () => {
      mockSavedObjectsClient.get.mockResolvedValue({
        id: 'conn-1',
        type: 'action',
        attributes: { name: 'MCP', actionTypeId: '.mcp' },
        references: [],
      });

      getConnectorSpec.mockReturnValue({
        metadata: {
          id: '.mcp',
          displayName: 'MCP',
          description: 'Model Context Protocol connector',
        },
        actions: {},
      });

      const result = await connectorSmlType.getSmlEntry!('conn-1', createContext() as never);

      // 'MCP' should appear only once even though name === displayName
      expect(result!.content).toBe('MCP\nModel Context Protocol connector');
    });

    it('includes sub-action descriptions when spec has isTool actions', async () => {
      mockSavedObjectsClient.get.mockResolvedValue({
        id: 'conn-1',
        type: 'action',
        attributes: { name: 'My Slack', actionTypeId: '.slack2' },
        references: [],
      });

      getConnectorSpec.mockReturnValue({
        metadata: {
          id: '.slack2',
          displayName: 'Slack',
          description: 'Search and send Slack messages',
        },
        actions: {
          searchMessages: {
            isTool: true,
            description: 'Search Slack messages',
            handler: jest.fn(),
          },
          sendMessage: {
            isTool: true,
            description: 'Send a message to a channel',
            handler: jest.fn(),
          },
          internalAction: {
            isTool: false,
            description: 'Internal only',
            handler: jest.fn(),
          },
        },
      });

      const result = await connectorSmlType.getSmlEntry!('conn-1', createContext() as never);

      expect(result!.content).toContain('searchMessages: Search Slack messages');
      expect(result!.content).toContain('sendMessage: Send a message to a channel');
      expect(result!.content).not.toContain('internalAction');
    });

    it('handles missing optional fields gracefully', async () => {
      mockSavedObjectsClient.get.mockResolvedValue({
        id: 'conn-1',
        type: 'action',
        attributes: { name: 'Basic Connector', actionTypeId: '.unknown' },
        references: [],
      });

      getConnectorSpec.mockReturnValue(undefined);

      const result = await connectorSmlType.getSmlEntry!('conn-1', createContext() as never);

      expect(result).toEqual({
        type: 'connector',
        title: 'Basic Connector',
        content: 'Basic Connector\n.unknown',
      });
    });
  });

  describe('getPermissions', () => {
    it('returns the ai_index:connector/read action', () => {
      const permissions = connectorSmlType.getPermissions!('conn-1', createContext() as never);
      expect(permissions).toEqual({
        kibana: { privileges: { name: ['ai_index:connector/read'] } },
      });
    });
  });

  describe('toAttachment', () => {
    it('returns connector attachment data', async () => {
      mockSavedObjectsClient.get.mockResolvedValue({
        id: 'conn-1',
        type: 'action',
        attributes: { name: 'My MCP Connector', actionTypeId: '.mcp' },
        references: [],
      });

      const result = await connectorSmlType.toAttachment!(
        { attributes: { origin: { uri: 'connector://conn-1' } } } as never,
        createAttachmentContext() as never
      );

      expect(result).toEqual({
        type: AttachmentType.connector,
        data: {
          connector_id: 'conn-1',
          connector_name: 'My MCP Connector',
          connector_type: '.mcp',
        },
      });
    });

    it('returns undefined and logs warning when connector is not found', async () => {
      mockSavedObjectsClient.get.mockRejectedValue(new Error('Not found'));

      const result = await connectorSmlType.toAttachment!(
        { attributes: { origin: { uri: 'connector://missing-conn' } } } as never,
        createAttachmentContext() as never
      );

      expect(result).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("failed to convert 'missing-conn' to attachment")
      );
    });

    it('defaults connector_name to origin_id when name attribute is missing', async () => {
      mockSavedObjectsClient.get.mockResolvedValue({
        id: 'conn-1',
        type: 'action',
        attributes: { actionTypeId: '.mcp' },
        references: [],
      });

      const result = await connectorSmlType.toAttachment!(
        { attributes: { origin: { uri: 'connector://conn-1' } } } as never,
        createAttachmentContext() as never
      );

      expect(result).toEqual({
        type: AttachmentType.connector,
        data: {
          connector_id: 'conn-1',
          connector_name: 'conn-1',
          connector_type: '.mcp',
        },
      });
    });
  });
});
