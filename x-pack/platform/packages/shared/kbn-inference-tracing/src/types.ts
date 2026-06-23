/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Context, Span } from '@opentelemetry/api';

export enum GenAISemanticConventions {
  GenAIUsageCost = 'gen_ai.usage.cost',
  GenAIUsageInputTokens = 'gen_ai.usage.input_tokens',
  GenAIUsageCacheReadInputTokens = 'gen_ai.usage.cache_read.input_tokens',
  GenAIUsageOutputTokens = 'gen_ai.usage.output_tokens',
  GenAIOperationName = 'gen_ai.operation.name',
  GenAIResponseModel = 'gen_ai.response.model',
  GenAIRequestModel = 'gen_ai.request.model',
  /** @deprecated Use GenAIProviderName instead */
  GenAISystem = 'gen_ai.system',
  GenAIProviderName = 'gen_ai.provider.name',
  GenAIOutputType = 'gen_ai.output.type',
  GenAIToolCallId = 'gen_ai.tool.call.id',
  GenAIToolCallArguments = 'gen_ai.tool.call.arguments',
  GenAIToolCallResult = 'gen_ai.tool.call.result',
  GenAIToolName = 'gen_ai.tool.name',
  GenAIToolDescription = 'gen_ai.tool.description',
  GenAIToolType = 'gen_ai.tool.type',
  GenAIToolDefinitions = 'gen_ai.tool.definitions',
  GenAISystemMessage = 'gen_ai.system.message',
  GenAIUserMessage = 'gen_ai.user.message',
  GenAIAssistantMessage = 'gen_ai.assistant.message',
  GenAIToolMessage = 'gen_ai.tool.message',
  GenAIChoice = 'gen_ai.choice',
  GenAIAgentId = 'gen_ai.agent.id',
  GenAIAgentName = 'gen_ai.agent.name',
  GenAIConversationId = 'gen_ai.conversation.id',
  GenAIWorkflowName = 'gen_ai.workflow.name',
}

export enum ElasticGenAIAttributes {
  InferenceSpanKind = 'elastic.inference.span.kind',
  ToolChoice = 'elastic.llm.toolChoice',
}

export interface GenAISemConvAttributes {
  [GenAISemanticConventions.GenAIUsageCost]?: number;
  [GenAISemanticConventions.GenAIUsageInputTokens]?: number;
  [GenAISemanticConventions.GenAIUsageCacheReadInputTokens]?: number;
  [GenAISemanticConventions.GenAIUsageOutputTokens]?: number;
  [GenAISemanticConventions.GenAIOperationName]?:
    | 'chat'
    | 'execute_tool'
    | 'invoke_agent'
    | 'invoke_workflow';
  [GenAISemanticConventions.GenAIRequestModel]?: string;
  [GenAISemanticConventions.GenAIResponseModel]?: string;
  [GenAISemanticConventions.GenAIProviderName]?: string;
  'error.type'?: string;
  [GenAISemanticConventions.GenAIOutputType]?: 'text' | 'image' | 'json';
  [GenAISemanticConventions.GenAIToolCallId]?: string;
  [GenAISemanticConventions.GenAIToolCallArguments]?: string;
  [GenAISemanticConventions.GenAIToolCallResult]?: string;
  [GenAISemanticConventions.GenAIToolName]?: string;
  [GenAISemanticConventions.GenAIToolDescription]?: string;
  [GenAISemanticConventions.GenAIToolType]?: string;
  [GenAISemanticConventions.GenAIToolDefinitions]?: string;
  [GenAISemanticConventions.GenAIAgentId]?: string;
  [GenAISemanticConventions.GenAIAgentName]?: string;
  [GenAISemanticConventions.GenAIConversationId]?: string;
  [GenAISemanticConventions.GenAIWorkflowName]?: string;
  [ElasticGenAIAttributes.InferenceSpanKind]?: 'CHAIN' | 'AGENT' | 'LLM' | 'TOOL';
  [ElasticGenAIAttributes.ToolChoice]?: string;
}

interface GenAISemConvEvent<
  TName extends string,
  TBody extends {},
  TAttributeName extends keyof GenAISemConvAttributes
> {
  name: TName;
  body: TBody;
  attributes?: {
    [key in TAttributeName]: GenAISemConvAttributes[TAttributeName];
  };
}

export type SystemMessageEvent = GenAISemConvEvent<
  GenAISemanticConventions.GenAISystemMessage,
  {
    role: 'system';
    content: string;
  },
  GenAISemanticConventions.GenAIProviderName
>;

export type UserMessageEvent = GenAISemConvEvent<
  GenAISemanticConventions.GenAIUserMessage,
  {
    role: 'user';
    content: string;
  },
  GenAISemanticConventions.GenAIProviderName
>;

export type AssistantMessageEvent = GenAISemConvEvent<
  GenAISemanticConventions.GenAIAssistantMessage,
  {
    content?: unknown;
    role: 'assistant';
    tool_calls?: Array<{
      function: {
        arguments: string;
        name: string;
      };
      id: string;
      type: 'function';
    }>;
  },
  GenAISemanticConventions.GenAIProviderName
>;

export type ToolMessageEvent = GenAISemConvEvent<
  GenAISemanticConventions.GenAIToolMessage,
  {
    content?: string;
    id: string;
    role: 'tool' | 'function';
  },
  GenAISemanticConventions.GenAIProviderName
>;

export type ChoiceEvent = GenAISemConvEvent<
  GenAISemanticConventions.GenAIChoice,
  {
    index: number;
    finish_reason: 'stop' | 'tool_calls';
    message: {
      content?: string | null;
      role: 'assistant';
      tool_calls?: Array<{
        function: {
          name: string;
          arguments: string;
        };
        id: string;
        type: 'function';
      }>;
    };
  },
  GenAISemanticConventions.GenAIProviderName
>;

export type MessageEvent =
  | SystemMessageEvent
  | UserMessageEvent
  | AssistantMessageEvent
  | ToolMessageEvent
  | ChoiceEvent;

export interface InferenceSpanInit {
  span: Span;
  context: Context;
}
