/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Client
export { McpClient } from './mcp/src/client';

// Errors
export { McpConnectionError } from './mcp/src/errors';

// Errors - re-exported from SDK for use by consumers
export { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
export { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';

// Types
export type {
  ClientDetails,
  CallToolParams,
  CallToolResponse,
  ContentPart,
  ResourceAnnotations,
  ResourceLinkPart,
  EmbeddedResourcePart,
  FetchLike,
  ListToolsResponse,
  Tool,
  ToolProviderMetadata,
  TextPart,
  NonTextPart,
  McpClientOptions,
} from './mcp/src/types';
