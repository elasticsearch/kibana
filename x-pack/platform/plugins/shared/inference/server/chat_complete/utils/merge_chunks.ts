/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChatCompletionChunkEvent, UnvalidatedToolCall } from '@kbn/inference-common';

interface UnvalidatedMessage {
  content: string;
  refusal?: string;
  tool_calls: UnvalidatedToolCall[];
}

/**
 * Merges tool calls from chunks into a single array of tool calls.
 *
 * Merge logic:
 * - `toolCallId` and `function.name` appear in the first chunk and should be set once
 * - `function.arguments` is streamed across multiple chunks and should be accumulated
 * - When `toolCallId` is empty, it's a continuation chunk for the most recent tool call at that index
 */
const mergeToolCalls = (chunks: ChatCompletionChunkEvent[]): UnvalidatedToolCall[] => {
  // Map to store tool calls by their unique identifier
  const toolCallsMap = new Map<string, UnvalidatedToolCall>();
  // Map to track which index corresponds to which toolCallId
  const indexToToolCallId = new Map<number, string>();

  for (const chunk of chunks) {
    chunk.tool_calls?.forEach((toolCall) => {
      // Track toolCallId for continuation chunks
      if (toolCall.toolCallId) {
        indexToToolCallId.set(toolCall.index, toolCall.toolCallId);
      }

      let key = toolCall.toolCallId || indexToToolCallId.get(toolCall.index);
      if (!key) {
        // Some providers omit toolCallId in the first chunk for single tool calls.
        // Generate a synthetic key based on the index to avoid dropping the tool call.
        key = `_generated_${toolCall.index}`;
        indexToToolCallId.set(toolCall.index, key);
      }

      const existingToolCall = toolCallsMap.get(key);
      const updatedToolCall: UnvalidatedToolCall = {
        function: {
          name: toolCall.function.name || existingToolCall?.function.name || '',
          arguments: (existingToolCall?.function.arguments || '') + toolCall.function.arguments,
        },
        toolCallId: toolCall.toolCallId || existingToolCall?.toolCallId || key,
      };

      toolCallsMap.set(key, updatedToolCall);
    });
  }

  return Array.from(toolCallsMap.values()).map((call) => {
    if (call.function.arguments === '') {
      return {
        ...call,
        function: {
          ...call.function,
          arguments: '{}',
        },
      };
    }
    return call;
  });
};

/**
 * Merges chunks into a message, concatenating the content and tool calls.
 */
export const mergeChunks = (chunks: ChatCompletionChunkEvent[]): UnvalidatedMessage => {
  const message = chunks.reduce<UnvalidatedMessage>(
    (prev, chunk) => {
      prev.content += chunk.content ?? '';
      if (chunk.refusal) {
        prev.refusal = chunk.refusal;
      }

      return prev;
    },
    { content: '', tool_calls: [] }
  );

  message.tool_calls = mergeToolCalls(chunks);

  return message;
};
