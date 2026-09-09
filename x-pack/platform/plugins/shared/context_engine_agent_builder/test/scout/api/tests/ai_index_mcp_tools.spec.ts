/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { KibanaRole, RoleApiCredentials } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { contextEngineAiIndexTools } from '@kbn/agent-builder-common/tools';
import {
  apiTest,
  testData,
  callToolForResults,
  columnValues,
  mcpToolName,
  resultOfType,
  spaceScoped,
  withMcpClient,
  type EsqlResponse,
} from '../fixtures';

const {
  AI_INDEX_COLLECTION_PATH,
  MCP_PATH,
  CONTEXT_ENGINE_ENABLED_SETTING,
  AGENT_BUILDER_EXPERIMENTAL_SETTING,
} = testData;
// Unique per run so retried beforeAll does not 409.
const RUN_ID = randomUUID().slice(0, 8);
const OTHER_SPACE_ID = `ce-mcp-other-${RUN_ID}`;
const INDEX = `ai-index-idx-scout-mcp-${RUN_ID}`;
const AI_INDEX_ID = `scout-mcp-${RUN_ID}`;

const API_HEADERS = {
  ...testData.COMMON_HEADERS,
  'elastic-api-version': '2023-10-31',
};

const TOOL = {
  list: mcpToolName(contextEngineAiIndexTools.listAiIndices),
  describe: mcpToolName(contextEngineAiIndexTools.describeAiIndex),
  query: mcpToolName(contextEngineAiIndexTools.queryAiIndices),
};

const AGENT_BUILDER_READ = { agentBuilder: ['read'] };
const CONTEXT_ENGINE_READ = { contextEngine: ['read'] };
const ES_READ = {
  cluster: [],
  indices: [{ names: [INDEX], privileges: ['read', 'view_index_metadata'] }],
};

/** Agent Builder + CE read, plus ES read on backing index. */
const MCP_ROLE: KibanaRole = {
  elasticsearch: ES_READ,
  kibana: [{ base: [], feature: { ...AGENT_BUILDER_READ, ...CONTEXT_ENGINE_READ }, spaces: ['*'] }],
};

/** Reaches MCP server but lacks CE read: tools must fail closed. */
const MCP_ONLY_ROLE: KibanaRole = {
  elasticsearch: ES_READ,
  kibana: [{ base: [], feature: AGENT_BUILDER_READ, spaces: ['*'] }],
};

const MAPPINGS = {
  properties: {
    type: { type: 'keyword' as const },
    title: { type: 'keyword' as const },
    tags: { type: 'keyword' as const },
    permissions: {
      properties: {
        kibana: {
          properties: {
            privileges: {
              type: 'nested' as const,
              properties: { space: { type: 'keyword' as const } },
            },
          },
        },
      },
    },
  },
};

interface ListedAiIndex {
  id: string;
  esql_target: string;
  description?: string;
  managed: boolean;
  assigned_to_agent?: boolean;
}

/** list -> describe -> query, each step fed by previous output. */
const runChain = async (client: Client) => {
  const { ai_indices: aiIndices } = resultOfType<{ ai_indices: ListedAiIndex[] }>(
    await callToolForResults(client, TOOL.list),
    'other'
  );
  const entry = aiIndices.find(({ id }) => id === AI_INDEX_ID);
  if (!entry) {
    throw new Error(`${AI_INDEX_ID} not listed: ${JSON.stringify(aiIndices)}`);
  }

  const { response: block } = resultOfType<{ response: string }>(
    await callToolForResults(client, TOOL.describe, { ai_index_id: entry.id }),
    'other'
  );

  const rows = resultOfType<EsqlResponse>(
    await callToolForResults(client, TOOL.query, {
      query: `FROM ${entry.esql_target} | KEEP title | SORT title`,
      limit: 10,
    }),
    'other'
  );

  return { entry, block, titles: columnValues(rows, 'title') };
};

apiTest.describe('AI index tools over MCP', { tag: tags.stateful.classic }, () => {
  let adminCredentials: RoleApiCredentials;
  let mcpCredentials: RoleApiCredentials;
  let mcpOnlyCredentials: RoleApiCredentials;
  let mcpUrl: (path?: string) => string;

  const asMcp = <T>(
    fn: (client: Client) => Promise<T>,
    { path = MCP_PATH, credentials = mcpCredentials } = {}
  ) => withMcpClient({ url: mcpUrl(path), headers: credentials.apiKeyHeader }, fn);

  apiTest.beforeAll(async ({ requestAuth, kbnClient, kbnUrl, esClient, apiClient }) => {
    adminCredentials = await requestAuth.getApiKey('admin');
    mcpCredentials = await requestAuth.getApiKeyForCustomRole(MCP_ROLE);
    mcpOnlyCredentials = await requestAuth.getApiKeyForCustomRole(MCP_ONLY_ROLE);
    mcpUrl = (path = MCP_PATH) => kbnUrl.get(path);

    await kbnClient.spaces.create({ id: OTHER_SPACE_ID, name: 'CE MCP other space' });
    // Both settings are per-space.
    for (const space of [undefined, OTHER_SPACE_ID]) {
      await kbnClient.uiSettings.update(
        { [CONTEXT_ENGINE_ENABLED_SETTING]: true, [AGENT_BUILDER_EXPERIMENTAL_SETTING]: true },
        space ? { space } : undefined
      );
    }
    await kbnClient.uiSettings.waitForEventualCacheRefresh();

    await esClient.indices.create({ index: INDEX, mappings: MAPPINGS });
    await esClient.bulk({
      refresh: 'wait_for',
      operations: [
        { index: { _index: INDEX, _id: 'shared' } },
        { type: 'document', title: 'Shared', tags: ['shared'] },
        { index: { _index: INDEX, _id: 'other_only' } },
        {
          type: 'detection',
          title: 'Other space only',
          tags: ['secret'],
          ...spaceScoped(OTHER_SPACE_ID),
        },
      ],
    });

    const response = await apiClient.post(AI_INDEX_COLLECTION_PATH, {
      headers: { ...adminCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
      body: {
        id: AI_INDEX_ID,
        description: 'Scout MCP fixture',
        dest: { type: 'index', value: INDEX },
        automations: [],
        sources: [],
      },
    });
    expect(response).toHaveStatusCode(201);
  });

  apiTest.afterAll(async ({ apiClient, kbnClient, esClient }) => {
    await apiClient.delete(`${AI_INDEX_COLLECTION_PATH}/${AI_INDEX_ID}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
    });
    await esClient.indices.delete({ index: INDEX }, { ignore: [404] });
    await kbnClient.spaces.delete(OTHER_SPACE_ID);
    await kbnClient.uiSettings.unset(CONTEXT_ENGINE_ENABLED_SETTING);
    await kbnClient.uiSettings.unset(AGENT_BUILDER_EXPERIMENTAL_SETTING);
  });

  apiTest(
    'lists read-only tools and chains list -> describe -> query, agreeing with the routes',
    async ({ apiClient }) => {
      const { tools, chain } = await asMcp(async (client) => ({
        tools: (await client.listTools()).tools,
        chain: await runChain(client),
      }));
      const byName = new Map(tools.map((tool) => [tool.name, tool]));

      for (const name of Object.values(TOOL)) {
        expect(byName.get(name)?.annotations?.readOnlyHint).toBe(true);
      }
      for (const name of [TOOL.list, TOOL.query]) {
        expect(byName.get(name)?.description).toContain('/s/{spaceId}/api/agent_builder/mcp');
      }

      expect(chain.entry).toStrictEqual({
        id: AI_INDEX_ID,
        esql_target: INDEX,
        description: 'Scout MCP fixture',
        managed: false,
      });
      expect(chain.block).toContain(`FROM ${INDEX}`);
      expect(chain.block).toContain('Fields');
      expect(chain.block).toContain('title: keyword');
      expect(chain.titles).toStrictEqual(['Shared']);

      const viaRoute = await apiClient.post(`${AI_INDEX_COLLECTION_PATH}/_query`, {
        headers: { ...mcpCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
        body: { query: `FROM ${INDEX} | KEEP title | SORT title` },
      });
      expect(viaRoute).toHaveStatusCode(200);
      expect(columnValues(viaRoute.body, 'title')).toStrictEqual(chain.titles);
    }
  );

  apiTest('takes the space from the /s/{spaceId} MCP URL', async ({ apiClient }) => {
    const { entry, block, titles } = await asMcp(runChain, {
      path: `s/${OTHER_SPACE_ID}/${MCP_PATH}`,
    });

    expect(entry.id).toBe(AI_INDEX_ID);
    expect(block).toContain(`FROM ${INDEX}`);
    expect(titles).toStrictEqual(['Other space only', 'Shared']);

    const viaRoute = await apiClient.post(
      `s/${OTHER_SPACE_ID}/${AI_INDEX_COLLECTION_PATH}/_query`,
      {
        headers: { ...mcpCredentials.apiKeyHeader, ...API_HEADERS },
        responseType: 'json',
        body: { query: `FROM ${INDEX} | KEEP title | SORT title` },
      }
    );
    expect(viaRoute).toHaveStatusCode(200);
    expect(columnValues(viaRoute.body, 'title')).toStrictEqual(titles);
  });

  apiTest('fails closed without the Context Engine read privilege', async ({ apiClient }) => {
    const envelopes = await asMcp(
      async (client) =>
        Promise.all([
          callToolForResults(client, TOOL.list),
          callToolForResults(client, TOOL.describe, { ai_index_id: AI_INDEX_ID }),
          callToolForResults(client, TOOL.query, { query: `FROM ${INDEX}` }),
        ]),
      { credentials: mcpOnlyCredentials }
    );

    for (const envelope of envelopes) {
      expect(envelope.results.map(({ type }) => type)).toStrictEqual(['error']);
      expect(resultOfType<{ message: string }>(envelope, 'error').message).toContain(
        'Insufficient privileges'
      );
    }

    const viaRoute = await apiClient.get(AI_INDEX_COLLECTION_PATH, {
      headers: { ...mcpOnlyCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
    });
    expect(viaRoute).toHaveStatusCode(403);
  });

  apiTest('reports an unknown id as an error result', async ({ apiClient }) => {
    const missingId = `missing-${RUN_ID}`;

    const envelope = await asMcp((client) =>
      callToolForResults(client, TOOL.describe, { ai_index_id: missingId })
    );

    expect(resultOfType<{ message: string }>(envelope, 'error').message).toContain(missingId);

    const viaRoute = await apiClient.get(`${AI_INDEX_COLLECTION_PATH}/${missingId}/_describe`, {
      headers: { ...mcpCredentials.apiKeyHeader, ...API_HEADERS },
      responseType: 'json',
    });
    expect(viaRoute).toHaveStatusCode(404);
  });
});
