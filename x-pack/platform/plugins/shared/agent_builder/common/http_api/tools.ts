/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ToolDefinition,
  ToolDefinitionWithSchema,
  SerializedAgentBuilderError,
} from '@kbn/agent-builder-common';
import type { ToolResult } from '@kbn/agent-builder-common/tools/tool_result';
import type { Tool as McpTool } from '@kbn/mcp-client';
import { CONNECTOR_ID as MCP_CONNECTOR_ID } from '@kbn/connector-schemas/mcp/constants';
import type { ToolTypeInfo } from '../tools';

export interface ListToolsResponse {
  results: ToolDefinition[];
}

export type GetToolResponse = ToolDefinitionWithSchema;

export interface DeleteToolResponse {
  success: boolean;
}

export const TOOL_USED_BY_AGENTS_ERROR_CODE = 'TOOL_USED_BY_AGENTS';

export interface AgentRef {
  id: string;
  name: string;
}

export type CreateToolPayload = Omit<
  ToolDefinition,
  'description' | 'tags' | 'readonly' | 'experimental'
> &
  Partial<Pick<ToolDefinition, 'description' | 'tags'>>;

export type UpdateToolPayload = Partial<Pick<ToolDefinition, 'description' | 'tags'>> & {
  configuration?: Partial<ToolDefinition['configuration']>;
};

export type CreateToolResponse = ToolDefinitionWithSchema;

export type UpdateToolResponse = ToolDefinitionWithSchema;

interface BulkDeleteToolResultBase {
  toolId: string;
}

interface BulkDeleteToolSuccessResult extends BulkDeleteToolResultBase {
  success: true;
}

interface BulkDeleteToolFailureResult extends BulkDeleteToolResultBase {
  success: false;
  reason: SerializedAgentBuilderError;
}

export type BulkDeleteToolResult = BulkDeleteToolSuccessResult | BulkDeleteToolFailureResult;

export interface BulkDeleteToolResponse {
  results: BulkDeleteToolResult[];
}

export interface ExecuteToolResponse {
  results: ToolResult[];
}

export interface ResolveSearchSourcesRequest {
  pattern: string;
}

export interface ResolveSearchSourceItem {
  type: 'index' | 'alias' | 'data_stream';
  name: string;
}

export interface ResolveSearchSourcesResponse {
  results: ResolveSearchSourceItem[];
  total: number;
}

export interface WorkflowItem {
  id: string;
  name: string;
  description: string;
}

export interface GetWorkflowResponse {
  id: string;
  name: string;
  description?: string;
}

export interface ListWorkflowsResponse {
  results: WorkflowItem[];
}

export interface GetToolTypeInfoResponse {
  toolTypes: ToolTypeInfo[];
}

/**
 * Tool health status returned by the health API.
 */
export type ToolHealthStatus = 'healthy' | 'failed' | 'unknown';

export interface ToolHealthState {
  toolId: string;
  status: ToolHealthStatus;
  lastCheck: string;
  errorMessage?: string;
  consecutiveFailures: number;
}

export interface GetToolHealthResponse {
  health: ToolHealthState | null;
}

export interface ListToolHealthResponse {
  results: ToolHealthState[];
}

/**
 * Request payload for bulk creating MCP tools from a connector.
 */
export interface BulkCreateMcpToolsRequest {
  /** The ID of the MCP connector to create tools from */
  connector_id: string;
  /** Tools to create (from client's listTools call on the connector) */
  tools: Array<{
    /** MCP tool name */
    name: string;
    /** Tool description */
    description?: string;
  }>;
  /** Optional namespace to prepend to tool IDs */
  namespace?: string;
  /** Optional tags to apply to all created tools */
  tags?: string[];
  /** Skip tools that already exist (default: true) */
  skip_existing?: boolean;
}

interface BulkCreateMcpToolResultBase {
  /** Generated tool ID */
  toolId: string;
  /** Original MCP tool name */
  mcpToolName: string;
}

interface BulkCreateMcpToolSuccessResult extends BulkCreateMcpToolResultBase {
  success: true;
}

interface BulkCreateMcpToolSkippedResult extends BulkCreateMcpToolResultBase {
  success: true;
  skipped: true;
}

interface BulkCreateMcpToolFailureResult extends BulkCreateMcpToolResultBase {
  success: false;
  reason: SerializedAgentBuilderError;
}

export type BulkCreateMcpToolResult =
  | BulkCreateMcpToolSuccessResult
  | BulkCreateMcpToolSkippedResult
  | BulkCreateMcpToolFailureResult;

export interface BulkCreateMcpToolsResponse {
  results: BulkCreateMcpToolResult[];
  summary: {
    total: number;
    created: number;
    skipped: number;
    failed: number;
  };
}

export interface ConnectorSubAction {
  name: string;
  description?: string;
}

export interface ConnectorItem {
  id: string;
  name: string;
  actionTypeId: string;
  config?: Record<string, unknown>;
  isPreconfigured: boolean;
  isDeprecated: boolean;
  isSystemAction: boolean;
  isMissingSecrets?: boolean;
  isConnectorTypeDeprecated: boolean;
  authMode?: 'shared' | 'per-user';
  oauthStatus?: OAuthStatus;
  /** Sub-actions derived from the connector spec (isTool: true actions) */
  subActions: ConnectorSubAction[];
}

export const OAUTH_STATUS = {
  AUTHORIZED: 'authorized',
  DISCONNECTED: 'disconnected',
} as const;

export type OAuthStatus = (typeof OAUTH_STATUS)[keyof typeof OAUTH_STATUS];

export interface McpConnectorItem extends ConnectorItem {
  actionTypeId: typeof MCP_CONNECTOR_ID;
  isPreconfigured: false;
}

export const isMcpConnectorItem = (connector: ConnectorItem): connector is McpConnectorItem => {
  return connector.actionTypeId === MCP_CONNECTOR_ID;
};

export interface ListConnectorsResponse {
  connectors: ConnectorItem[];
}

export interface GetConnectorResponse {
  connector: ConnectorItem;
}

interface BulkDeleteConnectorResultBase {
  connectorId: string;
}

interface BulkDeleteConnectorSuccessResult extends BulkDeleteConnectorResultBase {
  success: true;
}

interface BulkDeleteConnectorFailureResult extends BulkDeleteConnectorResultBase {
  success: false;
  reason: SerializedAgentBuilderError;
}

export type BulkDeleteConnectorResult =
  | BulkDeleteConnectorSuccessResult
  | BulkDeleteConnectorFailureResult;

export interface BulkDeleteConnectorsResponse {
  results: BulkDeleteConnectorResult[];
}

export interface ListMcpToolsResponse {
  mcpTools: McpTool[];
}

export type McpToolHealthStatus =
  | 'healthy'
  | 'tool_not_found'
  | 'connector_not_found'
  | 'list_tools_failed'
  | 'tool_unhealthy';

export interface McpToolHealthState {
  toolId: string;
  connectorId: string;
  mcpToolName: string;
  status: McpToolHealthStatus;
  errorMessage?: string;
}

export interface ListMcpToolsHealthResponse {
  results: McpToolHealthState[];
}

export interface ValidateNamespaceResponse {
  isValid: boolean;
  conflictingNamespaces: string[];
}
