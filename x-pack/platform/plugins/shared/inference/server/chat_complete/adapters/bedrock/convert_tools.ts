/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Message, ToolSchemaType } from '@kbn/inference-common';
import { MessageRole, ToolChoiceType, type ToolOptions } from '@kbn/inference-common';
import type { ToolChoice as ConverseBedRockToolChoice } from '@aws-sdk/client-bedrock-runtime';

export const toolChoiceToConverse = (
  toolChoice: ToolOptions['toolChoice']
): ConverseBedRockToolChoice | undefined => {
  if (toolChoice === ToolChoiceType.required) {
    return { any: {} };
  } else if (toolChoice === ToolChoiceType.auto) {
    return { auto: {} };
  } else if (typeof toolChoice === 'object') {
    return { tool: { name: toolChoice.function } };
  }
  // ToolChoiceType.none is not supported by claude
  // we are adding a directive to the system instructions instead in that case.
  return undefined;
};

export const toolsToConverseBedrock = (tools: ToolOptions['tools'], messages: Message[]) => {
  if (tools) {
    return Object.entries(tools).map(([toolName, toolDef]) => {
      return {
        toolSpec: {
          name: toolName,
          description: toolDef.description,
          inputSchema: {
            json: fixSchemaArrayProperties(
              toolDef.schema ?? {
                type: 'object' as const,
                properties: {},
              }
            ),
          },
        },
      };
    });
  }

  const hasToolUse = messages.filter(
    (message) =>
      message.role === MessageRole.Tool ||
      (message.role === MessageRole.Assistant && message.toolCalls?.length)
  );

  if (hasToolUse.length) {
    return [
      {
        toolSpec: {
          name: 'do_not_call_this_tool',
          description: 'Do not call this tool, it is strictly forbidden',
          inputSchema: {
            json: {
              type: 'object',
              properties: {},
            },
          },
        },
      },
    ];
  }
};

/**
 * Strips JSON Schema keywords that are not supported by the
 * Bedrock Converse API. According to AWS documentation:
 *  - `propertyNames` is not supported
 *  - `additionalProperties` is not supported for object types
 *  - `$schema` is not supported
 *
 * Also ensures object-typed schemas always have a `properties`
 * field, which the Converse API requires for object types.
 */
function stripUnsupportedSchemaKeywords<T extends ToolSchemaType>(schemaPart: T): T {
  const {
    propertyNames: _propertyNames,
    additionalProperties: _additionalProperties,
    $schema: _$schema,
    ...rest
  } = schemaPart as unknown as Record<string, unknown>;

  // Bedrock requires `properties` on object types
  if (rest.type === 'object' && !rest.properties) {
    rest.properties = {};
  }

  return rest as unknown as T;
}

/**
 * Claude is prone to ignoring the "array" part of an array type,
 * so this function patches it to add a message on each
 * array property to explicitly state that the value should
 * be returned as a json array.
 *
 * Also strips JSON Schema keywords unsupported by Bedrock
 * (e.g. `propertyNames`, `additionalProperties`).
 */
export function fixSchemaArrayProperties<T extends ToolSchemaType>(schemaPart: T): T {
  const cleaned = stripUnsupportedSchemaKeywords(schemaPart);

  if (cleaned.type === 'object' && cleaned.properties) {
    return {
      ...cleaned,
      properties: Object.fromEntries(
        Object.entries(cleaned.properties).map(([key, childSchemaPart]) => {
          return [key, fixSchemaArrayProperties(childSchemaPart)];
        })
      ),
    };
  }

  if (cleaned.type === 'array') {
    return {
      ...cleaned,
      // Claude is prone to ignoring the "array" part of an array type
      description: cleaned.description
        ? `${cleaned.description}. Must be provided as a JSON array`
        : 'Must be provided as a JSON array',
      items: cleaned.items ? fixSchemaArrayProperties(cleaned.items) : {},
    };
  }

  return cleaned;
}
