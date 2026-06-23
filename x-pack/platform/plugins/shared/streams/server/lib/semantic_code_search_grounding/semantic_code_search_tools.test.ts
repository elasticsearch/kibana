/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { ElasticsearchClient, KibanaRequest, Logger } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import type { ToolsStart } from '@kbn/agent-builder-server';
import type { ToolCall } from '@kbn/inference-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import {
  createSemanticCodeSearchTools,
  SCS_FIND_INTRODUCING_COMMIT_TOOL_ID,
  SCS_LIST_INDICES_TOOL_ID,
  SCS_LIST_REPOS_TOOL_ID,
  SCS_READ_FILE_TOOL_ID,
  SCS_SEARCH_COMMIT_MESSAGES_TOOL_ID,
  SCS_SEMANTIC_SEARCH_TOOL_ID,
  SCS_SYMBOL_ANALYSIS_TOOL_ID,
  SCS_GET_COMMIT_TOOL_ID,
  SCS_FILE_HISTORY_TOOL_ID,
  SCS_COCHANGES_TOOL_ID,
  SCS_FILE_AUTHORS_TOOL_ID,
} from './semantic_code_search_tools';

const makeToolCall = (name: string, args: Record<string, unknown>): ToolCall => ({
  toolCallId: 'tc-1',
  function: { name, arguments: args },
});

const ALL_TOOL_NAMES = [
  'analyze_symbol',
  'code_search',
  'git_cochanges',
  'git_file_authors',
  'git_file_history',
  'git_find_introducing_commit',
  'git_search_commits',
  'git_show_commit',
  'list_code_indices',
  'list_code_repos',
  'read_code_file',
  'select_code_index',
];

// Zod input schemas mirroring the SCS workflow tool inputs the bridge reads
// from the Agent Builder registry (`index` / `repository` are required there
// and hidden/injected by the factory).
const SCHEMA_MAP: Record<string, z.ZodType> = {
  [SCS_LIST_REPOS_TOOL_ID]: z.object({}),
  [SCS_LIST_INDICES_TOOL_ID]: z.object({}),
  [SCS_SEMANTIC_SEARCH_TOOL_ID]: z.object({
    query: z.string().optional(),
    kql: z.string().optional(),
    size: z.number().optional(),
    index: z.string(),
  }),
  [SCS_READ_FILE_TOOL_ID]: z.object({ file_paths: z.string(), index: z.string() }),
  [SCS_SYMBOL_ANALYSIS_TOOL_ID]: z.object({ symbol_name: z.string(), index: z.string() }),
  [SCS_SEARCH_COMMIT_MESSAGES_TOOL_ID]: z.object({
    query: z.string(),
    file_paths: z.string().optional(),
    time_range_start: z.string().optional(),
    time_range_end: z.string().optional(),
    repository: z.string(),
  }),
  [SCS_FIND_INTRODUCING_COMMIT_TOOL_ID]: z.object({
    symbol_pattern: z.string(),
    file_path: z.string().optional(),
    repository: z.string(),
  }),
  [SCS_FILE_HISTORY_TOOL_ID]: z.object({
    file_path: z.string(),
    after: z.string().optional(),
    before: z.string().optional(),
    repository: z.string(),
  }),
  [SCS_GET_COMMIT_TOOL_ID]: z.object({
    commit_hash: z.string(),
    include_diffs: z.boolean().optional(),
    repository: z.string(),
  }),
  [SCS_COCHANGES_TOOL_ID]: z.object({
    file_path: z.string(),
    since: z.string().optional(),
    repository: z.string(),
  }),
  [SCS_FILE_AUTHORS_TOOL_ID]: z.object({
    file_paths: z.string(),
    since: z.string().optional(),
    repository: z.string(),
  }),
};

describe('createSemanticCodeSearchTools', () => {
  let logger: jest.Mocked<Logger>;
  let execute: jest.Mock;
  let registryGet: jest.Mock;
  let agentBuilderTools: ToolsStart;
  let esClient: jest.Mocked<ElasticsearchClient>;
  const request = {} as KibanaRequest;
  const codeIndex = 'code-acme_checkout';
  const repository = 'acme/checkout';

  const mockRepositoryResponse = (repo: string | undefined) => {
    (esClient.search as jest.Mock).mockResolvedValue({
      hits: { hits: repo ? [{ _source: { repository: repo } }] : [] },
    });
  };

  const build = () =>
    createSemanticCodeSearchTools({ agentBuilderTools, request, esClient, logger });

  // Builds the tools and activates an index via select_code_index (the only way
  // an index becomes active now that there is no pre-linking).
  const buildWithSelectedIndex = async (index: string = codeIndex) => {
    const tools = (await build())!;
    await tools.callbacks.select_code_index(makeToolCall('select_code_index', { index }));
    return tools;
  };

  beforeEach(() => {
    logger = loggerMock.create();
    execute = jest.fn();
    registryGet = jest.fn(async (toolId: string) => {
      const schema = SCHEMA_MAP[toolId];
      if (!schema) {
        throw new Error(`tool ${toolId} not found`);
      }
      return {
        id: toolId,
        description: `description for ${toolId}`,
        getSchema: async () => schema,
      };
    });
    agentBuilderTools = {
      execute,
      getRegistry: jest.fn(async () => ({ get: registryGet })),
    } as unknown as ToolsStart;
    esClient = { search: jest.fn() } as unknown as jest.Mocked<ElasticsearchClient>;
    mockRepositoryResponse(repository);
  });

  it('bridges the discovery, code, and git-history tools', async () => {
    const result = await build();
    expect(result).toBeDefined();
    expect(Object.keys(result!.tools).sort()).toEqual(ALL_TOOL_NAMES);
    expect(Object.keys(result!.callbacks).sort()).toEqual(ALL_TOOL_NAMES);
  });

  it('hides the injected index/repository params from the LLM-facing schema', async () => {
    const { tools } = (await build())!;
    expect(Object.keys(tools.code_search.schema?.properties ?? {})).not.toContain('index');
    expect(Object.keys(tools.git_search_commits.schema?.properties ?? {})).not.toContain(
      'repository'
    );
    // Non-hidden params survive.
    expect(Object.keys(tools.code_search.schema?.properties ?? {})).toEqual(
      expect.arrayContaining(['query', 'kql', 'size'])
    );
  });

  it('returns undefined when no SCS tools can be resolved', async () => {
    registryGet.mockRejectedValue(new Error('not installed'));
    const result = await build();
    expect(result).toBeUndefined();
  });

  it('returns undefined (without throwing) when the tool registry is unavailable', async () => {
    (agentBuilderTools.getRegistry as jest.Mock).mockRejectedValue(new Error('registry down'));
    await expect(build()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('skips individual tools that cannot be resolved', async () => {
    registryGet.mockImplementation(async (toolId: string) => {
      if (
        toolId.startsWith('scs.get_') ||
        toolId.includes('commit') ||
        toolId.includes('cochanges')
      ) {
        throw new Error('git history not installed');
      }
      const schema = SCHEMA_MAP[toolId];
      return { id: toolId, description: toolId, getSchema: async () => schema };
    });
    const { tools } = (await build())!;
    expect(Object.keys(tools).sort()).toEqual([
      'analyze_symbol',
      'code_search',
      'list_code_indices',
      'list_code_repos',
      'read_code_file',
      'select_code_index',
    ]);
  });

  it('instructs the agent to discover and select an index in the prompt snippet', async () => {
    const { promptSnippet } = (await build())!;
    expect(promptSnippet).toContain('list_code_indices');
    expect(promptSnippet).toContain('select_code_index');
    expect(promptSnippet).toContain('never as a starting point');
  });

  it('list_code_indices executes the SCS list-indices tool with no params', async () => {
    execute.mockResolvedValue({ results: [] });
    const { callbacks } = (await build())!;

    await callbacks.list_code_indices(makeToolCall('list_code_indices', {}));

    expect(execute).toHaveBeenCalledWith({
      toolId: SCS_LIST_INDICES_TOOL_ID,
      toolParams: {},
      request,
    });
  });

  it('code_search returns an error when no index is selected', async () => {
    const { callbacks } = (await build())!;

    const result = await callbacks.code_search(makeToolCall('code_search', { query: 'x' }));

    expect(execute).not.toHaveBeenCalled();
    const response = result.response as { error?: string };
    expect(response.error).toContain('No code index is selected');
  });

  it('select_code_index activates an index and reports git history availability', async () => {
    const { callbacks } = (await build())!;

    const result = await callbacks.select_code_index(
      makeToolCall('select_code_index', { index: 'code-acme_payments' })
    );

    expect(esClient.search).toHaveBeenCalledTimes(1);
    expect(result.response).toEqual({
      selected_index: 'code-acme_payments',
      git_history_available: true,
      repository,
    });

    execute.mockResolvedValue({ results: [] });
    await callbacks.code_search(makeToolCall('code_search', { query: 'x' }));
    expect(execute).toHaveBeenCalledWith({
      toolId: SCS_SEMANTIC_SEARCH_TOOL_ID,
      toolParams: { query: 'x', index: 'code-acme_payments' },
      request,
    });
  });

  it('select_code_index returns an error when neither repository nor index is provided', async () => {
    const { callbacks } = (await build())!;
    const result = await callbacks.select_code_index(makeToolCall('select_code_index', {}));
    expect(esClient.search).not.toHaveBeenCalled();
    expect(result.response).toEqual({
      results: [],
      count: 0,
      error: 'Either "repository" or "index" is required.',
    });
  });

  it('select_code_index accepts a repository directly without resolving from an index', async () => {
    const { callbacks } = (await build())!;

    const result = await callbacks.select_code_index(
      makeToolCall('select_code_index', { repository })
    );

    // No index → no Elasticsearch lookup needed to resolve the repository.
    expect(esClient.search).not.toHaveBeenCalled();
    expect(result.response).toEqual({ git_history_available: true, repository });

    // git_* tools become usable with the directly-selected repository.
    execute.mockResolvedValue({ results: [] });
    await callbacks.git_search_commits(makeToolCall('git_search_commits', { query: 'x' }));
    expect(execute).toHaveBeenCalledWith({
      toolId: SCS_SEARCH_COMMIT_MESSAGES_TOOL_ID,
      toolParams: { query: 'x', repository },
      request,
    });
  });

  it('list_code_repos executes the SCS list-repos tool with no params', async () => {
    execute.mockResolvedValue({ results: [] });
    const { callbacks } = (await build())!;

    await callbacks.list_code_repos(makeToolCall('list_code_repos', {}));

    expect(execute).toHaveBeenCalledWith({
      toolId: SCS_LIST_REPOS_TOOL_ID,
      toolParams: {},
      request,
    });
  });

  it('code_search uses the selected index', async () => {
    execute.mockResolvedValue({
      results: [{ tool_result_id: 'r1', type: ToolResultType.other, data: { hit: 1 } }],
    });
    const { callbacks } = await buildWithSelectedIndex();

    const result = await callbacks.code_search(
      makeToolCall('code_search', { query: 'connection refused', size: 10 })
    );

    expect(execute).toHaveBeenCalledWith({
      toolId: SCS_SEMANTIC_SEARCH_TOOL_ID,
      toolParams: { query: 'connection refused', size: 10, index: codeIndex },
      request,
    });
    expect(result.response).toEqual({
      results: [{ type: ToolResultType.other, data: { hit: 1 } }],
      count: 1,
    });
  });

  it('read_code_file executes the SCS read-file tool with file_paths and the active index', async () => {
    execute.mockResolvedValue({ results: [] });
    const { callbacks } = await buildWithSelectedIndex();

    await callbacks.read_code_file(makeToolCall('read_code_file', { file_paths: 'a.go,b.go' }));

    expect(execute).toHaveBeenCalledWith({
      toolId: SCS_READ_FILE_TOOL_ID,
      toolParams: { file_paths: 'a.go,b.go', index: codeIndex },
      request,
    });
  });

  it('analyze_symbol executes the SCS symbol analysis tool with symbol_name and the active index', async () => {
    execute.mockResolvedValue({ results: [] });
    const { callbacks } = await buildWithSelectedIndex();

    await callbacks.analyze_symbol(
      makeToolCall('analyze_symbol', { symbol_name: 'ConnectionRefusedError' })
    );

    expect(execute).toHaveBeenCalledWith({
      toolId: SCS_SYMBOL_ANALYSIS_TOOL_ID,
      toolParams: { symbol_name: 'ConnectionRefusedError', index: codeIndex },
      request,
    });
  });

  it('returns a required-argument error (derived from the registry schema) when symbol_name is missing', async () => {
    const { callbacks } = await buildWithSelectedIndex();
    const result = await callbacks.analyze_symbol(makeToolCall('analyze_symbol', {}));
    expect(execute).not.toHaveBeenCalled();
    expect(result.response).toEqual({
      results: [],
      count: 0,
      error: '"symbol_name" is required.',
    });
  });

  it('returns a required-argument error when file_paths is missing', async () => {
    const { callbacks } = await buildWithSelectedIndex();
    const result = await callbacks.read_code_file(makeToolCall('read_code_file', {}));
    expect(execute).not.toHaveBeenCalled();
    expect(result.response).toEqual({
      results: [],
      count: 0,
      error: '"file_paths" is required.',
    });
  });

  it('surfaces tool execution errors as a response instead of throwing', async () => {
    execute.mockRejectedValue(new Error('workflow not found'));
    const { callbacks } = await buildWithSelectedIndex();

    const result = await callbacks.code_search(makeToolCall('code_search', { query: 'x' }));

    expect(result.response).toEqual({ results: [], count: 0, error: 'workflow not found' });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('maps error-type tool results into the error field', async () => {
    execute.mockResolvedValue({
      results: [
        { tool_result_id: 'e1', type: ToolResultType.error, data: { message: 'index missing' } },
        { tool_result_id: 'r1', type: ToolResultType.other, data: { ok: true } },
      ],
    });
    const { callbacks } = await buildWithSelectedIndex();

    const result = await callbacks.code_search(makeToolCall('code_search', { query: 'x' }));

    expect(result.response).toEqual({
      results: [{ type: ToolResultType.other, data: { ok: true } }],
      count: 1,
      error: 'index missing',
    });
  });

  describe('git-history tools', () => {
    it('inject the repository resolved for the active index', async () => {
      execute.mockResolvedValue({ results: [] });
      const { callbacks } = await buildWithSelectedIndex();

      await callbacks.git_search_commits(
        makeToolCall('git_search_commits', {
          query: 'add retry on connection refused',
          file_paths: 'src/a.ts,src/b.ts',
        })
      );

      // The repository was resolved once, when the index was selected.
      expect(esClient.search).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith({
        toolId: SCS_SEARCH_COMMIT_MESSAGES_TOOL_ID,
        toolParams: {
          query: 'add retry on connection refused',
          file_paths: 'src/a.ts,src/b.ts',
          repository,
        },
        request,
      });
    });

    it('reuse the resolved repository across calls without re-querying', async () => {
      execute.mockResolvedValue({ results: [] });
      const { callbacks } = await buildWithSelectedIndex();

      await callbacks.git_find_introducing_commit(
        makeToolCall('git_find_introducing_commit', { symbol_pattern: 'connection refused' })
      );
      await callbacks.git_find_introducing_commit(
        makeToolCall('git_find_introducing_commit', { symbol_pattern: 'timeout' })
      );

      // Only the select_code_index call queried Elasticsearch for the repository.
      expect(esClient.search).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenLastCalledWith({
        toolId: SCS_FIND_INTRODUCING_COMMIT_TOOL_ID,
        toolParams: { symbol_pattern: 'timeout', repository },
        request,
      });
    });

    it('return an error when no index is selected', async () => {
      const { callbacks } = (await build())!;
      const result = await callbacks.git_search_commits(
        makeToolCall('git_search_commits', { query: 'x' })
      );
      expect(esClient.search).not.toHaveBeenCalled();
      const response = result.response as { error?: string };
      expect(response.error).toContain('No code index is selected');
    });

    it('return an error when the active index has no git history', async () => {
      mockRepositoryResponse(undefined);
      const { callbacks } = await buildWithSelectedIndex();

      const result = await callbacks.git_search_commits(
        makeToolCall('git_search_commits', { query: 'x' })
      );

      expect(execute).not.toHaveBeenCalled();
      const response = result.response as { error?: string };
      expect(response.error).toContain('No git history is available');
    });

    it('return a required-argument error when a required argument is missing', async () => {
      const { callbacks } = await buildWithSelectedIndex();
      const result = await callbacks.git_search_commits(makeToolCall('git_search_commits', {}));
      expect(execute).not.toHaveBeenCalled();
      expect(result.response).toEqual({ results: [], count: 0, error: '"query" is required.' });
    });
  });
});
