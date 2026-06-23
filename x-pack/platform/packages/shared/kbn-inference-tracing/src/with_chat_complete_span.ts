/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AssistantMessage,
  ChatCompleteCompositeResponse,
  Message,
  Model,
  ToolCall,
  ToolChoice,
  ToolDefinition,
  ToolMessage,
  UnvalidatedToolCall,
  UserMessage,
} from '@kbn/inference-common';
import {
  MessageRole,
  isChatCompletionMessageEvent,
  isChatCompletionTokenCountEvent,
} from '@kbn/inference-common';
import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { isObservable, tap } from 'rxjs';
import { isPromise } from 'util/types';
import { withActiveInferenceSpan } from './with_active_inference_span';
import type {
  AssistantMessageEvent,
  ChoiceEvent,
  GenAISemConvAttributes,
  MessageEvent,
  SystemMessageEvent,
  ToolMessageEvent,
  UserMessageEvent,
} from './types';
import { ElasticGenAIAttributes, GenAISemanticConventions } from './types';
import { flattenAttributes } from './util/flatten_attributes';

function addEvent(span: Span, event: MessageEvent) {
  if (!span.isRecording()) {
    return span;
  }
  const flattened = flattenAttributes(event.body);
  return span.addEvent(event.name, {
    ...flattened,
    ...event.attributes,
  });
}

export function setChoice(
  span: Span,
  {
    content,
    toolCalls,
  }: { content: string; toolCalls: Array<ToolCall> | Array<UnvalidatedToolCall> }
) {
  addEvent(span, {
    name: GenAISemanticConventions.GenAIChoice,
    body: {
      finish_reason: toolCalls.length ? 'tool_calls' : 'stop',
      index: 0,
      message: {
        ...mapAssistantResponse({ content, toolCalls }),
      },
    },
  } satisfies ChoiceEvent);
}

function setTokens(
  span: Span,
  { prompt, completion, cached }: { prompt: number; completion: number; cached?: number }
) {
  if (!span.isRecording()) {
    return;
  }
  span.setAttributes({
    [GenAISemanticConventions.GenAIUsageInputTokens]: prompt,
    [GenAISemanticConventions.GenAIUsageOutputTokens]: completion,
    [GenAISemanticConventions.GenAIUsageCacheReadInputTokens]: cached ?? 0,
  } satisfies GenAISemConvAttributes);
}

function setResponseModel(span: Span, { modelName }: { modelName?: string }) {
  if (!span.isRecording()) {
    return;
  }
  span.setAttributes({
    [GenAISemanticConventions.GenAIResponseModel]: modelName ?? 'unknown',
  } satisfies GenAISemConvAttributes);
}

interface InferenceGenerationOptions {
  model?: Model;
  system?: string;
  messages: Message[];
  tools?: Record<string, ToolDefinition>;
  toolChoice?: ToolChoice;
}

function getUserMessageEvent(message: UserMessage): UserMessageEvent {
  return {
    name: GenAISemanticConventions.GenAIUserMessage,
    body: {
      content:
        typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      role: 'user',
    },
  };
}

function getAssistantMessageEvent(message: AssistantMessage): AssistantMessageEvent {
  return {
    name: GenAISemanticConventions.GenAIAssistantMessage,
    body: mapAssistantResponse({
      content: message.content,
      toolCalls: message.toolCalls,
    }),
  };
}

function getToolMessageEvent(message: ToolMessage): ToolMessageEvent {
  return {
    name: GenAISemanticConventions.GenAIToolMessage,
    body: {
      role: 'tool',
      id: message.toolCallId,
      content:
        typeof message.response === 'string' ? message.response : JSON.stringify(message.response),
    },
  };
}

function mapAssistantResponse({
  content,
  toolCalls,
}: {
  content?: string | null;
  toolCalls?: Array<ToolCall> | Array<UnvalidatedToolCall>;
}) {
  return {
    content: content || null,
    role: 'assistant' as const,
    tool_calls: toolCalls?.map((toolCall) => {
      return {
        function: {
          name: toolCall.function.name,
          arguments:
            typeof toolCall.function.arguments === 'string'
              ? toolCall.function.arguments
              : JSON.stringify(toolCall.function.arguments),
        },
        id: toolCall.toolCallId,
        type: 'function' as const,
      };
    }),
  };
}

/**
 * Wrapper around {@link withActiveInferenceSpan} that sets the right attributes for a chat operation span.
 * @param options
 * @param cb
 */
export function withChatCompleteSpan<T extends ChatCompleteCompositeResponse>(
  options: InferenceGenerationOptions,
  cb: (span?: Span) => T
): T;

export function withChatCompleteSpan(
  options: InferenceGenerationOptions,
  cb: (span?: Span) => ChatCompleteCompositeResponse
): ChatCompleteCompositeResponse {
  const { system, messages, model, toolChoice, tools, ...attributes } = options;

  const modelProvider = model?.provider ?? 'unknown';
  const modelId = model?.id ?? model?.family ?? 'unknown';

  const next = withActiveInferenceSpan(
    `chat ${modelId}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        ...attributes,
        [GenAISemanticConventions.GenAIOperationName]: 'chat',
        [GenAISemanticConventions.GenAIRequestModel]: modelId,
        [GenAISemanticConventions.GenAIProviderName]: modelProvider,
        [ElasticGenAIAttributes.InferenceSpanKind]: 'LLM',
        [GenAISemanticConventions.GenAIToolDefinitions]: tools ? JSON.stringify(tools) : undefined,
        [ElasticGenAIAttributes.ToolChoice]: toolChoice ? JSON.stringify(toolChoice) : toolChoice,
      },
    },
    (span) => {
      if (!span) {
        return cb();
      }

      if (system) {
        addEvent(span, {
          name: GenAISemanticConventions.GenAISystemMessage,
          body: {
            content: system,
            role: 'system',
          },
        } satisfies SystemMessageEvent);
      }

      messages
        .map((message) => {
          switch (message.role) {
            case MessageRole.User:
              return getUserMessageEvent(message);

            case MessageRole.Assistant:
              return getAssistantMessageEvent(message);

            case MessageRole.Tool:
              return getToolMessageEvent(message);
          }
        })
        .forEach((event) => {
          addEvent(span, event);
        });

      const result = cb(span);

      if (isObservable(result)) {
        return result.pipe(
          tap({
            next: (value) => {
              if (isChatCompletionMessageEvent(value)) {
                setChoice(span, {
                  content: value.content,
                  toolCalls: value.toolCalls,
                });
              } else if (isChatCompletionTokenCountEvent(value)) {
                setTokens(span, value.tokens);
                setResponseModel(span, { modelName: value.model });
              }
            },
          })
        );
      }

      if (isPromise(result)) {
        return result.then((value) => {
          setChoice(span, {
            content: value.content,
            toolCalls: value.toolCalls,
          });
          if (value.tokens) {
            setTokens(span, value.tokens);
          }

          return value;
        });
      }

      return result;
    }
  );

  return next;
}
