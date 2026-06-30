/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type OpenAI from 'openai';
import type { OperatorFunction } from 'rxjs';
import { defer, identity } from 'rxjs';
import type {
  ChatCompletionChunkEvent,
  ChatCompletionTokenCountEvent,
} from '@kbn/inference-common';
import { eventSourceStreamIntoObservable } from '../../../util/event_source_stream_into_observable';
import type { InferenceConnectorAdapter } from '../../types';
import {
  parseInlineFunctionCalls,
  wrapWithSimulatedFunctionCalling,
} from '../../simulated_function_calling';
import {
  isNativeFunctionCallingSupported,
  handleConnectorStreamResponse,
  handleConnectorDataResponse,
} from '../../utils';
import type { OpenAIRequest } from './types';
import { messagesToOpenAI, toolsToOpenAI, toolChoiceToOpenAI } from './to_openai';
import { processOpenAIStream } from './process_openai_stream';
import { processOpenAIResponse } from './process_openai_response';
import { emitTokenCountEstimateIfMissing } from './emit_token_count_if_missing';
import { getTemperatureIfValid } from '../../utils/get_temperature';

export const openAIAdapter: InferenceConnectorAdapter = {
  chatComplete: ({
    executor,
    system,
    messages,
    toolChoice,
    tools,
    temperature = 0,
    functionCalling = 'auto',
    modelName: modelName,
    logger,
    abortSignal,
    metadata,
    timeout,
    stream = false,
  }) => {
    const connector = executor.getConnector();

    const useSimulatedFunctionCalling =
      functionCalling === 'auto'
        ? !isNativeFunctionCallingSupported(connector)
        : functionCalling === 'simulated';

    let request: OpenAIRequest;

    if (useSimulatedFunctionCalling) {
      const wrapped = wrapWithSimulatedFunctionCalling({
        system,
        messages,
        toolChoice,
        tools,
      });
      request = {
        stream,
        ...getTemperatureIfValid(temperature, { connector, modelName }),
        model: modelName,
        messages: messagesToOpenAI({ system: wrapped.system, messages: wrapped.messages }),
      };
    } else {
      const openAiTools = toolsToOpenAI(tools);
      const hasTools = Array.isArray(openAiTools) && openAiTools.length > 0;

      request = {
        stream,
        ...getTemperatureIfValid(temperature, { connector, modelName }),
        model: modelName,
        messages: messagesToOpenAI({ system, messages }),
        // Some OpenAI-compatible gateways (notably for Anthropic models) reject tool calling
        // params when the tools list is empty. Only forward tools/tool_choice when tools exist.
        ...(hasTools
          ? {
              tool_choice: toolChoiceToOpenAI(toolChoice, { connector, tools }),
              tools: openAiTools,
            }
          : {}),
      };
    }

    const connectorResult$ = defer(() => {
      return executor.invoke({
        subAction: 'stream',
        subActionParams: {
          body: JSON.stringify(request),
          signal: abortSignal,
          stream,
          ...(metadata?.connectorTelemetry
            ? { telemetryMetadata: metadata.connectorTelemetry }
            : {}),
          ...(typeof timeout === 'number' && isFinite(timeout) ? { timeout } : {}),
        },
      });
    });

    type ChatEvent = ChatCompletionChunkEvent | ChatCompletionTokenCountEvent;
    const passThrough: OperatorFunction<ChatEvent, ChatEvent> = identity;

    if (stream) {
      return connectorResult$.pipe(
        handleConnectorStreamResponse({ processStream: eventSourceStreamIntoObservable }),
        processOpenAIStream(),
        emitTokenCountEstimateIfMissing({ request }),
        useSimulatedFunctionCalling ? parseInlineFunctionCalls({ logger }) : passThrough
      );
    } else {
      return connectorResult$.pipe(
        handleConnectorDataResponse({
          parseData: (data) => data as OpenAI.ChatCompletion,
        }),
        processOpenAIResponse(),
        emitTokenCountEstimateIfMissing({ request }),
        useSimulatedFunctionCalling ? parseInlineFunctionCalls({ logger }) : passThrough
      );
    }
  },
};
