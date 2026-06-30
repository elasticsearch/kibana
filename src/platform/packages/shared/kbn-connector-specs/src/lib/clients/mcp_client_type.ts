/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { McpClient, McpConnectionError } from '@kbn/mcp-client';
import type { FetchLike } from '@kbn/mcp-client';
import type { ClientTypeSpec } from './client_type_spec';

const MCP_CLIENT_VERSION = '1.0.0';

export const mcpClientType: ClientTypeSpec<McpClient> = {
  id: 'mcp',

  async build(ctx) {
    const serverUrl = typeof ctx.config?.serverUrl === 'string' ? ctx.config.serverUrl : undefined;
    if (!serverUrl) {
      throw new Error('config.serverUrl is required');
    }

    ctx.network.ensureUriAllowed(serverUrl);

    const guardedFetch: FetchLike = async (url, init) => {
      ctx.network.ensureUriAllowed(typeof url === 'string' ? url : url.toString());
      const authHeaders = await ctx.credential.getAuthHeaders();
      const mergedInit = { ...init, headers: new Headers(init?.headers) };
      for (const [key, val] of Object.entries(authHeaders)) {
        if (typeof val === 'string') {
          mergedInit.headers.set(key, val);
        }
      }
      return fetch(url, mergedInit);
    };

    const client = new McpClient(
      ctx.logger,
      { name: `kibana-mcp-${serverUrl}`, version: MCP_CLIENT_VERSION, url: serverUrl },
      { fetch: guardedFetch }
    );
    await client.connect();
    return client;
  },

  async terminate(client) {
    await client.terminate();
  },

  isUserError(err: unknown): boolean {
    if (err instanceof Error && err.message === 'config.serverUrl is required') {
      return true;
    }
    if (err instanceof McpConnectionError) {
      return err.httpStatus === 401 || err.httpStatus === 403;
    }
    return false;
  },
};
