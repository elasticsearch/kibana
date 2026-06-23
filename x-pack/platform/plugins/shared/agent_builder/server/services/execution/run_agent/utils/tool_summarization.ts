/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolCallWithResult, ToolResult } from '@kbn/agent-builder-common';
import type { ToolRegistry } from '@kbn/agent-builder-server';
import type { ToolManager } from '@kbn/agent-builder-server/runner';

const SUMMARY_MARKER = '_summary';

export const isSummaryResult = (data: unknown): boolean => {
  return (
    typeof data === 'object' &&
    data !== null &&
    SUMMARY_MARKER in data &&
    (data as Record<string, unknown>)[SUMMARY_MARKER] === true
  );
};

export const areAllResultsCleaned = (results: ToolResult[]): boolean => {
  return results.every((result) => {
    if ('data' in result) {
      return isSummaryResult(result.data);
    }
    return false;
  });
};

export const markResultAsCleaned = (result: ToolResult): ToolResult => {
  if ('data' in result && typeof result.data === 'object' && result.data !== null) {
    const data = result.data as Record<string, unknown>;
    if (!isSummaryResult(data)) {
      return {
        ...result,
        data: {
          ...data,
          [SUMMARY_MARKER]: true,
        },
      } as ToolResult;
    }
  }
  return result;
};

export interface ToolCallResultTransformerOptions {
  forceFilestoreSubstitution?: boolean;
}

export type ToolCallResultTransformer = (
  toolCall: ToolCallWithResult,
  options?: ToolCallResultTransformerOptions
) => Promise<ToolResult[]>;

export interface ToolSummarizationDeps {
  toolManager: ToolManager;
  toolRegistry: ToolRegistry;
}

export const tryToolSummarization = async (
  toolCall: ToolCallWithResult,
  toolManager: ToolManager,
  toolRegistry: ToolRegistry
): Promise<ToolResult[] | undefined> => {
  const managerSummarizer = toolManager.getSummarizer(toolCall.tool_id);
  if (managerSummarizer) {
    const summarizedResults = managerSummarizer(toolCall);
    return summarizedResults ?? undefined;
  }

  try {
    const tool = await toolRegistry.get(toolCall.tool_id);
    if (!tool?.summarizeToolReturn) {
      return undefined;
    }

    const summarizedResults = tool.summarizeToolReturn(toolCall);
    return summarizedResults ?? undefined;
  } catch {
    return undefined;
  }
};

export const createSummarizationTransformer = ({
  toolManager,
  toolRegistry,
}: ToolSummarizationDeps): ToolCallResultTransformer => {
  return async (toolCall) => {
    if (toolCall.results.length === 0 || areAllResultsCleaned(toolCall.results)) {
      return toolCall.results;
    }
    const summarized = await tryToolSummarization(toolCall, toolManager, toolRegistry);
    return summarized ? summarized.map(markResultAsCleaned) : toolCall.results;
  };
};
