/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { OperatorFunction } from 'rxjs';
import { Observable } from 'rxjs';
import type {
  ChatCompletionChunkEvent,
  ChatCompletionTokenCountEvent,
} from '@kbn/inference-common';
import {
  ChatCompletionEventType,
  isChatCompletionTokenCountEvent,
  isChatCompletionChunkEvent,
} from '@kbn/inference-common';
import type { OpenAIRequest } from './types';
import { manuallyCountPromptTokens, manuallyCountCompletionTokens } from './manually_count_tokens';

/**
 * Operator mirroring the source and then emitting a tokenCount event when the source completes,
 * if and only if the source did not emit a tokenCount event itself.
 *
 * This is used to manually count tokens and emit the associated event for
 * providers that don't support sending token counts for the stream API.
 *
 * @param request the OpenAI request that was sent to the connector.
 */
export function emitTokenCountEstimateIfMissing({
  request,
}: {
  request: OpenAIRequest;
}): OperatorFunction<
  ChatCompletionChunkEvent | ChatCompletionTokenCountEvent,
  ChatCompletionChunkEvent | ChatCompletionTokenCountEvent
> {
  return (source$) => {
    let tokenCountEmitted = false;
    const chunks: ChatCompletionChunkEvent[] = [];

    return new Observable<ChatCompletionChunkEvent | ChatCompletionTokenCountEvent>(
      (subscriber) => {
        return source$.subscribe({
          next: (value) => {
            if (isChatCompletionTokenCountEvent(value)) {
              tokenCountEmitted = true;
            } else if (isChatCompletionChunkEvent(value)) {
              chunks.push(value);
            }
            subscriber.next(value);
          },
          error: (err) => {
            subscriber.error(err);
          },
          complete: () => {
            if (!tokenCountEmitted) {
              subscriber.next(manuallyCountTokens(request, chunks));
            }
            subscriber.complete();
          },
        });
      }
    );
  };
}

export function manuallyCountTokens(
  request: OpenAIRequest,
  chunks: ChatCompletionChunkEvent[]
): ChatCompletionTokenCountEvent {
  const promptTokens = manuallyCountPromptTokens(request);
  const completionTokens = manuallyCountCompletionTokens(chunks);

  return {
    type: ChatCompletionEventType.ChatCompletionTokenCount,
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
    },
    ...(request.model ? { model: request.model } : {}),
  };
}
