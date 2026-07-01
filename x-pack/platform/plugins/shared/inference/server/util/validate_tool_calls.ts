/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { fromJSONSchema } from '@kbn/zod/v4/from_json_schema';
import type { ToolCall, ToolOptions, UnvalidatedToolCall } from '@kbn/inference-common';
import { ToolChoiceType } from '@kbn/inference-common';
import type { ToolCallOfToolOptions } from '@kbn/inference-common';
import {
  createToolNotFoundError,
  createToolValidationError,
} from '../../common/chat_complete/errors';

export function validateToolCalls<TToolOptions extends ToolOptions>({
  toolCalls,
  toolChoice,
  tools,
}: TToolOptions & { toolCalls: UnvalidatedToolCall[] }): ToolCallOfToolOptions<TToolOptions>[];

export function validateToolCalls({
  toolCalls,
  toolChoice,
  tools,
}: ToolOptions & { toolCalls: UnvalidatedToolCall[] }): ToolCall[] {
  if (toolCalls.length && toolChoice === ToolChoiceType.none) {
    throw createToolValidationError(
      `tool_choice was "none" but ${toolCalls
        .map((toolCall) => toolCall.function.name)
        .join(', ')} was/were called`,
      { toolCalls }
    );
  }

  // toolChoice === `object` is a proxy check for `CustomToolChoice`
  // since only `CustomToolChoice` is an object.
  const forcedToolName =
    toolChoice && typeof toolChoice === 'object' ? toolChoice.function : undefined;

  return toolCalls.map((toolCall) => {
    const name = toolCall.function.name || forcedToolName;
    const tool = name ? tools?.[name] : undefined;

    if (!name || !tool) {
      throw createToolNotFoundError({
        name: name ?? '',
        args: toolCall.function.arguments,
      });
    }

    const toolSchema = tool.schema ?? { type: 'object', properties: {} };

    let serializedArguments: Record<string, unknown>;

    try {
      serializedArguments = JSON.parse(toolCall.function.arguments);
    } catch (error) {
      throw createToolValidationError(`Failed parsing arguments for ${name}`, {
        name,
        arguments: toolCall.function.arguments,
        toolCalls: [toolCall],
      });
    }

    try {
      // ToolSchema is compatible with JsonSchema but TypeScript can't infer
      // the recursive type compatibility, so we assert it as Record<string, unknown>
      const zodSchema = fromJSONSchema(toolSchema as unknown as Record<string, unknown>);
      if (zodSchema) {
        zodSchema.parse(serializedArguments);
      }
    } catch (error) {
      const errorMessage =
        error instanceof z.ZodError
          ? error?.issues?.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
          : error instanceof Error
          ? error.message
          : 'Unknown validation error';

      throw createToolValidationError(
        `Tool call arguments for ${name} (${toolCall.toolCallId}) were invalid`,
        {
          name,
          errorsText: errorMessage,
          arguments: toolCall.function.arguments,
          toolCalls,
        }
      );
    }

    return {
      toolCallId: toolCall.toolCallId,
      function: {
        name,
        arguments: serializedArguments,
      },
    };
  });
}
