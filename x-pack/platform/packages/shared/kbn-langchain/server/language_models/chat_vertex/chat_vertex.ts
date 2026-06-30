/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EnhancedGenerateContentResponse } from '@google/generative-ai';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { BaseMessage, UsageMetadata } from '@langchain/core/messages';
import type { ChatGenerationChunk } from '@langchain/core/outputs';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { get } from 'lodash/fp';
import type { Readable } from 'stream';

import type { Logger } from '@kbn/logging';
import type { BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { GeminiPartText, GeminiRequest } from '@langchain/google-common/types';
import type { TelemetryMetadata } from '@kbn/actions-plugin/server/lib';
import {
  convertResponseBadFinishReasonToErrorMsg,
  convertResponseContentToChatGenerationChunk,
} from '../../utils/gemini';
import { ActionsClientChatConnection } from './connection';

const DEFAULT_GEMINI_TEMPERATURE = 0;
export interface CustomChatModelInput extends BaseChatModelParams {
  actionsClient: PublicMethodsOf<ActionsClient>;
  connectorId: string;
  logger: Logger;
  streaming: boolean;
  temperature?: number;
  signal?: AbortSignal;
  model?: string;
  maxTokens?: number;
  telemetryMetadata?: TelemetryMetadata;
  convertSystemMessageToHumanContent?: boolean;
}

export class ActionsClientChatVertexAI extends ChatVertexAI {
  #actionsClient: PublicMethodsOf<ActionsClient>;
  #connectorId: string;
  #model?: string;
  telemetryMetadata?: TelemetryMetadata;
  constructor({ actionsClient, connectorId, ...props }: CustomChatModelInput) {
    super({
      ...props,
      maxOutputTokens: props.maxTokens ?? 2048,
      temperature: props.temperature ?? DEFAULT_GEMINI_TEMPERATURE,
    });
    // LangChain needs model to be defined for logging purposes
    this.model = props.model ?? this.model;
    // If model is not specified by consumer, the connector will define it so do not pass
    // a LangChain default to the actionsClient
    this.#model = props.model;
    this.#actionsClient = actionsClient;
    this.#connectorId = connectorId;
    // apiKey is required to build the client but is overridden by the actionsClient
    const client = this.buildClient({ apiKey: 'nothing', ...props });

    this.connection = new ActionsClientChatConnection(
      {
        ...this,
      },
      this.caller,
      client,
      false,
      actionsClient,
      connectorId,
      props?.telemetryMetadata
    );
  }

  buildConnection() {
    // prevent ChatVertexAI from overwriting our this.connection defined in super
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const parameters = this.invocationParams(options);
    const data = (await this.connection.formatData(messages, parameters)) as GeminiRequest;
    const stream = await this.caller.callWithOptions({ signal: options?.signal }, async () => {
      const systemPart: GeminiPartText | undefined = data?.systemInstruction
        ?.parts?.[0] as unknown as GeminiPartText;
      const systemInstruction = systemPart?.text.length
        ? { systemInstruction: systemPart?.text }
        : {};
      const requestBody = {
        actionId: this.#connectorId,
        params: {
          subAction: 'invokeStream',
          subActionParams: {
            model: this.#model,
            telemetryMetadata: this.telemetryMetadata,
            messages: data?.contents,
            tools: data?.tools,
            temperature: this.temperature,
            ...systemInstruction,
            signal: options?.signal,
          },
        },
      };

      const actionResult = await this.#actionsClient.execute(requestBody);
      if (actionResult.status === 'error') {
        const error = new Error(
          `ActionsClientChatVertexAI: action result status is error: ${actionResult?.message} - ${actionResult?.serviceMessage}`
        );
        if (actionResult?.serviceMessage) {
          error.name = actionResult?.serviceMessage;
        }
        throw error;
      }

      const readable = get('data', actionResult) as Readable;

      if (typeof readable?.read !== 'function') {
        throw new Error('Action result status is error: result is not streamable');
      }
      return readable;
    });
    let usageMetadata: UsageMetadata | undefined;
    let index = 0;
    let partialStreamChunk = '';
    for await (const rawStreamChunk of stream) {
      const streamChunk = rawStreamChunk.toString();
      const nextChunk = `${partialStreamChunk + streamChunk}`;

      let parsedStreamChunk: EnhancedGenerateContentResponse | null = null;
      try {
        parsedStreamChunk = JSON.parse(nextChunk.replaceAll('data: ', '').replaceAll('\r\n', ''));
        partialStreamChunk = '';
      } catch (_) {
        partialStreamChunk += nextChunk;
      }

      if (parsedStreamChunk !== null) {
        const errorMessage = convertResponseBadFinishReasonToErrorMsg(parsedStreamChunk);
        if (errorMessage != null) {
          throw new Error(errorMessage);
        }

        const response = {
          ...parsedStreamChunk,
          functionCalls: () =>
            parsedStreamChunk?.candidates?.[0]?.content.parts[0].functionCall
              ? [parsedStreamChunk.candidates?.[0]?.content.parts[0].functionCall]
              : [],
        };

        if (
          'usageMetadata' in response &&
          this.streamUsage !== false &&
          options.streamUsage !== false
        ) {
          const genAIUsageMetadata = response.usageMetadata as {
            promptTokenCount: number;
            candidatesTokenCount: number;
            totalTokenCount: number;
          };
          if (!usageMetadata) {
            usageMetadata = {
              input_tokens: genAIUsageMetadata.promptTokenCount,
              output_tokens: genAIUsageMetadata.candidatesTokenCount,
              total_tokens: genAIUsageMetadata.totalTokenCount,
            };
          } else {
            // Under the hood, LangChain combines the prompt tokens. Google returns the updated
            // total each time, so we need to find the difference between the tokens.
            const outputTokenDiff =
              genAIUsageMetadata.candidatesTokenCount - usageMetadata.output_tokens;
            usageMetadata = {
              input_tokens: 0,
              output_tokens: outputTokenDiff,
              total_tokens: outputTokenDiff,
            };
          }
        }

        const chunk = convertResponseContentToChatGenerationChunk(response, {
          usageMetadata,
          index,
        });
        index += 1;

        if (chunk) {
          yield chunk;
          await runManager?.handleLLMNewToken(chunk.text ?? '');
        }
      }
    }
  }
}
