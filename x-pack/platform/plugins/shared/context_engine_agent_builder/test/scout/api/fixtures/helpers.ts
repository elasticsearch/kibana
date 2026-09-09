/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface EsqlResponse {
  columns: Array<{ name: string }>;
  values: unknown[][];
}

export const columnValues = ({ columns, values }: EsqlResponse, name: string): unknown[] => {
  const index = columns.findIndex((column) => column.name === name);
  return values.map((row) => row[index]);
};

/** KI doc fragment scoping it to one space. */
export const spaceScoped = (spaceId: string) => ({
  permissions: { kibana: { privileges: [{ space: spaceId }] } },
});

/** Mirrors sanitizeToolId. */
export const mcpToolName = (toolId: string): string => toolId.replaceAll('.', '_');

export const withMcpClient = async <T>(
  { url, headers }: { url: string; headers: Record<string, string> },
  fn: (client: Client) => Promise<T>
): Promise<T> => {
  const client = new Client({ name: 'scout-context-engine', version: '1.0.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } })
    );
    return await fn(client);
  } finally {
    await client.close();
  }
};

export interface ToolResultEnvelope {
  results: Array<{ type: string; data: Record<string, unknown> }>;
}

/** Parses tool result JSON out of a tools/call response. */
export const callToolForResults = async (
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolResultEnvelope> => {
  const { content } = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>;
  };
  return JSON.parse(content[0].text);
};

export const resultOfType = <T = Record<string, unknown>>(
  envelope: ToolResultEnvelope,
  type: string
): T => {
  const result = envelope.results.find((entry) => entry.type === type);
  if (!result) {
    throw new Error(`No ${type} result in ${JSON.stringify(envelope)}`);
  }
  return result.data as T;
};
