/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type OpenAI from 'openai';
import { v4 } from 'uuid';
import { lastValueFrom, toArray, filter, noop, of } from 'rxjs';
import { loggerMock } from '@kbn/logging-mocks';
import {
  ToolChoiceType,
  ChatCompletionEventType,
  MessageRole,
  isChatCompletionChunkEvent,
  isChatCompletionTokenCountEvent,
} from '@kbn/inference-common';
import { observableIntoEventSourceStream } from '../../../util/observable_into_event_source_stream';
import type { InferenceEndpointExecutor } from '../../utils/inference_endpoint_executor';
import { inferenceEndpointAdapter } from './inference_endpoint_adapter';

function createOpenAIChunk({
  delta,
  usage,
}: {
  delta?: OpenAI.ChatCompletionChunk['choices'][number]['delta'];
  usage?: OpenAI.ChatCompletionChunk['usage'];
}): OpenAI.ChatCompletionChunk {
  return {
    choices: delta
      ? [
          {
            finish_reason: null,
            index: 0,
            delta,
          },
        ]
      : [],
    created: new Date().getTime(),
    id: v4(),
    model: 'gpt-4o',
    object: 'chat.completion.chunk',
    usage,
  };
}

describe('inferenceEndpointAdapter', () => {
  const executorMock: InferenceEndpointExecutor & {
    invoke: jest.MockedFn<InferenceEndpointExecutor['invoke']>;
  } = {
    invoke: jest.fn(),
  };

  const logger = loggerMock.create();

  beforeEach(() => {
    executorMock.invoke.mockReset();
  });

  const defaultArgs = {
    executor: executorMock,
    logger,
  };

  describe('when creating the request', () => {
    it('emits chunk events', async () => {
      const source$ = of(
        createOpenAIChunk({
          delta: { content: 'First' },
        }),
        createOpenAIChunk({
          delta: { content: ', second' },
        })
      );

      executorMock.invoke.mockResolvedValue(observableIntoEventSourceStream(source$, logger));

      const response$ = inferenceEndpointAdapter.chatComplete({
        ...defaultArgs,
        messages: [{ role: MessageRole.User, content: 'Hello' }],
      });

      const allChunks = await lastValueFrom(
        response$.pipe(filter(isChatCompletionChunkEvent), toArray())
      );

      expect(allChunks).toEqual([
        {
          content: 'First',
          tool_calls: [],
          type: ChatCompletionEventType.ChatCompletionChunk,
        },
        {
          content: ', second',
          tool_calls: [],
          type: ChatCompletionEventType.ChatCompletionChunk,
        },
      ]);
    });

    it('emits token count event when provided by the response', async () => {
      const source$ = of(
        createOpenAIChunk({
          delta: { content: 'First' },
          usage: {
            completion_tokens: 5,
            prompt_tokens: 10,
            total_tokens: 15,
          },
        })
      );

      executorMock.invoke.mockResolvedValue(observableIntoEventSourceStream(source$, logger));

      const response$ = inferenceEndpointAdapter.chatComplete({
        ...defaultArgs,
        messages: [{ role: MessageRole.User, content: 'Hello' }],
      });

      const tokenChunks = await lastValueFrom(
        response$.pipe(filter(isChatCompletionTokenCountEvent), toArray())
      );

      expect(tokenChunks).toEqual([
        {
          type: ChatCompletionEventType.ChatCompletionTokenCount,
          tokens: {
            completion: 5,
            prompt: 10,
            total: 15,
          },
          model: 'gpt-4o',
        },
      ]);
    });

    it('emits token count estimate when not provided by the response', async () => {
      const source$ = of(
        createOpenAIChunk({
          delta: { content: 'First' },
        })
      );

      executorMock.invoke.mockResolvedValue(observableIntoEventSourceStream(source$, logger));

      const response$ = inferenceEndpointAdapter.chatComplete({
        ...defaultArgs,
        messages: [{ role: MessageRole.User, content: 'Hello' }],
      });

      const tokenChunks = await lastValueFrom(
        response$.pipe(filter(isChatCompletionTokenCountEvent), toArray())
      );

      expect(tokenChunks).toHaveLength(1);
      expect(tokenChunks[0]).toMatchObject({
        type: ChatCompletionEventType.ChatCompletionTokenCount,
        tokens: {
          completion: expect.any(Number),
          prompt: expect.any(Number),
          total: expect.any(Number),
        },
      });
    });

    it('propagates the temperature parameter', () => {
      executorMock.invoke.mockResolvedValue(
        observableIntoEventSourceStream(of(createOpenAIChunk({ delta: { content: '' } })), logger)
      );

      inferenceEndpointAdapter
        .chatComplete({
          ...defaultArgs,
          messages: [{ role: MessageRole.User, content: 'question' }],
          temperature: 0.4,
        })
        .subscribe(noop);

      expect(executorMock.invoke).toHaveBeenCalledTimes(1);
      expect(executorMock.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            temperature: 0.4,
          }),
        })
      );
    });

    it('omits temperature for Claude 4.7+ models where it is deprecated', () => {
      executorMock.invoke.mockResolvedValue(
        observableIntoEventSourceStream(of(createOpenAIChunk({ delta: { content: '' } })), logger)
      );

      inferenceEndpointAdapter
        .chatComplete({
          ...defaultArgs,
          messages: [{ role: MessageRole.User, content: 'question' }],
          modelName: 'us.anthropic.claude-opus-4-8-20251101-v1:0',
          temperature: 0.4,
        })
        .subscribe(noop);

      expect(executorMock.invoke).toHaveBeenCalledTimes(1);
      expect(executorMock.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.not.objectContaining({ temperature: expect.anything() }),
        })
      );
    });

    it('includes temperature for Claude 4.6 and earlier models', () => {
      executorMock.invoke.mockResolvedValue(
        observableIntoEventSourceStream(of(createOpenAIChunk({ delta: { content: '' } })), logger)
      );

      inferenceEndpointAdapter
        .chatComplete({
          ...defaultArgs,
          messages: [{ role: MessageRole.User, content: 'question' }],
          modelName: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
          temperature: 0.4,
        })
        .subscribe(noop);

      expect(executorMock.invoke).toHaveBeenCalledTimes(1);
      expect(executorMock.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ temperature: 0.4 }),
        })
      );
    });

    it('propagates the abort signal', () => {
      executorMock.invoke.mockResolvedValue(
        observableIntoEventSourceStream(of(createOpenAIChunk({ delta: { content: '' } })), logger)
      );

      const abortController = new AbortController();

      inferenceEndpointAdapter
        .chatComplete({
          ...defaultArgs,
          messages: [{ role: MessageRole.User, content: 'question' }],
          abortSignal: abortController.signal,
        })
        .subscribe(noop);

      expect(executorMock.invoke).toHaveBeenCalledTimes(1);
      expect(executorMock.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: abortController.signal,
        })
      );
    });

    it('propagates the modelName parameter', () => {
      executorMock.invoke.mockResolvedValue(
        observableIntoEventSourceStream(of(createOpenAIChunk({ delta: { content: '' } })), logger)
      );

      inferenceEndpointAdapter
        .chatComplete({
          ...defaultArgs,
          messages: [{ role: MessageRole.User, content: 'question' }],
          modelName: 'gpt-4o',
        })
        .subscribe(noop);

      expect(executorMock.invoke).toHaveBeenCalledTimes(1);
      expect(executorMock.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            model: 'gpt-4o',
          }),
        })
      );
    });

    it('includes tools and tool_choice in the request when provided', () => {
      executorMock.invoke.mockResolvedValue(
        observableIntoEventSourceStream(of(createOpenAIChunk({ delta: { content: '' } })), logger)
      );

      inferenceEndpointAdapter
        .chatComplete({
          ...defaultArgs,
          messages: [{ role: MessageRole.User, content: 'question' }],
          tools: {
            myTool: { description: 'my tool' },
          },
          toolChoice: ToolChoiceType.auto,
        })
        .subscribe(noop);

      expect(executorMock.invoke).toHaveBeenCalledTimes(1);
      expect(executorMock.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            tools: expect.any(Array),
            tool_choice: 'auto',
          }),
        })
      );
    });

    it('uses simulated function calling when functionCalling is "simulated"', () => {
      executorMock.invoke.mockResolvedValue(
        observableIntoEventSourceStream(of(createOpenAIChunk({ delta: { content: '' } })), logger)
      );

      inferenceEndpointAdapter
        .chatComplete({
          ...defaultArgs,
          messages: [{ role: MessageRole.User, content: 'question' }],
          tools: {
            foo: { description: 'my tool' },
          },
          toolChoice: ToolChoiceType.auto,
          functionCalling: 'simulated',
        })
        .subscribe(noop);

      expect(executorMock.invoke).toHaveBeenCalledTimes(1);
      expect(executorMock.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.not.objectContaining({
            tools: expect.any(Array),
          }),
        })
      );
    });

    it('uses native function calling when functionCalling is "auto"', () => {
      executorMock.invoke.mockResolvedValue(
        observableIntoEventSourceStream(of(createOpenAIChunk({ delta: { content: '' } })), logger)
      );

      inferenceEndpointAdapter
        .chatComplete({
          ...defaultArgs,
          messages: [{ role: MessageRole.User, content: 'question' }],
          tools: {
            foo: { description: 'my tool' },
          },
          toolChoice: ToolChoiceType.auto,
          functionCalling: 'auto',
        })
        .subscribe(noop);

      expect(executorMock.invoke).toHaveBeenCalledTimes(1);
      expect(executorMock.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            tools: expect.any(Array),
            tool_choice: 'auto',
          }),
        })
      );
    });

    it('propagates the timeout parameter', () => {
      executorMock.invoke.mockResolvedValue(
        observableIntoEventSourceStream(of(createOpenAIChunk({ delta: { content: '' } })), logger)
      );

      inferenceEndpointAdapter
        .chatComplete({
          ...defaultArgs,
          messages: [{ role: MessageRole.User, content: 'question' }],
          timeout: 30000,
        })
        .subscribe(noop);

      expect(executorMock.invoke).toHaveBeenCalledTimes(1);
      expect(executorMock.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('throws an error if the executor rejects', async () => {
      executorMock.invoke.mockRejectedValue(new Error('Inference endpoint not found'));

      await expect(
        lastValueFrom(
          inferenceEndpointAdapter
            .chatComplete({
              ...defaultArgs,
              messages: [{ role: MessageRole.User, content: 'Hello' }],
            })
            .pipe(toArray())
        )
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Inference endpoint not found"`);
    });
  });
});
