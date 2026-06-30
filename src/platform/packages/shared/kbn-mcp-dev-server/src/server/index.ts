/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { run } from '@kbn/dev-cli-runner';

import { addTool } from '../utils';
import { listKibanaPackagesTool } from '../tools/list_packages';
import { generateKibanaPackageTool } from '../tools/generate_package';
import { listKibanaTeamsTool } from '../tools/list_teams';
import { runUnitTestsTool } from '../tools/run_unit_tests';
import { runCiChecksTool } from '../tools/run_ci_checks';
import { searchByCodeownerTool } from '../tools/search_by_codeowner';
import { findDependencyReferencesTool } from '../tools/find_dependency_references';

const createServer = () => {
  const server = new McpServer({ name: 'mcp-dev-server', version: '1.0.0' });
  addTool(server, listKibanaPackagesTool);
  addTool(server, generateKibanaPackageTool);
  addTool(server, listKibanaTeamsTool);
  addTool(server, runUnitTestsTool);
  addTool(server, runCiChecksTool);
  addTool(server, searchByCodeownerTool);
  addTool(server, findDependencyReferencesTool);
  return server;
};

const readBody = (req: http.IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });

run(
  async ({ log, flags }) => {
    if (flags.http) {
      const port = typeof flags.port === 'number' ? flags.port : 3001;

      const httpServer = http.createServer(async (req, res) => {
        try {
          const body = await readBody(req);
          // Stateless mode: new McpServer + transport per request; keeps things simple
          // and avoids session-management complexity for a local dev tool.
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
          const server = createServer();
          await server.connect(transport);
          await transport.handleRequest(req, res, body);
          await server.close();
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32700, message: 'Parse error' },
              id: null,
            })
          );
        }
      });

      await new Promise<void>((resolve, reject) => {
        httpServer.listen(port, '127.0.0.1', () => {
          log.info(`MCP dev server (HTTP) listening at http://127.0.0.1:${port}`);
          log.info(`Point your Kibana MCP connector serverUrl to: http://127.0.0.1:${port}`);
        });
        httpServer.on('error', reject);
        process.on('SIGINT', () => httpServer.close(() => resolve()));
        process.on('SIGTERM', () => httpServer.close(() => resolve()));
      });
    } else {
      const transport = new StdioServerTransport();
      await createServer().connect(transport);
    }
  },
  {
    description: 'Start the Kibana MCP dev server (stdio by default, HTTP with --http)',
    flags: {
      boolean: ['http'],
      string: ['port'],
      help: `
        --http         Start in HTTP mode (Streamable HTTP) so a Kibana MCP connector can reach it
        --port         Port to listen on in HTTP mode (default: 3001)
      `,
    },
  }
);
