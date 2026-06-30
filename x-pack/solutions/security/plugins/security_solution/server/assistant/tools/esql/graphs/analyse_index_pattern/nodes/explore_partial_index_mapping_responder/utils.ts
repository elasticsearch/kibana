/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AIMessage, BaseMessage } from '@langchain/core/messages';
import { ToolMessage } from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages/tool';
import { set } from '@kbn/safer-lodash-set';
import { toolDetails } from '../../../../tools/inspect_index_mapping_tool/inspect_index_mapping_tool';
import { messageContainsToolCalls } from '../../../../utils/common';

export const buildContext = (messages: BaseMessage[]): Record<string, unknown> => {
  const orderedInspectIndexMappingToolCalls: ToolCall[] = messages
    .filter((message) => messageContainsToolCalls(message))
    .flatMap((message) => (message as AIMessage).tool_calls)
    .filter((toolCall) => toolCall !== undefined)
    .filter((toolCall) => (toolCall as ToolCall).name === toolDetails.name) as ToolCall[];

  const orderedInspectIndexMappingToolCallIds = orderedInspectIndexMappingToolCalls.map(
    (toolCall) => toolCall.id
  );

  const inspectIndexMappingToolCallByIds = orderedInspectIndexMappingToolCalls.reduce(
    (acc, toolCall) => {
      const toolCallId = toolCall.id;
      if (toolCallId !== undefined) {
        acc[toolCallId] = toolCall;
      }
      return acc;
    },
    {} as Record<string, ToolCall>
  );

  const orderedInspectIndexMappingToolMessages = messages
    .filter((message) => message instanceof ToolMessage)
    .filter((message) => (message as ToolMessage).tool_call_id in inspectIndexMappingToolCallByIds)
    .map((message) => message as ToolMessage)
    .sort(
      (a, b) =>
        orderedInspectIndexMappingToolCallIds.indexOf(a.tool_call_id) -
        orderedInspectIndexMappingToolCallIds.indexOf(b.tool_call_id)
    );

  let context = {};
  /* eslint-disable no-continue */

  for (const toolMessage of orderedInspectIndexMappingToolMessages) {
    const toolCall = inspectIndexMappingToolCallByIds[toolMessage.tool_call_id];
    if (toolCall.args.property !== undefined) {
      if (toolCall.args.property === '') {
        try {
          context = JSON.parse(toolMessage.content as string);
        } catch (e) {
          continue;
        }
      } else {
        try {
          const parsedContent = JSON.parse(toolMessage.content as string);
          set(context, toolCall.args.property, parsedContent);
        } catch (e) {
          continue;
        }
      }
    }
  }

  /* eslint-enable no-continue */

  return context;
};
