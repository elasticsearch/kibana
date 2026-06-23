/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  INPUT_MIME_TYPE,
  INPUT_VALUE,
  LLM_INPUT_MESSAGES,
  LLM_INVOCATION_PARAMETERS,
  LLM_MODEL_NAME,
  LLM_OUTPUT_MESSAGES,
  LLM_PROVIDER,
  LLM_SYSTEM,
  LLM_TOKEN_COUNT_COMPLETION,
  LLM_TOKEN_COUNT_PROMPT,
  LLM_TOKEN_COUNT_TOTAL,
  LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ,
  MESSAGE_CONTENT,
  MESSAGE_ROLE,
  MESSAGE_TOOL_CALLS,
  MESSAGE_TOOL_CALL_ID,
  MimeType,
  OUTPUT_VALUE,
  SemanticConventions,
  TOOL_CALL_FUNCTION_ARGUMENTS_JSON,
  TOOL_CALL_FUNCTION_NAME,
  TOOL_CALL_ID,
  PROMPT_ID,
  PROMPT_TEMPLATE_VARIABLES,
  PROMPT_TEMPLATE_TEMPLATE,
  LLM_TOOLS,
} from '@arizeai/openinference-semantic-conventions';
import type { tracing } from '@elastic/opentelemetry-node/sdk';
import { omit, partition } from 'lodash';
import type { ToolDefinition } from '@kbn/inference-common';
import type { ChoiceEvent, MessageEvent } from '../types';
import { GenAISemanticConventions } from '../types';
import { flattenAttributes } from '../util/flatten_attributes';
import { unflattenAttributes } from '../util/unflatten_attributes';

export function getChatSpan(span: tracing.ReadableSpan) {
  const [inputEvents, outputEvents] = partition(
    span.events.filter((event) => event.name !== 'exception'),
    (event) => event.name !== GenAISemanticConventions.GenAIChoice
  );

  span.attributes[LLM_MODEL_NAME] = span.attributes[GenAISemanticConventions.GenAIResponseModel];

  span.attributes[INPUT_MIME_TYPE] = MimeType.JSON;
  span.attributes[LLM_INVOCATION_PARAMETERS] = JSON.stringify({
    system: inputEvents.find((event) => event.name === GenAISemanticConventions.GenAISystemMessage)
      ?.attributes?.content,
  });
  span.attributes[LLM_SYSTEM] = span.attributes[GenAISemanticConventions.GenAIProviderName];

  span.attributes[LLM_PROVIDER] = span.attributes[GenAISemanticConventions.GenAIProviderName];

  span.attributes[LLM_TOKEN_COUNT_COMPLETION] =
    span.attributes[GenAISemanticConventions.GenAIUsageOutputTokens];

  span.attributes[LLM_TOKEN_COUNT_PROMPT] =
    span.attributes[GenAISemanticConventions.GenAIUsageInputTokens];

  span.attributes[LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ] =
    span.attributes[GenAISemanticConventions.GenAIUsageCacheReadInputTokens];

  span.attributes[LLM_TOKEN_COUNT_TOTAL] =
    Number(span.attributes[LLM_TOKEN_COUNT_COMPLETION] ?? 0) +
    Number(span.attributes[LLM_TOKEN_COUNT_PROMPT] ?? 0);

  span.attributes[PROMPT_ID] = span.attributes['gen_ai.prompt.id'];
  span.attributes[PROMPT_TEMPLATE_TEMPLATE] = span.attributes['gen_ai.prompt.template.template'];

  // double stringify for Phoenix
  span.attributes[PROMPT_TEMPLATE_VARIABLES] = span.attributes['gen_ai.prompt.template.variables']
    ? JSON.stringify(span.attributes['gen_ai.prompt.template.variables'])
    : undefined;

  span.attributes[INPUT_VALUE] = JSON.stringify(
    inputEvents.map((event) => {
      return unflattenAttributes(event.attributes ?? {});
    })
  );

  const parsedTools = span.attributes[GenAISemanticConventions.GenAIToolDefinitions]
    ? (JSON.parse(String(span.attributes[GenAISemanticConventions.GenAIToolDefinitions])) as Record<
        string,
        ToolDefinition
      >)
    : {};

  span.attributes[LLM_TOOLS] = JSON.stringify(
    Object.entries(parsedTools).map(([name, definition]) => {
      return {
        'tool.name': name,
        'tool.description': definition.description,
        'tool.json_schema': definition.schema,
      };
    })
  );

  span.attributes[OUTPUT_VALUE] = JSON.stringify(
    outputEvents.map((event) => {
      const { message, ...rest } = unflattenAttributes(event.attributes ?? {});
      return {
        ...omit(rest, 'finish_reason', 'index'),
        ...message,
      };
    })[0]
  );

  if (outputEvents.length) {
    const outputUnflattened = unflattenAttributes(
      outputEvents[0].attributes ?? {}
    ) as ChoiceEvent['body'];

    Object.assign(
      span.attributes,
      flattenAttributes({
        [`${LLM_OUTPUT_MESSAGES}.0`]: {
          [MESSAGE_ROLE]: 'assistant',
          [MESSAGE_CONTENT]: outputUnflattened.message.content,
          [MESSAGE_TOOL_CALLS]: outputUnflattened.message.tool_calls?.map((toolCall) => {
            return {
              [TOOL_CALL_ID]: toolCall.id,
              [TOOL_CALL_FUNCTION_NAME]: toolCall.function.name,
              [TOOL_CALL_FUNCTION_ARGUMENTS_JSON]: toolCall.function.arguments,
            };
          }),
        },
      })
    );
  }

  const messageEvents = inputEvents.filter(
    (event) =>
      event.name === GenAISemanticConventions.GenAIAssistantMessage ||
      event.name === GenAISemanticConventions.GenAIUserMessage ||
      event.name === GenAISemanticConventions.GenAIToolMessage ||
      event.name === GenAISemanticConventions.GenAISystemMessage
  );

  const llmInputMessages: Array<Record<string, any>> = messageEvents.map((message) => {
    const unflattened = unflattenAttributes(message.attributes ?? {}) as Record<string, any> &
      Exclude<MessageEvent, ChoiceEvent>['body'];

    const role = unflattened.role;
    const content = unflattened.content;

    unflattened[SemanticConventions.MESSAGE_ROLE] = role;
    unflattened[SemanticConventions.MESSAGE_CONTENT] = content ?? '';

    unflattened[MESSAGE_TOOL_CALLS] =
      role === 'assistant' && 'tool_calls' in unflattened
        ? unflattened.tool_calls?.map((toolCall) => {
            return {
              [SemanticConventions.TOOL_CALL_ID]: toolCall.id,
              [SemanticConventions.TOOL_CALL_FUNCTION_NAME]: toolCall.function.name,
              [SemanticConventions.TOOL_CALL_FUNCTION_ARGUMENTS_JSON]: toolCall.function.arguments,
            };
          })
        : [];

    if (unflattened.role === 'tool') {
      unflattened[MESSAGE_TOOL_CALL_ID] = unflattened.id;
    }

    return omit(unflattened, 'role', 'content');
  });

  const flattenedInputMessages = flattenAttributes(
    Object.fromEntries(
      llmInputMessages.map((message, index) => {
        return [`${LLM_INPUT_MESSAGES}.${index}`, message];
      })
    )
  );

  Object.assign(span.attributes, flattenedInputMessages);

  return span;
}
