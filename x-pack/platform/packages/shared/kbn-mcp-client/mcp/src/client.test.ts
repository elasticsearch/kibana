/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable max-classes-per-file */
import { McpClient } from './client';
import { McpConnectionError } from './errors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import type { ClientDetails, CallToolParams } from './types';
import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { loggerMock, type MockedLogger } from '@kbn/logging-mocks';

// Type definitions for SDK responses
interface MockListToolsResult {
  isError: false;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  }>;
  nextCursor?: string;
}

interface MockListToolsError {
  isError: true;
  error: string | { message?: string; code?: number };
}

type MockListToolsResponse = MockListToolsResult | MockListToolsError;

interface MockCallToolResult {
  isError: false;
  content: Array<
    | {
        type: string;
        text?: string | null | number | object;
        [key: string]: unknown;
      }
    | null
    | undefined
  >;
}

interface MockCallToolError {
  isError: true;
  content: Array<
    | {
        type: string;
        text?: string | null | number | object;
        [key: string]: unknown;
      }
    | null
    | undefined
  >;
}

type MockCallToolResponse = MockCallToolResult | MockCallToolError;

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => {
  const StreamableHTTPClientTransportMock = jest.fn();
  class MockStreamableHTTPError extends Error {
    public code: number;
    constructor(code: number, message?: string) {
      super(`Streamable HTTP error: ${message}`);
      this.name = 'StreamableHTTPError';
      this.code = code;
    }
  }
  return {
    StreamableHTTPClientTransport: StreamableHTTPClientTransportMock,
    StreamableHTTPError: MockStreamableHTTPError,
  };
});
jest.mock('@modelcontextprotocol/sdk/client/auth.js', () => {
  const actual = jest.requireActual('@modelcontextprotocol/sdk/client/auth.js');
  class MockUnauthorizedError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'UnauthorizedError';
    }
  }
  return {
    ...actual,
    UnauthorizedError: MockUnauthorizedError,
  };
});

describe('McpClient', () => {
  let mockClient: {
    connect: jest.MockedFunction<(transport: StreamableHTTPClientTransport) => Promise<void>>;
    close: jest.MockedFunction<() => Promise<void>>;
    listTools: jest.MockedFunction<
      (params?: { cursor?: string }) => Promise<MockListToolsResponse>
    >;
    callTool: jest.MockedFunction<
      (params: {
        name: string;
        _meta: Record<string, unknown>;
        arguments: Record<string, unknown>;
      }) => Promise<MockCallToolResponse>
    >;
    getServerCapabilities: jest.MockedFunction<() => ServerCapabilities | undefined>;
  };
  let mockTransport: StreamableHTTPClientTransport;
  let clientDetails: ClientDetails;
  let mockLogger: MockedLogger;

  // Helper function to create a connected client
  const createConnectedClient = async (): Promise<McpClient> => {
    const client = new McpClient(mockLogger, clientDetails);
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.getServerCapabilities.mockReturnValue(undefined);
    await client.connect();
    return client;
  };

  beforeEach(() => {
    // Setup mocks
    mockLogger = loggerMock.create();
    mockClient = {
      connect: jest.fn(),
      close: jest.fn(),
      listTools: jest.fn(),
      callTool: jest.fn(),
      getServerCapabilities: jest.fn(),
    };

    mockTransport = {} as StreamableHTTPClientTransport;

    (Client as jest.MockedClass<typeof Client>).mockImplementation(
      () => mockClient as unknown as Client
    );
    (
      StreamableHTTPClientTransport as jest.MockedClass<typeof StreamableHTTPClientTransport>
    ).mockImplementation(() => mockTransport);

    clientDetails = {
      name: 'test-client',
      version: '1.0.0',
      url: 'https://example.com/mcp',
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates transport with correct URL and headers', () => {
      const customHeaders = { 'X-Custom': 'value' };
      new McpClient(mockLogger, clientDetails, { headers: customHeaders });

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({ href: 'https://example.com/mcp' }),
        expect.objectContaining({
          requestInit: {
            headers: customHeaders,
          },
        })
      );
    });

    it('creates transport with empty headers when customHeaders not provided', () => {
      new McpClient(mockLogger, clientDetails);

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({ href: 'https://example.com/mcp' }),
        expect.objectContaining({
          requestInit: {
            headers: {},
          },
        })
      );
    });

    it('creates transport with reconnection options', () => {
      new McpClient(mockLogger, clientDetails);

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          reconnectionOptions: {
            maxRetries: 3,
            reconnectionDelayGrowFactor: 1.5,
            initialReconnectionDelay: 1000,
            maxReconnectionDelay: 10000,
          },
        })
      );
    });

    it('creates transport with custom fetch when provided', () => {
      const customFetch = jest.fn();
      new McpClient(mockLogger, clientDetails, { fetch: customFetch });

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({ href: 'https://example.com/mcp' }),
        expect.objectContaining({
          fetch: customFetch,
        })
      );
    });

    it('does not include fetch in transport options when not provided', () => {
      new McpClient(mockLogger, clientDetails);

      const transportCallArgs = (StreamableHTTPClientTransport as jest.Mock).mock.calls[0][1];
      expect(transportCallArgs).not.toHaveProperty('fetch');
    });

    it('creates client with correct name and version', () => {
      new McpClient(mockLogger, clientDetails);

      expect(Client).toHaveBeenCalledWith({
        name: 'test-client',
        version: '1.0.0',
      });
    });
  });

  describe('connect', () => {
    it('connects successfully when not already connected', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      mockClient.connect.mockResolvedValue(undefined);
      const mockCapabilities: ServerCapabilities = {
        tools: {},
      };
      mockClient.getServerCapabilities.mockReturnValue(mockCapabilities);

      const result = await client.connect();

      expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);
      expect(result).toEqual({
        connected: true,
        capabilities: mockCapabilities,
      });
      const connectStatus = await client.isConnected();
      expect(connectStatus).toEqual(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Attempting to connect to MCP server test-client, 1.0.0'
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Connected to MCP server test-client, 1.0.0');
    });

    it('returns undefined capabilities when not available', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue(undefined);

      const result = await client.connect();

      expect(result).toEqual({
        connected: true,
        capabilities: undefined,
      });
    });

    it('does not reconnect if already connected', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue(undefined);

      await client.connect();
      jest.clearAllMocks();
      mockClient.getServerCapabilities.mockReturnValue(undefined);

      const result = await client.connect();

      expect(mockClient.connect).not.toHaveBeenCalled();
      expect(result).toEqual({
        connected: true,
        capabilities: undefined,
      });
    });

    it('throws StreamableHTTPError with formatted message', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      const error = new StreamableHTTPError(500, 'Connection failed');
      mockClient.connect.mockRejectedValue(error);

      // The SDK formats the message as "Streamable HTTP error: Connection failed"
      // Our client just passes through the message without adding a prefix
      await expect(client.connect()).rejects.toThrow('Streamable HTTP error: Connection failed');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Attempting to connect to MCP server test-client, 1.0.0'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error connecting to MCP server test-client, 1.0.0: Streamable HTTP error: Connection failed'
      );
    });

    it('throws UnauthorizedError with formatted message', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      const error = new UnauthorizedError('Unauthorized');
      mockClient.connect.mockRejectedValue(error);

      await expect(client.connect()).rejects.toThrow('Unauthorized error: Unauthorized');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Attempting to connect to MCP server test-client, 1.0.0'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error connecting to MCP server test-client, 1.0.0: Unauthorized'
      );
    });

    it('throws generic error with formatted message', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      const error = new Error('Generic error');
      mockClient.connect.mockRejectedValue(error);

      await expect(client.connect()).rejects.toThrow(
        'Error connecting to MCP server: Generic error'
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Attempting to connect to MCP server test-client, 1.0.0'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error connecting to MCP server test-client, 1.0.0: Generic error'
      );
    });

    it('includes error cause in the message when available', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      const cause = new Error('unable to get local issuer certificate');
      const error = new TypeError('fetch failed', { cause });
      mockClient.connect.mockRejectedValue(error);

      await expect(client.connect()).rejects.toThrow(
        'Error connecting to MCP server: fetch failed (cause: unable to get local issuer certificate)'
      );
    });

    it('handles non-Error objects', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      mockClient.connect.mockRejectedValue('String error');

      await expect(client.connect()).rejects.toThrow(
        'Error connecting to MCP server: String error'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error connecting to MCP server test-client, 1.0.0: String error'
      );
    });

    it('handles error objects without message property', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      const error = { code: 500, status: 'error' };
      mockClient.connect.mockRejectedValue(error);

      await expect(client.connect()).rejects.toThrow(
        'Error connecting to MCP server: [object Object]'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error connecting to MCP server test-client, 1.0.0: [object Object]'
      );
    });

    it('throws McpConnectionError with httpStatus from StreamableHTTPError.code', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      const error = new StreamableHTTPError(500, 'Connection failed');
      mockClient.connect.mockRejectedValue(error);

      const thrown = await client.connect().catch((e) => e);

      expect(thrown).toBeInstanceOf(McpConnectionError);
      expect((thrown as McpConnectionError).httpStatus).toBe(500);
      expect((thrown as McpConnectionError).message).toBe(
        'Streamable HTTP error: Connection failed'
      );
    });

    it('throws McpConnectionError with httpStatus 401 for UnauthorizedError', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      const error = new UnauthorizedError('Auth failed');
      mockClient.connect.mockRejectedValue(error);

      const thrown = await client.connect().catch((e) => e);

      expect(thrown).toBeInstanceOf(McpConnectionError);
      expect((thrown as McpConnectionError).httpStatus).toBe(401);
      expect((thrown as McpConnectionError).message).toContain('Unauthorized error');
    });

    it('throws McpConnectionError with no httpStatus for generic errors', async () => {
      const client = new McpClient(mockLogger, clientDetails);
      const error = new Error('Generic error');
      mockClient.connect.mockRejectedValue(error);

      const thrown = await client.connect().catch((e) => e);

      expect(thrown).toBeInstanceOf(McpConnectionError);
      expect((thrown as McpConnectionError).httpStatus).toBeUndefined();
      expect((thrown as McpConnectionError).message).toContain('Error connecting to MCP server');
    });
  });

  describe('sessionId', () => {
    it('returns the transport session id', () => {
      const client = new McpClient(mockLogger, clientDetails);
      (mockTransport as unknown as { sessionId: string }).sessionId = 'sess-abc';
      expect(client.sessionId).toBe('sess-abc');
    });

    it('returns undefined when transport has no session id', () => {
      const client = new McpClient(mockLogger, clientDetails);
      expect(client.sessionId).toBeUndefined();
    });
  });

  describe('terminate', () => {
    it('calls terminateSession then disconnect in order', async () => {
      const order: string[] = [];
      (mockTransport as unknown as { terminateSession: jest.Mock }).terminateSession = jest
        .fn()
        .mockImplementation(async () => {
          order.push('terminateSession');
        });
      mockClient.close.mockImplementation(async () => {
        order.push('close');
      });

      const client = await createConnectedClient();
      await client.terminate();

      expect(order).toEqual(['terminateSession', 'close']);
    });

    it('calls terminateSession and disconnect once each', async () => {
      (mockTransport as unknown as { terminateSession: jest.Mock }).terminateSession = jest
        .fn()
        .mockResolvedValue(undefined);
      mockClient.close.mockResolvedValue(undefined);

      const client = await createConnectedClient();
      await client.terminate();

      expect(
        (mockTransport as unknown as { terminateSession: jest.Mock }).terminateSession
      ).toHaveBeenCalledTimes(1);
      expect(mockClient.close).toHaveBeenCalledTimes(1);
    });

    it('still calls disconnect when terminateSession rejects', async () => {
      (mockTransport as unknown as { terminateSession: jest.Mock }).terminateSession = jest
        .fn()
        .mockRejectedValue(new Error('network error'));
      mockClient.close.mockResolvedValue(undefined);

      const client = await createConnectedClient();
      await expect(client.terminate()).rejects.toThrow('network error');

      expect(mockClient.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('disconnects when connected', async () => {
      const client = await createConnectedClient();
      mockClient.close.mockResolvedValue(undefined);

      await client.disconnect();
      const connectStatus = await client.isConnected();

      expect(mockClient.close).toHaveBeenCalled();
      expect(connectStatus).toEqual(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Attempting to disconnect from MCP server test-client, 1.0.0'
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Disconnected from MCP client test-client, 1.0.0'
      );
    });

    it('does nothing when not connected', async () => {
      const client = new McpClient(mockLogger, clientDetails);

      await client.disconnect();
      const connectStatus = await client.isConnected();

      expect(mockClient.close).not.toHaveBeenCalled();
      expect(connectStatus).toEqual(false);
    });

    it('handles disconnect errors gracefully', async () => {
      const client = await createConnectedClient();
      const error = new Error('Disconnect failed');
      mockClient.close.mockRejectedValue(error);

      await expect(client.disconnect()).rejects.toThrow('Disconnect failed');
      const connectStatus = await client.isConnected();
      expect(connectStatus).toEqual(true); // Should remain connected on error
    });
  });

  describe('listTools', () => {
    it('returns all tools from single page', async () => {
      const client = await createConnectedClient();

      mockClient.listTools.mockResolvedValue({
        isError: false,
        tools: [
          { name: 'tool1', description: 'Tool 1', inputSchema: {} },
          { name: 'tool2', description: 'Tool 2', inputSchema: {} },
        ],
        nextCursor: undefined,
      });

      const result = await client.listTools();

      expect(result.tools).toHaveLength(2);
      expect(result.tools[0]).toEqual({
        name: 'tool1',
        description: 'Tool 1',
        inputSchema: {},
      });
      expect(result.tools[1]).toEqual({
        name: 'tool2',
        description: 'Tool 2',
        inputSchema: {},
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Listing tools from MCP server test-client, 1.0.0'
      );
    });

    it('handles pagination correctly', async () => {
      const client = await createConnectedClient();

      mockClient.listTools
        .mockResolvedValueOnce({
          isError: false,
          tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: {} }],
          nextCursor: 'cursor1',
        })
        .mockResolvedValueOnce({
          isError: false,
          tools: [{ name: 'tool2', description: 'Tool 2', inputSchema: {} }],
          nextCursor: undefined,
        });

      const result = await client.listTools();

      expect(result.tools).toHaveLength(2);
      expect(mockClient.listTools).toHaveBeenCalledTimes(2);
      expect(mockClient.listTools).toHaveBeenNthCalledWith(1, { cursor: undefined });
      expect(mockClient.listTools).toHaveBeenNthCalledWith(2, { cursor: 'cursor1' });
    });

    it('handles multiple pages of pagination', async () => {
      const client = await createConnectedClient();

      mockClient.listTools
        .mockResolvedValueOnce({
          isError: false,
          tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: {} }],
          nextCursor: 'cursor1',
        })
        .mockResolvedValueOnce({
          isError: false,
          tools: [{ name: 'tool2', description: 'Tool 2', inputSchema: {} }],
          nextCursor: 'cursor2',
        })
        .mockResolvedValueOnce({
          isError: false,
          tools: [{ name: 'tool3', description: 'Tool 3', inputSchema: {} }],
          nextCursor: undefined,
        });

      const result = await client.listTools();

      expect(result.tools).toHaveLength(3);
      expect(mockClient.listTools).toHaveBeenCalledTimes(3);
    });

    it('handles empty tools list', async () => {
      const client = await createConnectedClient();

      mockClient.listTools.mockResolvedValue({
        isError: false,
        tools: [],
        nextCursor: undefined,
      });

      const result = await client.listTools();

      expect(result.tools).toHaveLength(0);
    });

    it('throws error when response has isError', async () => {
      const client = await createConnectedClient();

      mockClient.listTools.mockResolvedValue({
        isError: true,
        error: 'List tools failed',
      });

      await expect(client.listTools()).rejects.toThrow('Error listing tools: List tools failed');
    });

    it('handles error response with non-string error', async () => {
      const client = await createConnectedClient();

      mockClient.listTools.mockResolvedValue({
        isError: true,
        error: { message: 'Error message', code: 500 },
      });

      await expect(client.listTools()).rejects.toThrow('Error listing tools: [object Object]');
    });

    it('throws error when not connected', async () => {
      const client = new McpClient(mockLogger, clientDetails);

      await expect(client.listTools()).rejects.toThrow('MCP client not connected');
    });

    it('handles tools with missing optional fields', async () => {
      const client = await createConnectedClient();

      mockClient.listTools.mockResolvedValue({
        isError: false,
        tools: [
          { name: 'tool1', inputSchema: {} }, // No description
          { name: 'tool2', description: 'Tool 2', inputSchema: {} },
        ],
        nextCursor: undefined,
      });

      const result = await client.listTools();

      expect(result.tools).toHaveLength(2);
      expect(result.tools[0]).toEqual({
        name: 'tool1',
        description: undefined,
        inputSchema: {},
      });
    });
  });

  describe('callTool', () => {
    it('returns text content parts', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: false,
        content: [
          { type: 'text', text: 'Result 1' },
          { type: 'text', text: 'Result 2' },
        ],
      });

      const params: CallToolParams = {
        name: 'test-tool',
        arguments: { arg1: 'value1' },
      };

      const result = await client.callTool(params);

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'test-tool',
        arguments: { arg1: 'value1' },
      });
      expect(result.content).toEqual([
        { type: 'text', text: 'Result 1' },
        { type: 'text', text: 'Result 2' },
      ]);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Calling tool test-tool on MCP server test-client, 1.0.0'
      );
    });

    it('filters out non-text content parts', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: false,
        content: [
          { type: 'text', text: 'Text result' },
          { type: 'image', data: 'base64data', mimeType: 'image/png' },
          { type: 'text', text: 'Another text' },
        ],
      });

      const result = await client.callTool({
        name: 'test-tool',
        arguments: {},
      });

      expect(result.content).toEqual([
        { type: 'text', text: 'Text result' },
        { type: 'text', text: 'Another text' },
      ]);
    });

    it('filters out audio content parts', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: false,
        content: [
          { type: 'text', text: 'Text result' },
          { type: 'audio', data: 'base64data', mimeType: 'audio/mpeg' },
        ],
      });

      const result = await client.callTool({
        name: 'test-tool',
        arguments: {},
      });

      expect(result.content).toEqual([{ type: 'text', text: 'Text result' }]);
    });

    it('preserves resource_link content parts', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: false,
        content: [
          { type: 'text', text: 'Text result' },
          { type: 'resource_link', uri: 'https://example.com', name: 'Resource' },
        ],
      });

      const result = await client.callTool({
        name: 'test-tool',
        arguments: {},
      });

      expect(result.content).toEqual([
        { type: 'text', text: 'Text result' },
        { type: 'resource_link', uri: 'https://example.com', name: 'Resource' },
      ]);
    });

    it('preserves embedded resource content parts', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: false,
        content: [
          { type: 'text', text: 'Text result' },
          {
            type: 'resource',
            resource: {
              uri: 'file:///project/src/main.rs',
              mimeType: 'text/x-rust',
              text: 'fn main() {\\n  println!("Hello world!");\\n}',
            },
          },
        ],
      });

      const result = await client.callTool({
        name: 'test-tool',
        arguments: {},
      });

      expect(result.content).toEqual([
        { type: 'text', text: 'Text result' },
        {
          type: 'resource',
          resource: {
            uri: 'file:///project/src/main.rs',
            mimeType: 'text/x-rust',
            text: 'fn main() {\\n  println!("Hello world!");\\n}',
          },
        },
      ]);
    });

    it('handles empty content array', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: false,
        content: [],
      });

      const result = await client.callTool({
        name: 'test-tool',
        arguments: {},
      });

      expect(result.content).toEqual([]);
    });

    it('handles empty arguments', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'Result' }],
      });

      const result = await client.callTool({
        name: 'test-tool',
        arguments: {},
      });

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'test-tool',
        arguments: {},
      });
      expect(result.content).toEqual([{ type: 'text', text: 'Result' }]);
    });

    it('handles undefined arguments', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'Result' }],
      });

      await client.callTool({
        name: 'test-tool',
        arguments: undefined as unknown as Record<string, unknown>,
      });

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'test-tool',
        arguments: undefined,
      });
    });

    it('filters out text parts with invalid text property', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: false,
        content: [
          { type: 'text', text: 'Valid text' },
          { type: 'text', text: null },
          { type: 'text' },
        ],
      });

      const result = await client.callTool({
        name: 'test-tool',
        arguments: {},
      });

      expect(result.content).toEqual([{ type: 'text', text: 'Valid text' }]);
    });

    it('filters out text parts with non-string text', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: false,
        content: [
          { type: 'text', text: 'Valid text' },
          { type: 'text', text: 123 },
          { type: 'text', text: {} },
        ],
      });

      const result = await client.callTool({
        name: 'test-tool',
        arguments: {},
      });

      expect(result.content).toEqual([{ type: 'text', text: 'Valid text' }]);
    });

    it('throws error when response has isError', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'Tool execution failed' }],
      });

      await expect(
        client.callTool({ name: 'test-tool', arguments: { arg1: 'value1' } })
      ).rejects.toThrow(
        `Error calling tool 'test-tool' with arguments '{"arg1":"value1"}': Tool execution failed`
      );
    });

    it('throws error with multiple text parts joined by newlines', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: true,
        content: [
          { type: 'text', text: 'Error line 1' },
          { type: 'text', text: 'Error line 2' },
        ],
      });

      await expect(client.callTool({ name: 'test-tool', arguments: {} })).rejects.toThrow(
        `Error calling tool 'test-tool' with arguments '{}': Error line 1\nError line 2`
      );
    });

    it('throws error with default message when no text content parts', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: true,
        content: [{ type: 'image', data: 'base64data' }],
      });

      await expect(client.callTool({ name: 'test-tool', arguments: {} })).rejects.toThrow(
        `Error calling tool 'test-tool' with arguments '{}': Unknown tool error`
      );
    });

    it('throws error when not connected', async () => {
      const client = new McpClient(mockLogger, clientDetails);

      await expect(client.callTool({ name: 'test-tool', arguments: {} })).rejects.toThrow(
        'MCP client not connected to test-client, 1.0.0'
      );
    });

    it('handles malformed content array gracefully', async () => {
      const client = await createConnectedClient();

      mockClient.callTool.mockResolvedValue({
        isError: false,
        content: [
          { type: 'text', text: 'Valid' },
          { type: 'unknown', data: 'some data' },
          null,
          undefined,
        ] as unknown as Array<{ type: string; text?: string | null; [key: string]: unknown }>,
      });

      const result = await client.callTool({
        name: 'test-tool',
        arguments: {},
      });

      expect(result.content).toEqual([{ type: 'text', text: 'Valid' }]);
    });
  });
});
