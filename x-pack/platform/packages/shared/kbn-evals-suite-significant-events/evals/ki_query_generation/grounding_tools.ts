/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { ToolCallback, ToolDefinition } from '@kbn/inference-common';

/**
 * Semantic Code Search (SCS) grounding for the KI query generation eval.
 *
 * This mirrors the production factory in
 * `streams/server/lib/semantic_code_search_grounding/semantic_code_search_tools.ts`.
 * It is duplicated here (rather than imported) because that factory lives behind
 * the streams plugin's server boundary and depends on the in-process
 * `agentBuilder.tools` start contract, which is not available to the Scout
 * evaluation process. Here the SCS workflow tools are executed over HTTP via the
 * Agent Builder public tool-execution endpoint instead.
 */

export const SCS_SEMANTIC_SEARCH_TOOL_ID = 'scs.semantic_search';
export const SCS_READ_FILE_TOOL_ID = 'scs.read_file_from_chunks';
export const SCS_SYMBOL_ANALYSIS_TOOL_ID = 'scs.symbol_analysis';

export type GroundingMode = 'baseline' | 'grounded';

/** Result envelope returned by `POST /api/agent_builder/tools/_execute`. */
export interface AgentBuilderToolResult {
  type: string;
  data: unknown;
}
export type ExecuteAgentBuilderTool = (
  toolId: string,
  toolParams: Record<string, unknown>
) => Promise<{ results?: AgentBuilderToolResult[] }>;

export interface EvalSemanticCodeSearchTools {
  additionalTools: Record<string, ToolDefinition>;
  additionalToolCallbacks: Record<string, ToolCallback>;
  promptSnippet: string;
}

/** Resolves the grounding modes to run from `KI_QUERY_GENERATION_GROUNDING` (off|on|both). */
export const resolveGroundingModes = (): GroundingMode[] => {
  switch ((process.env.KI_QUERY_GENERATION_GROUNDING ?? 'off').toLowerCase()) {
    case 'on':
      return ['grounded'];
    case 'both':
      return ['baseline', 'grounded'];
    case 'off':
    default:
      return ['baseline'];
  }
};

/**
 * Resolves the SCS code index for a dataset. Reads a per-dataset JSON map from
 * `KI_QUERY_GENERATION_CODE_INDICES` (e.g. {"otel-demo":"code-open-telemetry_opentelemetry-demo"})
 * and falls back to a single `KI_QUERY_GENERATION_CODE_INDEX` for all datasets.
 */
export const resolveCodeIndexForDataset = (datasetId: string): string | undefined => {
  const mapRaw = process.env.KI_QUERY_GENERATION_CODE_INDICES;
  if (mapRaw) {
    try {
      const map = JSON.parse(mapRaw) as Record<string, string>;
      if (typeof map[datasetId] === 'string' && map[datasetId].length > 0) {
        return map[datasetId];
      }
    } catch {
      // ignore malformed map and fall through to single-index fallback
    }
  }
  const single = process.env.KI_QUERY_GENERATION_CODE_INDEX;
  return single && single.length > 0 ? single : undefined;
};

const formatToolResults = (results: AgentBuilderToolResult[] | undefined) => {
  const list = results ?? [];
  const errors = list
    .filter((result) => result.type === 'error')
    .map((result) => (result.data as { message?: string })?.message ?? 'Unknown tool error');
  const data = list.filter((result) => result.type !== 'error');
  return {
    results: data,
    count: data.length,
    ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
  };
};

/**
 * Builds the inference reasoning-agent tools that bridge to the installed SCS
 * Agent Builder workflow tools via `executeTool` (HTTP). Mirrors the production
 * tool names, IDs, schemas, and prompt snippet.
 */
export const createEvalSemanticCodeSearchTools = ({
  executeTool,
  codeIndex,
  logger,
}: {
  executeTool: ExecuteAgentBuilderTool;
  codeIndex: string;
  logger: Logger;
}): EvalSemanticCodeSearchTools => {
  const additionalTools: Record<string, ToolDefinition> = {
    code_search: {
      description:
        'Semantic search over the source code that produces this stream. Use it to find the exact log/error message strings, error types, and dependency calls emitted by the code before writing ES|QL.',
      schema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string' as const, description: 'Natural-language code search phrase.' },
          kql: { type: 'string' as const, description: 'Optional KQL filter on code metadata.' },
          size: { type: 'number' as const, description: 'Max snippets (default 25).' },
        },
      },
    },
    read_code_file: {
      description: 'Reconstruct full source files from the indexed code.',
      schema: {
        type: 'object' as const,
        properties: {
          file_paths: {
            type: 'string' as const,
            description: 'Comma-separated repository-relative file paths.',
          },
        },
        required: ['file_paths'] as const,
      },
    },
    analyze_symbol: {
      description:
        'Resolve a specific symbol found via code_search to its definitions/usages to confirm message wording or error types.',
      schema: {
        type: 'object' as const,
        properties: {
          symbol_name: { type: 'string' as const, description: 'Exact symbol name.' },
        },
        required: ['symbol_name'] as const,
      },
    },
  };

  const run = async (toolId: string, toolParams: Record<string, unknown>) => {
    try {
      const { results } = await executeTool(toolId, { ...toolParams, index: codeIndex });
      return { response: formatToolResults(results) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`SCS eval tool "${toolId}" failed: ${message}`);
      return { response: { results: [], count: 0, error: message } };
    }
  };

  const additionalToolCallbacks: Record<string, ToolCallback> = {
    code_search: async (toolCall) => {
      const { query, kql, size } = toolCall.function.arguments as {
        query?: string;
        kql?: string;
        size?: number;
      };
      return run(SCS_SEMANTIC_SEARCH_TOOL_ID, {
        ...(query !== undefined ? { query } : {}),
        ...(kql !== undefined ? { kql } : {}),
        ...(size !== undefined ? { size } : {}),
      });
    },
    read_code_file: async (toolCall) => {
      const { file_paths: filePaths } = toolCall.function.arguments as { file_paths?: string };
      if (!filePaths) {
        return { response: { results: [], count: 0, error: '"file_paths" is required.' } };
      }
      return run(SCS_READ_FILE_TOOL_ID, { file_paths: filePaths });
    },
    analyze_symbol: async (toolCall) => {
      const { symbol_name: symbolName } = toolCall.function.arguments as { symbol_name?: string };
      if (!symbolName) {
        return { response: { results: [], count: 0, error: '"symbol_name" is required.' } };
      }
      return run(SCS_SYMBOL_ANALYSIS_TOOL_ID, { symbol_name: symbolName });
    },
  };

  const promptSnippet = `
You can also consult the source code that produces this stream's logs, indexed in code index "${codeIndex}". Use it to *verify* hypotheses — never as a starting point:
- **code_search** — semantically search the code for the exact log/error strings it emits.
- **read_code_file** — read full files to inspect surrounding implementation.
- **analyze_symbol** — resolve a specific symbol found via code_search to confirm message wording / error types.

Analyze the stream features and dataset_analysis first. Use code only to refine query terms (e.g. confirm a logged message before choosing \`MATCH_PHRASE\` vs \`:\`). The code may be a different version than what is running, so it is a hint, not ground truth.`;

  return { additionalTools, additionalToolCallbacks, promptSnippet };
};
