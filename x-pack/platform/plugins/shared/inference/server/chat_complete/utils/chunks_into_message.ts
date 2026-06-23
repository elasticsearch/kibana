/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ChatCompletionChunkEvent,
  ChatCompletionMessageEvent,
  ChatCompletionTokenCountEvent,
  ToolOptions,
} from '@kbn/inference-common';
import { ChatCompletionEventType, withoutTokenCountEvents } from '@kbn/inference-common';
import type { Logger } from '@kbn/logging';
import type { OperatorFunction } from 'rxjs';
import { map, merge, share, toArray } from 'rxjs';
import { validateToolCalls } from '../../util/validate_tool_calls';
import { mergeChunks } from './merge_chunks';

export function chunksIntoMessage<TToolOptions extends ToolOptions>({
  logger,
  toolOptions,
}: {
  toolOptions: TToolOptions;
  logger: Pick<Logger, 'debug'>;
}): OperatorFunction<
  ChatCompletionChunkEvent | ChatCompletionTokenCountEvent,
  | ChatCompletionChunkEvent
  | ChatCompletionTokenCountEvent
  | ChatCompletionMessageEvent<TToolOptions>
> {
  return (chunks$) => {
    const shared$ = chunks$.pipe(share());

    return merge(
      shared$,
      shared$.pipe(
        withoutTokenCountEvents(),
        toArray(),
        map((chunks): ChatCompletionMessageEvent<TToolOptions> => {
          const concatenatedChunk = mergeChunks(chunks);

          logger.debug(() => `Received completed message: ${JSON.stringify(concatenatedChunk)}`);

          const { content, refusal, tool_calls: toolCalls } = concatenatedChunk;

          const validatedToolCalls = validateToolCalls<TToolOptions>({
            ...toolOptions,
            toolCalls,
          });

          return {
            type: ChatCompletionEventType.ChatCompletionMessage,
            content,
            ...(refusal ? { refusal } : {}),
            toolCalls: validatedToolCalls,
          };
        })
      )
    );
  };
}
