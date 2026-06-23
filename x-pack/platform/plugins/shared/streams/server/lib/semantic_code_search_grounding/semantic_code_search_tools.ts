/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, KibanaRequest, Logger } from '@kbn/core/server';
import type { ToolCallback, ToolDefinition } from '@kbn/inference-common';
import type { ToolsStart } from '@kbn/agent-builder-server';
import { resolveRepositoryForCodeIndex, resolveIndexForRepository } from './resolve_code_index';
import {
  createInferenceToolsFromAgentBuilder,
  type BridgePrepareOutcome,
  type BridgedToolSpec,
} from '../agent_builder/inference_tool_bridge';

/**
 * Agent Builder tool IDs installed by Semantic Code Search (SCS) via
 * `scs install-agentic-interfaces`. SCS registers each workflow-backed tool
 * under the `scs.<workflow_name>` id. We delegate to these tools (their
 * parameter schemas are read from the Agent Builder registry at runtime via the
 * bridge) rather than re-declaring them here.
 */
export const SCS_SEMANTIC_SEARCH_TOOL_ID = 'scs.semantic_search';
export const SCS_READ_FILE_TOOL_ID = 'scs.read_file_from_chunks';
export const SCS_SYMBOL_ANALYSIS_TOOL_ID = 'scs.symbol_analysis';
// `scs.list_repos` is the repository-addressed discovery tool (https://github.com/elastic/semantic-code-search/issues/103);
// `scs.list_indices` is the legacy index-addressed tool kept as a fallback for
// SCS builds that predate the repository surface. Whichever is installed is
// exposed; the other is skipped by the bridge.
export const SCS_LIST_REPOS_TOOL_ID = 'scs.list_repos';
export const SCS_LIST_INDICES_TOOL_ID = 'scs.list_indices';
export const SCS_FILE_HISTORY_TOOL_ID = 'scs.get_file_history';
export const SCS_GET_COMMIT_TOOL_ID = 'scs.get_commit';
export const SCS_FIND_INTRODUCING_COMMIT_TOOL_ID = 'scs.find_introducing_commit';
export const SCS_SEARCH_COMMIT_MESSAGES_TOOL_ID = 'scs.search_commit_messages';
export const SCS_COCHANGES_TOOL_ID = 'scs.get_cochanges';
export const SCS_FILE_AUTHORS_TOOL_ID = 'scs.get_file_authors';

export interface SemanticCodeSearchTools {
  tools: Record<string, ToolDefinition>;
  callbacks: Record<string, ToolCallback>;
  promptSnippet: string;
}

const NO_ACTIVE_INDEX_ERROR =
  'No code index is selected. Call list_code_repos (or list_code_indices) to see what is available, then select_code_index with the repository (or index) that produces this stream before using this tool.';

/**
 * Semantic Code Search (SCS) tools for significant events query generation
 * (executeAsReasoningAgent). The code/git tools are bridged from the installed
 * Agent Builder SCS workflow tools — their schemas come from the Agent Builder
 * registry, and the callbacks delegate to `agentBuilderTools.execute`. This
 * factory only owns the Streams-specific concerns the registry can't know
 * about: which index is active, hiding/injecting the `index` / `repository`
 * params, the index-selection tools, and the prompt guidance.
 *
 * The reasoning agent selects which code index to ground against at runtime:
 * `list_code_indices` enumerates the available `code-*` indices and
 * `select_code_index` activates one (resolving its git repository so the
 * git-history tools can be used).
 *
 * Returns `undefined` when none of the SCS workflow tools can be resolved (e.g.
 * SCS is not installed), so grounding degrades gracefully.
 *
 * Read-only: these tools only query indexed source code; they never modify it.
 */
export const createSemanticCodeSearchTools = async ({
  agentBuilderTools,
  request,
  esClient,
  logger,
}: {
  agentBuilderTools: ToolsStart;
  request: KibanaRequest;
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<SemanticCodeSearchTools | undefined> => {
  // Active index/repository are mutable across the reasoning agent's
  // sequential tool calls. They start unset and are populated when the agent
  // calls select_code_index.
  let activeIndex: string | undefined;
  let activeRepository: string | undefined;

  const repositoryCache = new Map<string, string | undefined>();
  const resolveRepository = async (index: string): Promise<string | undefined> => {
    if (repositoryCache.has(index)) {
      return repositoryCache.get(index);
    }
    const repository = await resolveRepositoryForCodeIndex({ esClient, codeIndex: index, logger });
    repositoryCache.set(index, repository);
    return repository;
  };

  const indexCache = new Map<string, string | undefined>();
  const resolveIndex = async (repo: string): Promise<string | undefined> => {
    if (indexCache.has(repo)) {
      return indexCache.get(repo);
    }
    const index = await resolveIndexForRepository({ esClient, repository: repo, logger });
    indexCache.set(repo, index);
    return index;
  };

  // Code tools require an active selection. We offer both `index` and
  // `repository`; the bridge forwards only the one the installed SCS tool
  // actually declares (repository surface vs legacy index surface).
  // When selected by repository, lazily resolve the index so legacy
  // index-addressed SCS workflows also receive an `index` param.
  const requireActiveTarget = async (): Promise<BridgePrepareOutcome> => {
    if (!activeIndex && !activeRepository) {
      return { error: { results: [], count: 0, error: NO_ACTIVE_INDEX_ERROR } };
    }
    const index =
      activeIndex ?? (activeRepository ? await resolveIndex(activeRepository) : undefined);
    return { params: { index, repository: activeRepository } };
  };

  // Git-history tools require the active selection to resolve to a repository;
  // inject it as the `repository` param.
  const requireActiveRepository = async (): Promise<BridgePrepareOutcome> => {
    if (!activeIndex && !activeRepository) {
      return { error: { results: [], count: 0, error: NO_ACTIVE_INDEX_ERROR } };
    }
    const repository =
      activeRepository ?? (activeIndex ? await resolveRepository(activeIndex) : undefined);
    if (!repository) {
      return {
        error: {
          results: [],
          count: 0,
          error: `No git history is available for the current selection ("${
            activeIndex ?? activeRepository
          }").`,
        },
      };
    }
    return { params: { repository } };
  };

  const specs: BridgedToolSpec[] = [
    {
      sourceToolId: SCS_LIST_REPOS_TOOL_ID,
      name: 'list_code_repos',
      description:
        'List the Semantic Code Search repositories available in this cluster, with per-repo stats (files, symbols, languages, content types). Use it to discover which codebase to ground this stream against, then select it with select_code_index.',
    },
    {
      sourceToolId: SCS_LIST_INDICES_TOOL_ID,
      name: 'list_code_indices',
      description:
        'List the Semantic Code Search indices available in this cluster, with per-index stats (files, symbols, languages, content types). Use it (or list_code_repos) to discover which codebase to ground this stream against.',
    },
    {
      sourceToolId: SCS_SEMANTIC_SEARCH_TOOL_ID,
      name: 'code_search',
      description:
        'Semantic search over the source code of the selected repository/index. Use it to find the exact log/error message strings, error types, and dependency calls emitted by the code before writing ES|QL. Returns code snippets with file paths and line numbers.',
      hiddenParams: ['index', 'repository'],
      prepare: requireActiveTarget,
    },
    {
      sourceToolId: SCS_READ_FILE_TOOL_ID,
      name: 'read_code_file',
      description:
        'Reconstruct one or more full source files from the selected repository/index, to inspect the surrounding implementation of a snippet found via code_search.',
      hiddenParams: ['index', 'repository'],
      prepare: requireActiveTarget,
    },
    {
      sourceToolId: SCS_SYMBOL_ANALYSIS_TOOL_ID,
      name: 'analyze_symbol',
      description:
        'Resolve a specific code symbol (an exact name found via code_search, e.g. an error/exception class, a logger wrapper, or a constant holding a message template) to its definitions, usages, and documentation. Use it to confirm the precise wording or error types behind a log site — not for open-ended code exploration.',
      hiddenParams: ['index', 'repository'],
      prepare: requireActiveTarget,
    },
    {
      sourceToolId: SCS_SEARCH_COMMIT_MESSAGES_TOOL_ID,
      name: 'git_search_commits',
      description:
        "Semantic (natural-language) search over the selected repository's commit messages. Use it to find when/why a behavior or log message was introduced or changed. Returns matching commits with hashes, messages, and dates.",
      hiddenParams: ['repository'],
      prepare: requireActiveRepository,
    },
    {
      sourceToolId: SCS_FIND_INTRODUCING_COMMIT_TOOL_ID,
      name: 'git_find_introducing_commit',
      description:
        'Find the commit(s) that first introduced an exact code phrase or log/error string, by phrase-matching the commit diffs (oldest-first). Use it to confirm a log message exists in the code history and to date when it appeared.',
      hiddenParams: ['repository'],
      prepare: requireActiveRepository,
    },
    {
      sourceToolId: SCS_FILE_HISTORY_TOOL_ID,
      name: 'git_file_history',
      description:
        'Return the commit history of a specific file (newest-first), including hashes, change types, line stats, and commit subjects. Use it to understand how a log site has evolved.',
      hiddenParams: ['repository'],
      prepare: requireActiveRepository,
    },
    {
      sourceToolId: SCS_GET_COMMIT_TOOL_ID,
      name: 'git_show_commit',
      description:
        'Return full details for a specific commit (message, author, stats, and per-file changes/diffs). Use it to inspect a commit found via git_search_commits or git_find_introducing_commit.',
      hiddenParams: ['repository'],
      prepare: requireActiveRepository,
    },
    {
      sourceToolId: SCS_COCHANGES_TOOL_ID,
      name: 'git_cochanges',
      description:
        'Identify files that frequently change in the same commits as a target file (coupling analysis). Use it to discover related code that may emit correlated log events.',
      hiddenParams: ['repository'],
      prepare: requireActiveRepository,
    },
    {
      sourceToolId: SCS_FILE_AUTHORS_TOOL_ID,
      name: 'git_file_authors',
      description:
        'Return an author contribution leaderboard for one or more files (commit counts, line stats, last commit). Use it to identify owners/subject-matter experts of a log site.',
      hiddenParams: ['repository'],
      prepare: requireActiveRepository,
    },
  ];

  const { tools: bridgedTools, callbacks: bridgedCallbacks } =
    await createInferenceToolsFromAgentBuilder({
      tools: agentBuilderTools,
      request,
      specs,
      logger,
    });

  // If not even the SCS workflow tools resolve, grounding is unavailable.
  if (Object.keys(bridgedTools).length === 0) {
    return undefined;
  }

  // `select_code_index` is not an SCS tool — it manages the active index and
  // resolves its repository, so it stays hand-written.
  const selectCodeIndexTool: ToolDefinition = {
    description:
      'Select the codebase to ground subsequent code_search / read_code_file / analyze_symbol calls against. Pass `repository` (preferred, e.g. "acme/checkout" from list_code_repos) or `index` (e.g. "code-acme_checkout" from list_code_indices) — whichever produces this stream\'s logs, using the stream name, description, and dataset_analysis (service names, languages, dependency calls) to decide. Selecting by index resolves its git repository so the git_* history tools become usable. If nothing clearly matches the stream, do not select anything and proceed without code grounding.',
    schema: {
      type: 'object',
      properties: {
        repository: {
          type: 'string',
          description:
            'Repository identifier to activate, as returned by list_code_repos (e.g. "acme/checkout").',
        },
        index: {
          type: 'string',
          description:
            'Exact code index name to activate, as returned by list_code_indices (e.g. "code-acme_checkout").',
        },
      },
    },
  };

  const selectCodeIndexCallback: ToolCallback = async (toolCall) => {
    const { index, repository } = toolCall.function.arguments as {
      index?: string;
      repository?: string;
    };
    if (!index && !repository) {
      return {
        response: { results: [], count: 0, error: 'Either "repository" or "index" is required.' },
      };
    }

    activeIndex = index;
    // Prefer an explicitly provided repository; otherwise resolve it from the
    // index so the git_* history tools can be used.
    activeRepository = repository ?? (index ? await resolveRepository(index) : undefined);

    return {
      response: {
        ...(activeIndex ? { selected_index: activeIndex } : {}),
        git_history_available: Boolean(activeRepository),
        ...(activeRepository ? { repository: activeRepository } : {}),
      },
    };
  };

  const tools: Record<string, ToolDefinition> = {
    ...bridgedTools,
    select_code_index: selectCodeIndexTool,
  };
  const callbacks: Record<string, ToolCallback> = {
    ...bridgedCallbacks,
    select_code_index: selectCodeIndexCallback,
  };

  const promptSnippet = `
If a \`code_analysis\` feature is present, it is your primary source of code-grounded evidence — its strings are already verified to appear in both the code and the logs, so prefer it. Use the on-demand code tools below only for follow-up that \`code_analysis\` does not cover (a specific hypothesis, a symbol, or git history), and always to *verify* hypotheses — never as a starting point.

To use the on-demand tools, first call list_code_repos (or list_code_indices) to see what is available, then call select_code_index with the repository (or index) whose code produces this stream — use the stream name, description, and dataset_analysis (service names, languages, dependency calls) to choose. If nothing clearly matches, do not select anything and proceed without code grounding.

Once a codebase is selected:
- **code_search** — semantically search the code for the exact log/error strings, error types, and dependency calls it emits.
- **read_code_file** — read full files to inspect surrounding implementation.
- **analyze_symbol** — resolve a specific symbol you already found via code_search (e.g. an exception class or a logging helper) to confirm its message wording or the error types it covers. Do not use it to explore unfamiliar code.

If the selected index has git history, you can also consult it to corroborate and date behavior:
- **git_search_commits** — semantically search commit messages for when/why a behavior or log message changed.
- **git_find_introducing_commit** — find the commit that first introduced an exact log/error string or code phrase.
- **git_file_history** — list a file's commit history; **git_show_commit** — inspect a single commit's diffs.
- **git_cochanges** / **git_file_authors** — find coupled files and code owners.
Use history only to confirm a log/error string still exists (not removed later) and to date behavior — never as a substitute for dataset_analysis.

Analyze the stream features and dataset_analysis first; they reflect what is actually emitted. Use code only to refine query terms (e.g. confirm the precise wording of a logged message before choosing \`MATCH_PHRASE\` vs \`:\`) and to corroborate dependencies. The code may be a different version than what is running, so it is a hint, not ground truth — never let it override dataset_analysis. When a query is grounded in code, record it in that query's \`evidence\` as \`code: <file>:<line> <snippet>\`.`;

  return { tools, callbacks, promptSnippet };
};
