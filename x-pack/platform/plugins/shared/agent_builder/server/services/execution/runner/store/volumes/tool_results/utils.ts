/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationRound, ToolCallWithResult } from '@kbn/agent-builder-common';
import { isToolCallStep } from '@kbn/agent-builder-common';
import { isExcludedFromFilestore } from '@kbn/agent-builder-common/tools';
import type { ToolResultWithMeta } from '@kbn/agent-builder-server/runner';
import { FileEntryType } from '@kbn/agent-builder-server/runner/filestore';
import { sanitizeToolId } from '@kbn/agent-builder-genai-utils/langchain';
import { estimateTokens } from '@kbn/agent-builder-genai-utils/tools/utils/token_count';
import { MOUNT_POINTS } from '../../../../filesystem/mount_points';
import type { ToolCallFileEntry } from './types';

/**
 * Returns the store-relative entry path for a tool-call result. The path is
 * relative to the `/tool_calls` mount: e.g. `/{tool_id}/{call_id}/{result_id}.json`.
 * Use {@link getToolCallEntryAbsolutePath} for the agent-visible (mounted) form.
 */
export const getToolCallEntryPath = ({
  toolId,
  toolCallId,
  toolResultId,
}: {
  toolId: string;
  toolCallId: string;
  toolResultId: string;
}): string => {
  return `/${sanitizeToolId(toolId)}/${toolCallId}/${toolResultId}.json`;
};

/**
 * Agent-visible (absolute, mount-prefixed) path for a tool-call result —
 * the form the LLM sees and that consumers like `tryFilestoreSubstitution`
 * embed in `fileReference` results.
 */
export const getToolCallEntryAbsolutePath = (
  args: Parameters<typeof getToolCallEntryPath>[0]
): string => {
  return `${MOUNT_POINTS.toolCalls}${getToolCallEntryPath(args)}`;
};

export const createToolCallEntry = (result: ToolResultWithMeta): ToolCallFileEntry => {
  const stringifiedContent = JSON.stringify(result.result.data, undefined, 2);
  return {
    type: 'file',
    path: getToolCallEntryPath({
      toolId: result.tool_id,
      toolCallId: result.tool_call_id,
      toolResultId: result.result.tool_result_id,
    }),
    content: {
      raw: result.result.data,
      plain_text: stringifiedContent,
    },
    metadata: {
      // generic meta
      type: FileEntryType.toolResult,
      id: result.result.tool_result_id,
      token_count: estimateTokens(stringifiedContent),
      readonly: true,
      // specific tool-result meta
      tool_result_type: result.result.type,
      tool_call_id: result.tool_call_id,
      tool_id: result.tool_id,
    },
  };
};

const toolCallToResults = (toolCall: ToolCallWithResult): ToolResultWithMeta[] => {
  return toolCall.results.map((result) => ({
    result,
    tool_call_id: toolCall.tool_call_id,
    tool_id: toolCall.tool_id,
  }));
};

export const extractConversationToolResults = (
  conversation: ConversationRound[]
): ToolResultWithMeta[] => {
  const results: ToolResultWithMeta[] = [];
  for (const round of conversation) {
    const toolCalls = round.steps
      .filter(isToolCallStep)
      .filter((step) => !isExcludedFromFilestore(step.tool_id))
      .flatMap(toolCallToResults);
    results.push(...toolCalls);
  }
  return results;
};
