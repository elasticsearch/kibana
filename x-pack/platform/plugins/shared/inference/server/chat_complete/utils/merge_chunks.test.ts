/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChatCompletionEventType } from '@kbn/inference-common';
import { mergeChunks } from './merge_chunks';

describe('mergeChunks', () => {
  it('concatenates content chunks into a single message', async () => {
    const message = mergeChunks([
      {
        content: 'Hey',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [],
      },
      {
        content: ' how is it',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [],
      },
      {
        content: ' going',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [],
      },
    ]);

    expect(message).toEqual({
      content: 'Hey how is it going',
      tool_calls: [],
    });
  });

  it('concatenates tool calls', async () => {
    const message = mergeChunks([
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: 'myFunction',
              arguments: '',
            },
            index: 0,
            toolCallId: '001',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: 'myFunction',
              arguments: '{ ',
            },
            index: 0,
            toolCallId: '001',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: 'myFunction',
              arguments: '"foo": "bar" }',
            },
            index: 0,
            toolCallId: '001',
          },
        ],
      },
    ]);

    expect(message).toEqual({
      content: '',
      tool_calls: [
        {
          function: {
            name: 'myFunction',
            arguments: '{ "foo": "bar" }',
          },
          toolCallId: '001',
        },
      ],
    });
  });

  it('concatenates tool calls even when the index does not start at 0', async () => {
    const message = mergeChunks([
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: 'myFunction',
              arguments: '',
            },
            index: 1,
            toolCallId: '001',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: '',
              arguments: '{ ',
            },
            index: 1,
            toolCallId: '',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: '',
              arguments: '"foo": "bar" }',
            },
            index: 1,
            toolCallId: '',
          },
        ],
      },
    ]);

    expect(message).toEqual({
      content: '',
      tool_calls: [
        {
          function: {
            name: 'myFunction',
            arguments: '{ "foo": "bar" }',
          },
          toolCallId: '001',
        },
      ],
    });
  });

  it('concatenates multiple tool calls into a single message', async () => {
    const message = mergeChunks([
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: 'myFunction',
              arguments: '',
            },
            index: 0,
            toolCallId: '001',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: '',
              arguments: '{"foo": "bar"}',
            },
            index: 0,
            toolCallId: '',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: 'myFunction',
              arguments: '{ "foo": "baz" }',
            },
            index: 1,
            toolCallId: '002',
          },
        ],
      },
    ]);

    expect(message).toEqual({
      content: '',
      tool_calls: [
        {
          function: {
            name: 'myFunction',
            arguments: '{"foo": "bar"}',
          },
          toolCallId: '001',
        },
        {
          function: {
            name: 'myFunction',
            arguments: '{ "foo": "baz" }',
          },
          toolCallId: '002',
        },
      ],
    });
  });

  it('keeps separate tool calls with same index but different toolCallIds', async () => {
    // This test validates that tool calls with the same index but different toolCallIds don't get incorrectly merged into one tool call.
    const message = mergeChunks([
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: { name: 'func1', arguments: '' },
            index: 0,
            toolCallId: '001',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: { name: '', arguments: '{}' },
            index: 0,
            toolCallId: '',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: { name: 'func2', arguments: '' },
            index: 0,
            toolCallId: '002',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: { name: '', arguments: '{}' },
            index: 0,
            toolCallId: '',
          },
        ],
      },
    ]);

    expect(message.tool_calls).toHaveLength(2);
    expect(message.tool_calls[0]).toEqual({
      function: { name: 'func1', arguments: '{}' },
      toolCallId: '001',
    });
    expect(message.tool_calls[1]).toEqual({
      function: { name: 'func2', arguments: '{}' },
      toolCallId: '002',
    });
  });

  it('complex scenario with many chunks and two functions calls', async () => {
    const message = mergeChunks([
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: 'myFunction',
              arguments: '',
            },
            index: 0,
            toolCallId: '001',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: 'myOtherFunction',
              arguments: '',
            },
            index: 1,
            toolCallId: '002',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: '',
              arguments: '{ "userId": ',
            },
            index: 0,
            toolCallId: '',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: '',
              arguments: '{ "query": "streaming ',
            },
            index: 1,
            toolCallId: '',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: '',
              arguments: '123, "verbose": ',
            },
            index: 0,
            toolCallId: '',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: '',
              arguments: 'tool calls", "limit": ',
            },
            index: 1,
            toolCallId: '',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: '',
              arguments: 'true }',
            },
            index: 0,
            toolCallId: '',
          },
        ],
      },
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: '',
              arguments: '10 }',
            },
            index: 1,
            toolCallId: '',
          },
        ],
      },
    ]);

    expect(message).toEqual({
      content: '',
      tool_calls: [
        {
          toolCallId: '001',
          function: {
            name: 'myFunction',
            arguments: '{ "userId": 123, "verbose": true }',
          },
        },
        {
          toolCallId: '002',
          function: {
            name: 'myOtherFunction',
            arguments: '{ "query": "streaming tool calls", "limit": 10 }',
          },
        },
      ],
    });
  });

  it('synthesizes a per-index key when a tool call has no toolCallId and no previous chunk set it', async () => {
    const message = mergeChunks([
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: {
              name: 'myFunction',
              arguments: '{ "foo": "bar" }',
            },
            index: 0,
            toolCallId: '', // Empty toolCallId without a previous chunk setting it
          },
        ],
      },
    ]);

    expect(message.tool_calls).toEqual([
      {
        function: {
          name: 'myFunction',
          arguments: '{ "foo": "bar" }',
        },
        toolCallId: '_generated_0',
      },
    ]);
  });

  it('merges a single-chunk tool call with empty toolCallId and empty name (EIS single-shot)', async () => {
    const message = mergeChunks([
      {
        content: '',
        type: ChatCompletionEventType.ChatCompletionChunk,
        tool_calls: [
          {
            function: { name: '', arguments: '{"criteria":[1]}' },
            index: 0,
            toolCallId: '',
          },
        ],
      },
    ]);

    expect(message.tool_calls).toEqual([
      {
        function: { name: '', arguments: '{"criteria":[1]}' },
        toolCallId: '_generated_0',
      },
    ]);
  });
});
