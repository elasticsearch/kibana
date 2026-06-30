/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolResult } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common';
import type { ToolResultStore } from '@kbn/agent-builder-server/runner';
import type { ToolRegistry } from '@kbn/agent-builder-server';
import type { ToolManager } from '@kbn/agent-builder-server/runner/tool_manager';
import { getToolCallEntryAbsolutePath } from '../../runner/store/volumes/tool_results/utils';
import type { ToolCallResultTransformer } from './tool_summarization';
import {
  areAllResultsCleaned,
  isSummaryResult,
  markResultAsCleaned,
  tryToolSummarization,
} from './tool_summarization';

/**
 * Conversation token threshold for file reference substitution.
 * Filestore substitution will only be enabled if the token count from previous rounds exceeds this threshold.
 */
export const FS_CONTEXT_TOKEN_THRESHOLD = 50_000;

/**
 * Per tool-result token threshold for file reference substitution.
 * Only tool results exceeding this threshold will be substituted with file references.
 */
export const FS_TOOL_CALL_TOKEN_THRESHOLD = 1_000;

export interface CreateResultTransformerOptions {
  /**
   * Tool registry to look up tool-specific summarization functions.
   * Used as a fallback when the tool is not found in the tool manager
   * (e.g. for evicted dynamic tools from previous rounds).
   */
  toolRegistry: ToolRegistry;
  /**
   * Tool manager to look up tool-specific summarization functions.
   * Checked first, as it contains all active tools including internal ones
   * (filestore tools, attachment tools) that may not be in the registry.
   */
  toolManager: ToolManager;
  /**
   * Tool-result store used to look up per-result entry metadata when deciding whether
   * to substitute an oversize result with a file reference.
   */
  resultStore: ToolResultStore;
  /**
   * Unified, summarization-aware conversation token estimate. Gates filestore
   * substitution and is computed once per turn so it matches the compaction trigger.
   */
  conversationTokenEstimate: number;
  /**
   * Token count threshold above which results are substituted with file references.
   * Defaults to FS_TOOL_CALL_TOKEN_THRESHOLD.
   */
  toolCallTokenThreshold?: number;
  /**
   * Conversation token threshold above which filestore substitution is enabled.
   * Defaults to FS_CONTEXT_TOKEN_THRESHOLD.
   */
  conversationTokenThreshold?: number;
}

/**
 * Creates a unified result transformer that:
 * 1. Applies tool-specific summarization (via `summarizeToolReturn`) if defined
 * 2. For results not summarized, applies file reference substitution if enabled and above threshold
 *
 * Step 2 is gated on the conversation token estimate, but callers (e.g. intra-round
 * compaction) can force it on per call via `forceFilestoreSubstitution`.
 */
export const createResultTransformer = ({
  toolRegistry,
  toolManager,
  resultStore,
  conversationTokenEstimate,
  toolCallTokenThreshold = FS_TOOL_CALL_TOKEN_THRESHOLD,
  conversationTokenThreshold = FS_CONTEXT_TOKEN_THRESHOLD,
}: CreateResultTransformerOptions): ToolCallResultTransformer => {
  const filestoreSubstitutionEnabled = conversationTokenEstimate > conversationTokenThreshold;

  return async (toolCall, options) => {
    // Skip if no results or all already cleaned
    if (toolCall.results.length === 0 || areAllResultsCleaned(toolCall.results)) {
      return toolCall.results;
    }

    // Step 1: Try tool-specific summarization
    const summarized = await tryToolSummarization(toolCall, toolManager, toolRegistry);
    if (summarized) {
      return summarized.map(markResultAsCleaned);
    }

    // Step 2: Apply file reference substitution when the conversation is large enough,
    // or when the caller forces it (intra-round compaction, where pressure comes from
    // the in-flight round rather than conversation history).
    const useFilestore =
      filestoreSubstitutionEnabled || options?.forceFilestoreSubstitution === true;
    if (useFilestore) {
      return Promise.all(
        toolCall.results.map((result) =>
          tryFilestoreSubstitution({
            result,
            resultStore,
            threshold: toolCallTokenThreshold,
          })
        )
      );
    }

    // No transformation applied
    return toolCall.results;
  };
};

/**
 * Attempts to substitute a tool result with a file reference if it exceeds the token threshold.
 * Returns the file reference result if substituted, or the original result.
 */
const tryFilestoreSubstitution = async ({
  result,
  resultStore,
  threshold,
}: {
  result: ToolResult;
  resultStore: ToolResultStore;
  threshold: number;
}): Promise<ToolResult> => {
  // Skip if already cleaned
  if ('data' in result && isSummaryResult(result.data)) {
    return result;
  }

  try {
    const entry = await resultStore.getEntryByResultId(result.tool_result_id);

    // If entry exists and exceeds threshold, substitute with file reference
    if (entry && entry.metadata.token_count > threshold) {
      return markResultAsCleaned({
        tool_result_id: result.tool_result_id,
        type: ToolResultType.fileReference,
        data: {
          filepath: getToolCallEntryAbsolutePath(entry.path),
          comment:
            'The result has been stored in the virtual file system. You can access it using the read_file tool with the specified filepath.',
        },
      });
    }
  } catch {
    // Error reading from filestore - keep original
  }

  return result;
};
