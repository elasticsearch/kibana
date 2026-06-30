/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext } from '../../connector_spec';

/**
 * Extracts text parts from MCP content and attempts to parse as JSON.
 * Falls back to the raw joined text if parsing fails.
 */
export const parseJsonTextFromContentParts = (
  content: Array<{ type: string; text?: string }>
): unknown => {
  const text = content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * Calls an MCP tool and returns the raw content parts.
 */
export const callToolContent = async (
  ctx: ActionContext,
  toolName: string,
  args?: Record<string, unknown>
) => {
  const mcp = await ctx.getClient('mcp');
  const result = await mcp.callTool({ name: toolName, arguments: args ?? {} });
  return result.content;
};

/**
 * Calls an MCP tool and returns the parsed JSON from its text content parts.
 */
export const callToolJson = async (
  ctx: ActionContext,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<unknown> => {
  const mcp = await ctx.getClient('mcp');
  const result = await mcp.callTool({ name: toolName, arguments: args });
  return parseJsonTextFromContentParts(result.content);
};
