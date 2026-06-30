/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type OpenAI from 'openai';
import type { Observable, OperatorFunction } from 'rxjs';
import { catchError, from, mergeMap } from 'rxjs';
import type {
  ChatCompletionChunkEvent,
  ChatCompletionTokenCountEvent,
} from '@kbn/inference-common';
import { createInferenceRequestAbortedError } from '@kbn/inference-common';
import { tokenCountFromOpenAI, chunkFromCompletionResponse } from './from_openai';

export function processOpenAIResponse(): OperatorFunction<
  OpenAI.ChatCompletion,
  ChatCompletionChunkEvent | ChatCompletionTokenCountEvent
> {
  return (source: Observable<OpenAI.ChatCompletion>) => {
    return source.pipe(
      mergeMap((response): Observable<ChatCompletionChunkEvent | ChatCompletionTokenCountEvent> => {
        const events: Array<ChatCompletionChunkEvent | ChatCompletionTokenCountEvent> = [];
        if (response.choices?.length) {
          events.push(chunkFromCompletionResponse(response));
        }
        if (response.usage) {
          events.push(tokenCountFromOpenAI(response.usage, response.model));
        }
        return from(events);
      }),
      catchError((error) => {
        if (error.code === 'ECONNRESET' && error.message === 'aborted') {
          throw createInferenceRequestAbortedError();
        }
        throw error;
      })
    );
  };
}
