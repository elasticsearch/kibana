/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from '@kbn/core/server';
import { McpConnectionError } from './errors';
import type {
  ClientDetails,
  CallToolParams,
  CallToolResponse,
  ContentPart,
  ListToolsResponse,
  Tool,
  McpClientOptions,
} from './types';
import { isEmbeddedResourcePart, isResourceLinkPart, isTextPart } from './types';

/**
 * Produces a human-readable error message from a connection error,
 * surfacing the `cause` that would otherwise be hidden behind
 * the opaque "fetch failed" message from Node.js.
 */
function formatConnectionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : undefined;

  if (cause instanceof Error) {
    return `${message} (cause: ${cause.message})`;
  }

  return message;
}

/**
 * McpClient is a wrapper around the MCP client SDK.
 * It provides a simple interface for connecting to an MCP client,
 * listing tools, and calling tools.
 */
export class McpClient {
  private readonly client: Client;
  private readonly transport: StreamableHTTPClientTransport;

  private connected: boolean = false;

  public name: string;
  public version: string;

  constructor(
    private readonly logger: Logger,
    clientDetails: ClientDetails,
    {
      headers = {},
      fetch: customFetch,
      maxRetries = 3,
      reconnectionDelayGrowFactor = 1.5,
      initialReconnectionDelay = 1000,
      maxReconnectionDelay = 10000,
    }: McpClientOptions = {}
  ) {
    this.transport = new StreamableHTTPClientTransport(new URL(clientDetails.url), {
      requestInit: {
        headers,
      },
      ...(customFetch ? { fetch: customFetch } : {}),
      reconnectionOptions: {
        maxRetries,
        reconnectionDelayGrowFactor,
        initialReconnectionDelay,
        maxReconnectionDelay,
      },
    });

    this.name = clientDetails.name;
    this.version = clientDetails.version;

    this.client = new Client({
      name: clientDetails.name,
      version: clientDetails.version,
    });
  }

  /**
   * Public getter for the connection status.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Connect to the MCP client and return the connected status and capabilities.
   */
  async connect(): Promise<{ connected: boolean; capabilities?: ServerCapabilities }> {
    if (!this.connected) {
      this.logger.debug(`Attempting to connect to MCP server ${this.name}, ${this.version}`);
      try {
        // connect() performs the initialization handshake with the MCP server as per MCP protocol
        await this.client.connect(this.transport);
        this.connected = true;
        this.logger.debug(`Connected to MCP server ${this.name}, ${this.version}`);
      } catch (error) {
        const errorMessage = formatConnectionErrorMessage(error);
        this.logger.error(
          `Error connecting to MCP server ${this.name}, ${this.version}: ${errorMessage}`
        );
        if (error instanceof StreamableHTTPError) {
          throw new McpConnectionError(errorMessage, { httpStatus: error.code, cause: error });
        } else if (error instanceof UnauthorizedError) {
          throw new McpConnectionError(`Unauthorized error: ${errorMessage}`, {
            httpStatus: 401,
            cause: error,
          });
        } else {
          throw new McpConnectionError(`Error connecting to MCP server: ${errorMessage}`, {
            cause: error,
          });
        }
      }
    }
    // return the full list of capabilities as a by-product of the initialization handshake
    const capabilities = this.client.getServerCapabilities();

    return {
      connected: this.connected,
      capabilities,
    };
  }

  public get sessionId(): string | undefined {
    return this.transport.sessionId;
  }

  public async terminate(): Promise<void> {
    try {
      await this.transport.terminateSession();
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Disconnect from the MCP client and return the disconnected status.
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      this.logger.debug(`Attempting to disconnect from MCP server ${this.name}, ${this.version}`);
      await this.client.close();
      this.connected = false;
      this.logger.debug(`Disconnected from MCP client ${this.name}, ${this.version}`);
    }
  }

  /**
   * List the tools available on the MCP client.
   */
  async listTools(): Promise<ListToolsResponse> {
    if (!this.connected) {
      throw new Error(`MCP client not connected to ${this.name}, ${this.version}`);
    }

    this.logger.debug(`Listing tools from MCP server ${this.name}, ${this.version}`);
    const getNextPage = async (cursor?: string): Promise<Tool[]> => {
      const response = await this.client.listTools({
        cursor,
      });

      if (response.isError) {
        throw new Error(`Error listing tools: ${response.error}`);
      }

      const { tools, nextCursor } = response;

      return [
        ...tools.map((tool): Tool => {
          return {
            description: tool.description,
            inputSchema: tool.inputSchema,
            name: tool.name,
          };
        }),
        ...(nextCursor ? await getNextPage(nextCursor) : []),
      ];
    };

    const tools: ListToolsResponse = {
      tools: await getNextPage(),
    };

    return tools;
  }

  /**
   * Call a tool on the MCP client.
   * This method returns text content, plus resource links and embedded resources.
   * It does not support other content types such as images and audio.
   * @param {CallToolParams} params - The parameters for the tool call.
   */
  async callTool(params: CallToolParams): Promise<CallToolResponse> {
    if (!this.connected) {
      throw new Error(`MCP client not connected to ${this.name}, ${this.version}`);
    }

    this.logger.debug(`Calling tool ${params.name} on MCP server ${this.name}, ${this.version}`);
    const response = await this.client.callTool({
      name: params.name,
      arguments: params.arguments,
    });

    const content = (Array.isArray(response.content) ? response.content : []) as Array<
      ContentPart | null | undefined
    >;
    const allowedParts = content.filter(
      (part): part is ContentPart =>
        isTextPart(part) || isResourceLinkPart(part) || isEmbeddedResourcePart(part)
    );
    const textParts = allowedParts.filter(isTextPart);

    if (response.isError) {
      // Tool execution errors are returned as text content parts
      // See https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling
      const errorText = textParts.map((part) => part.text).join('\n') || 'Unknown tool error';
      throw new Error(
        `Error calling tool '${params.name}' with arguments '${JSON.stringify(
          params.arguments
        )}': ${errorText}`
      );
    }

    return {
      content: allowedParts,
    };
  }
}
