/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConversationRound, ToolCallWithResult, ToolResult } from '@kbn/agent-builder-common';
import { isToolCallStep } from '@kbn/agent-builder-common';
import { isExcludedFromFilestore } from '@kbn/agent-builder-common/tools';
import { FileEntryType } from '@kbn/agent-builder-server/runner/filestore';
import { sanitizeToolId } from '@kbn/agent-builder-genai-utils/langchain';
import { estimateTokens } from '@kbn/agent-builder-genai-utils/tools/utils/token_count';
import { MOUNT_POINTS } from '../../../../filesystem/mount_points';
import type {
  ToolCallFileEntry,
  ToolCallMetaContent,
  ToolCallMetaFileEntry,
  ToolCallResultManifestEntry,
} from './types';

const META_FILE_NAME = 'meta.json';

/**
 * Store-relative directory holding a single tool call's files, relative to the
 * `/tool_calls` mount: `/{sanitizeToolId(tool_id)}_{tool_call_id}`.
 * e.g. `platform.core.list_indices` + call `a1b2c3` → `/platform_core_list_indices_a1b2c3`.
 */
export const getToolCallDirPath = ({
  toolId,
  toolCallId,
}: {
  toolId: string;
  toolCallId: string;
}): string => {
  return `/${sanitizeToolId(toolId)}_${toolCallId}`;
};

/**
 * Result file name within a call directory. Mixed convention: a single result is
 * `result.json`; multiple results are `result_1.json … result_N.json` (1-based).
 */
const getResultFileName = (index: number, total: number): string => {
  return total === 1 ? 'result.json' : `result_${index + 1}.json`;
};

/**
 * Agent-visible (absolute, mount-prefixed) path for a mount-relative store entry path —
 * the form the LLM sees and that consumers like `tryFilestoreSubstitution` embed in
 * `fileReference` results.
 */
export const getToolCallEntryAbsolutePath = (relativePath: string): string => {
  return `${MOUNT_POINTS.toolCalls}${relativePath}`;
};

export interface BuiltResultEntry {
  entry: ToolCallFileEntry;
  result: ToolResult;
  relativePath: string;
}

export interface BuiltToolCallEntries {
  metaEntry: ToolCallMetaFileEntry;
  resultEntries: BuiltResultEntry[];
}

/**
 * Builds every VFS entry for a tool call.
 */
export const buildToolCallEntries = (toolCall: ToolCallWithResult): BuiltToolCallEntries => {
  const { tool_id: toolId, tool_call_id: toolCallId, params, results } = toolCall;
  const dir = getToolCallDirPath({ toolId, toolCallId });

  const resultEntries: BuiltResultEntry[] = results.map((result, index) => {
    const fileName = getResultFileName(index, results.length);
    const relativePath = `${dir}/${fileName}`;
    const stringifiedContent = JSON.stringify(result.data, undefined, 2);
    const entry: ToolCallFileEntry = {
      type: 'file',
      path: relativePath,
      content: {
        raw: result.data,
        plain_text: stringifiedContent,
      },
      metadata: {
        type: FileEntryType.toolResult,
        id: result.tool_result_id,
        token_count: estimateTokens(stringifiedContent),
        readonly: true,
      },
    };
    return { entry, result, relativePath };
  });

  const manifest: ToolCallResultManifestEntry[] = results.map((result, index) => ({
    file: getResultFileName(index, results.length),
    type: result.type,
    tool_result_id: result.tool_result_id,
  }));

  const metaContent: ToolCallMetaContent = {
    tool_call_id: toolCallId,
    tool_id: toolId,
    params,
    results: manifest,
  };
  const metaStringified = JSON.stringify(metaContent, undefined, 2);
  const metaEntry: ToolCallMetaFileEntry = {
    type: 'file',
    path: `${dir}/${META_FILE_NAME}`,
    content: {
      raw: metaContent,
      plain_text: metaStringified,
    },
    metadata: {
      type: FileEntryType.toolCallMeta,
      id: toolCallId,
      token_count: estimateTokens(metaStringified),
      readonly: true,
    },
  };

  return { metaEntry, resultEntries };
};

/**
 * Flattens a conversation's persisted rounds into per-call records to seed the store on run start.
 */
export const extractConversationToolResults = (
  conversation: ConversationRound[]
): ToolCallWithResult[] => {
  const toolCalls: ToolCallWithResult[] = [];
  for (const round of conversation) {
    const calls = round.steps
      .filter(isToolCallStep)
      .filter((step) => !isExcludedFromFilestore(step.tool_id));
    toolCalls.push(...calls);
  }
  return toolCalls;
};
