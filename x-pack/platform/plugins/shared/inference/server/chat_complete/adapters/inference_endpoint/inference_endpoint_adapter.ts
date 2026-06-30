/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defer, switchMap, identity } from 'rxjs';
import type { Observable } from 'rxjs';
import type { Logger } from '@kbn/logging';
import type {
  FunctionCallingMode,
  Message,
  ToolOptions,
  ChatCompleteMetadata,
  ChatCompletionChunkEvent,
  ChatCompletionTokenCountEvent,
} from '@kbn/inference-common';
import { claudeModelSupportsTemperature } from '@kbn/connector-schemas/bedrock';
import { eventSourceStreamIntoObservable } from '../../../util/event_source_stream_into_observable';
import {
  processOpenAIStream,
  emitTokenCountEstimateIfMissing,
  messagesToOpenAI,
  toolsToOpenAI,
  toolChoiceToOpenAI,
} from '../openai';
import {
  parseInlineFunctionCalls,
  wrapWithSimulatedFunctionCalling,
} from '../../simulated_function_calling';
import type { InferenceEndpointExecutor } from '../../utils/inference_endpoint_executor';
import type { OpenAIRequest } from '../openai/types';

export interface InferenceEndpointAdapterChatCompleteOptions {
  executor: InferenceEndpointExecutor;
  messages: Message[];
  logger: Logger;
  system?: string;
  functionCalling?: FunctionCallingMode;
  temperature?: number;
  modelName?: string;
  abortSignal?: AbortSignal;
  metadata?: ChatCompleteMetadata;
  stream?: boolean;
  timeout?: number;
  tools?: ToolOptions['tools'];
  toolChoice?: ToolOptions['toolChoice'];
}

export const inferenceEndpointAdapter = {
  chatComplete: (
    options: InferenceEndpointAdapterChatCompleteOptions
  ): Observable<ChatCompletionChunkEvent | ChatCompletionTokenCountEvent> => {
    const {
      executor,
      system,
      messages,
      toolChoice,
      tools,
      functionCalling,
      temperature = 0,
      modelName,
      logger,
      abortSignal,
      timeout,
      metadata,
    } = options;

    const useSimulatedFunctionCalling = functionCalling === 'simulated';

    const request = createEndpointRequest({
      system,
      messages,
      toolChoice,
      tools,
      simulatedFunctionCalling: useSimulatedFunctionCalling,
      temperature,
      modelName,
    });

    return defer(() =>
      executor.invoke({
        body: request as unknown as Record<string, unknown>,
        signal: abortSignal,
        metadata,
        timeout,
      })
    ).pipe(
      switchMap((stream) => eventSourceStreamIntoObservable(stream)),
      processOpenAIStream(),
      emitTokenCountEstimateIfMissing({ request }),
      useSimulatedFunctionCalling ? parseInlineFunctionCalls({ logger }) : identity
    );
  },
};

const createEndpointRequest = ({
  system,
  messages,
  toolChoice,
  tools,
  simulatedFunctionCalling,
  temperature = 0,
  modelName,
}: {
  system?: string;
  messages: Message[];
  toolChoice?: ToolOptions['toolChoice'];
  tools?: ToolOptions['tools'];
  simulatedFunctionCalling: boolean;
  temperature?: number;
  modelName?: string;
}): OpenAIRequest => {
  const supportsTemperature = claudeModelSupportsTemperature(modelName);
  const temperatureSpread = supportsTemperature && temperature >= 0 ? { temperature } : {};

  if (simulatedFunctionCalling) {
    const wrapped = wrapWithSimulatedFunctionCalling({
      system,
      messages,
      toolChoice,
      tools,
    });
    return {
      ...temperatureSpread,
      model: modelName,
      messages: messagesToOpenAI({ system: wrapped.system, messages: wrapped.messages }),
    };
  }

  const openAiTools = toolsToOpenAI(tools);
  const hasTools = Array.isArray(openAiTools) && openAiTools.length > 0;

  return {
    ...temperatureSpread,
    model: modelName,
    messages: messagesToOpenAI({ system, messages }),
    ...(hasTools
      ? {
          tool_choice: toolChoiceToOpenAI(toolChoice),
          tools: openAiTools,
        }
      : {}),
  };
};
