/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SmithyMessageDecoderStream } from '@smithy/eventstream-codec';
import { DEFAULT_TOKEN_LIMIT } from '@kbn/connector-schemas/bedrock';
import type { BedrockMessage, BedrockToolChoice } from '@kbn/connector-schemas/bedrock';

export const formatBedrockBody = ({
  messages,
  stopSequences,
  temperature,
  system,
  maxTokens = DEFAULT_TOKEN_LIMIT,
  tools,
  toolChoice,
}: {
  messages: BedrockMessage[];
  stopSequences?: string[];
  temperature?: number;
  maxTokens?: number;
  // optional system message to be sent to the API
  system?: string;
  tools?: Array<{ name: string; description: string }>;
  toolChoice?: BedrockToolChoice;
}) => ({
  anthropic_version: 'bedrock-2023-05-31',
  ...ensureMessageFormat(messages, system),
  max_tokens: maxTokens,
  stop_sequences: stopSequences,
  ...(temperature !== undefined ? { temperature } : {}),
  tools,
  tool_choice: toolChoice,
});

interface FormattedBedrockMessage {
  role: string;
  content: string | BedrockMessage['rawContent'];
}

/**
 * Ensures that the messages are in the correct format for the Bedrock API
 * If 2 user or 2 assistant messages are sent in a row, Bedrock throws an error
 * We combine the messages into a single message to avoid this error
 * @param messages
 */
export const ensureMessageFormat = (
  messages: BedrockMessage[],
  systemPrompt?: string
): {
  messages: FormattedBedrockMessage[];
  system?: string;
} => {
  let system = systemPrompt ? systemPrompt : '';

  const newMessages = messages.reduce<FormattedBedrockMessage[]>((acc, m) => {
    if (m.role === 'system') {
      system = `${system.length ? `${system}\n` : ''}${m.content}`;
      return acc;
    }

    const messageRole = () => (['assistant', 'ai'].includes(m.role) ? 'assistant' : 'user');

    if (m.rawContent) {
      acc.push({
        role: messageRole(),
        content: m.rawContent,
      });
      return acc;
    }

    const lastMessage = acc[acc.length - 1];
    if (lastMessage && lastMessage.role === m.role && typeof lastMessage.content === 'string') {
      // Bedrock only accepts assistant and user roles.
      // If 2 user or 2 assistant messages are sent in a row, combine the messages into a single message
      return [
        ...acc.slice(0, -1),
        { content: `${lastMessage.content}\n${m.content}`, role: m.role },
      ];
    }

    // force role outside of system to ensure it is either assistant or user
    return [...acc, { content: m.content, role: messageRole() }];
  }, []);

  return system.length ? { system, messages: newMessages } : { messages: newMessages };
};

export function parseContent(content: Array<{ text?: string; type: string }>): string {
  let parsedContent = '';
  if (content.length === 1 && content[0].type === 'text' && content[0].text) {
    parsedContent = content[0].text;
  } else if (content.length > 1) {
    parsedContent = content.reduce((acc, { text }) => (text ? `${acc}\n${text}` : acc), '');
  }
  return parsedContent;
}

export const usesDeprecatedArguments = (body: string): boolean => JSON.parse(body)?.prompt != null;

export function extractRegionId(url: string) {
  const match = (url ?? '').match(/https:\/\/.*?\.([a-z\-0-9]+)\.amazonaws\.com/);
  if (match) {
    return match[1];
  }
}

/**
 * Splits an async iterator into two independent async iterators which can be independently read from at different speeds.
 * @param asyncIterator The async iterator returned from Bedrock to split
 */
export function tee<T>(
  asyncIterator: SmithyMessageDecoderStream<T>
): [SmithyMessageDecoderStream<T>, SmithyMessageDecoderStream<T>] {
  // @ts-ignore options is private, but we need it to create the new streams
  const streamOptions = asyncIterator.options;

  const streamLeft = new SmithyMessageDecoderStream<T>(streamOptions);
  const streamRight = new SmithyMessageDecoderStream<T>(streamOptions);

  // Queues to store chunks for each stream
  const leftQueue: T[] = [];
  const rightQueue: T[] = [];

  // Promises for managing when a chunk is available
  let leftPending: ((chunk: T | null) => void) | null = null;
  let rightPending: ((chunk: T | null) => void) | null = null;

  const distribute = async () => {
    for await (const chunk of asyncIterator) {
      // Push the chunk into both queues
      if (leftPending) {
        leftPending(chunk);
        leftPending = null;
      } else {
        leftQueue.push(chunk);
      }

      if (rightPending) {
        rightPending(chunk);
        rightPending = null;
      } else {
        rightQueue.push(chunk);
      }
    }

    // Signal the end of the iterator
    if (leftPending) {
      leftPending(null);
    }
    if (rightPending) {
      rightPending(null);
    }
  };

  // Start distributing chunks from the iterator
  distribute().catch(() => {
    // swallow errors
  });

  // Helper to create an async iterator for each stream
  const createIterator = (
    queue: T[],
    setPending: (fn: ((chunk: T | null) => void) | null) => void
  ) => {
    return async function* () {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          const chunk = await new Promise<T | null>((resolve) => setPending(resolve));
          if (chunk === null) break; // End of the stream
          yield chunk;
        }
      }
    };
  };

  // Assign independent async iterators to each stream
  streamLeft[Symbol.asyncIterator] = createIterator(leftQueue, (fn) => (leftPending = fn));
  streamRight[Symbol.asyncIterator] = createIterator(rightQueue, (fn) => (rightPending = fn));

  return [streamLeft, streamRight];
}
