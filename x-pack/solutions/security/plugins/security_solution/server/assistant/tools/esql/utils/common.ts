/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage } from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages/tool';
import type { AssistantToolParams } from '@kbn/elastic-assistant-plugin/server';
import { toolDetails } from '../tools/inspect_index_mapping_tool/inspect_index_mapping_tool';

export const getPromptSuffixForOssModel = (toolName: string) => `
  When using ${toolName} tool ALWAYS pass the user's questions directly as input into the tool.

  Always return value from ${toolName} tool as is.

  The ES|QL query should ALWAYS be wrapped in triple backticks ("\`\`\`esql"). Add a new line character right before the triple backticks.

  It is important that ES|QL query is preceeded by a new line.`;

export const messageContainsToolCalls = (message: BaseMessage): message is AIMessage => {
  return (
    'tool_calls' in message && Array.isArray(message.tool_calls) && message.tool_calls?.length > 0
  );
};

export type CreateLlmInstance = Exclude<AssistantToolParams['createLlmInstance'], undefined>;

export const requireFirstInspectIndexMappingCallWithEmptyKey = (
  newMessage: AIMessage,
  oldMessages: BaseMessage[]
): AIMessage => {
  const hasCalledInspectIndexMappingTool = oldMessages.find((message) => {
    return (
      messageContainsToolCalls(message) &&
      message.tool_calls?.some((toolCall) => {
        return toolCall.name === toolDetails.name;
      })
    );
  });

  if (hasCalledInspectIndexMappingTool) {
    return newMessage;
  }

  const newMessageToolCalls = newMessage.tool_calls || [];

  const containsFirstInspectIndexMappingCall = newMessageToolCalls.some((toolCall) => {
    return toolCall.name === toolDetails.name;
  });

  if (!containsFirstInspectIndexMappingCall) {
    return newMessage;
  }

  const modifiedToolCalls: ToolCall[] = [];
  let hasModifiedToolCall = false;

  for (const toolCall of newMessageToolCalls) {
    if (toolCall.name === toolDetails.name && !hasModifiedToolCall) {
      modifiedToolCalls.push({
        ...toolCall,
        args: {
          ...toolCall.args,
          property: '',
        },
      });
      hasModifiedToolCall = true;
    } else {
      modifiedToolCalls.push(toolCall);
    }
  }

  return new AIMessage({
    content: newMessage.content,
    tool_calls: modifiedToolCalls,
  });
};
