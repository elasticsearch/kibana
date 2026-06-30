/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type {
  Content,
  EnhancedGenerateContentResponse,
  FunctionCallPart,
  FunctionResponsePart,
  InlineDataPart,
  Part,
  POSSIBLE_ROLES,
  SafetyRating,
  TextPart,
} from '@google/generative-ai';
import { FinishReason } from '@google/generative-ai';
import type { BaseMessage, UsageMetadata } from '@langchain/core/messages';
import { AIMessageChunk, ChatMessage, isBaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { ToolCallChunk } from '@langchain/core/messages/tool';
import type { Readable } from 'stream';
import type { StreamParser } from './types';

export function convertResponseContentToChatGenerationChunk(
  response: EnhancedGenerateContentResponse,
  extra: {
    usageMetadata?: UsageMetadata | undefined;
    index: number;
  }
): ChatGenerationChunk | null {
  if (!response.candidates || response.candidates.length === 0) {
    return null;
  }
  const functionCalls = response.functionCalls();
  const [candidate] = response.candidates;
  const { content, ...generationInfo } = candidate;
  const text = content?.parts[0]?.text ?? '';

  const toolCallChunks: ToolCallChunk[] = [];
  if (functionCalls) {
    toolCallChunks.push(
      ...functionCalls.map((fc) => ({
        ...fc,
        args: JSON.stringify(fc.args),
        index: extra.index,
        type: 'tool_call_chunk' as const,
      }))
    );
  }
  return new ChatGenerationChunk({
    text,
    message: new AIMessageChunk({
      content: text,
      name: !content ? undefined : content.role,
      tool_call_chunks: toolCallChunks,
      // Each chunk can have unique "generationInfo", and merging strategy is unclear,
      // so leave blank for now.
      additional_kwargs: {},
      usage_metadata: extra.usageMetadata,
    }),
    generationInfo,
  });
}

export function convertAuthorToRole(author: string): (typeof POSSIBLE_ROLES)[number] {
  switch (author) {
    /**
     *  Note: Gemini currently is not supporting system messages
     *  we will convert them to human messages and merge with following
     * */
    case 'ai':
    case 'model': // getMessageAuthor returns message.name. code ex.: return message.name ?? type;
      return 'model';
    case 'system':
    case 'human':
      return 'user';
    case 'tool':
    case 'function':
      return 'function';
    default:
      throw new Error(`Unknown / unsupported author: ${author}`);
  }
}
export function convertBaseMessagesToContent(messages: BaseMessage[], isMultimodalModel: boolean) {
  return messages.reduce<{
    content: Content[];
    mergeWithPreviousContent: boolean;
  }>(
    (acc, message, index) => {
      if (!isBaseMessage(message)) {
        throw new Error('Unsupported message input');
      }
      const author = getMessageAuthor(message);
      if (author === 'system' && index !== 0) {
        throw new Error('System message should be the first one');
      }
      const role = convertAuthorToRole(author);
      const parts = convertMessageContentToParts(message, isMultimodalModel);

      if (acc.mergeWithPreviousContent) {
        const prevContent = acc.content[acc.content.length - 1];
        if (!prevContent) {
          throw new Error(
            'There was a problem parsing your system message. Please try a prompt without one.'
          );
        }
        prevContent.parts.push(...parts);

        return {
          mergeWithPreviousContent: false,
          content: acc.content,
        };
      }
      let actualRole = role;
      if (actualRole === 'function') {
        // GenerativeAI API will throw an error if the role is not "user" or "model."
        actualRole = 'user';
      }
      const content: Content = {
        role: actualRole,
        parts,
      };
      return {
        mergeWithPreviousContent: author === 'system',
        content: [...acc.content, content],
      };
    },
    { content: [], mergeWithPreviousContent: false }
  ).content;
}

export function convertMessageContentToParts(
  message: BaseMessage,
  isMultimodalModel: boolean
): Part[] {
  if (typeof message.content === 'string' && message.content !== '') {
    return [{ text: message.content }];
  }

  let functionCalls: FunctionCallPart[] = [];
  let functionResponses: FunctionResponsePart[] = [];
  let messageParts: Part[] = [];

  if (
    'tool_calls' in message &&
    Array.isArray(message.tool_calls) &&
    message.tool_calls.length > 0
  ) {
    functionCalls = message.tool_calls.map((tc) => ({
      functionCall: {
        name: tc.name,
        args: tc.args,
      },
    }));
  } else if (message._getType() === 'tool' && message.name && message.content) {
    functionResponses = [
      {
        functionResponse: {
          name: message.name,
          response: message.content,
        },
      },
    ];
  } else if (Array.isArray(message.content)) {
    messageParts = message.content.map((c) => {
      if (c.type === 'text') {
        return {
          text: c.text,
        } as TextPart;
      }

      if (c.type === 'image_url') {
        if (!isMultimodalModel) {
          throw new Error(`This model does not support images`);
        }
        let source: string;
        if (typeof c.image_url === 'string') {
          source = c.image_url;
        } else if (c.image_url && typeof c.image_url === 'object' && 'url' in c.image_url) {
          source = c.image_url.url as string;
        } else {
          throw new Error('Please provide image as base64 encoded data URL');
        }
        const [dm, data] = source.split(',');
        if (!dm.startsWith('data:')) {
          throw new Error('Please provide image as base64 encoded data URL');
        }

        const [mimeType, encoding] = dm.replace(/^data:/, '').split(';');
        if (encoding !== 'base64') {
          throw new Error('Please provide image as base64 encoded data URL');
        }

        return {
          inlineData: {
            data,
            mimeType,
          },
        } as InlineDataPart;
      } else if (c.type === 'media') {
        return messageContentMedia(c);
      } else if (c.type === 'tool_use') {
        return {
          functionCall: {
            name: c.name,
            args: c.input,
          },
        } as FunctionCallPart;
      }
      throw new Error(`Unknown content type ${(c as { type: string }).type}`);
    });
  }

  return [...messageParts, ...functionCalls, ...functionResponses];
}

export function getMessageAuthor(message: BaseMessage) {
  const type = message._getType();
  if (ChatMessage.isInstance(message)) {
    return message.role;
  }
  if (type === 'tool') {
    return type;
  }
  return message.name ?? type;
}

// will be removed once FileDataPart is supported in @langchain/google-genai
function messageContentMedia(content: Record<string, unknown>): InlineDataPart {
  if ('mimeType' in content && 'data' in content) {
    return {
      inlineData: {
        mimeType: content.mimeType,
        data: content.data,
      },
    } as InlineDataPart;
  }
  throw new Error('Invalid media content');
}

// TODO Google's TS library is behind the API
// remove this enum once the library is updated
// https://github.com/google-gemini/generative-ai-js/pull/270
enum FinishReasonMore {
  BLOCKLIST = 'BLOCKLIST',
  PROHIBITED_CONTENT = 'PROHIBITED_CONTENT',
  SPII = 'SPII',
  MALFORMED_FUNCTION_CALL = 'MALFORMED_FUNCTION_CALL',
}
const badFinishReasons = [
  FinishReason.RECITATION,
  FinishReason.SAFETY,
  FinishReasonMore.BLOCKLIST,
  FinishReasonMore.PROHIBITED_CONTENT,
  FinishReasonMore.SPII,
  FinishReasonMore.MALFORMED_FUNCTION_CALL,
];
function hadBadFinishReason(candidate: { finishReason?: FinishReason }) {
  return !!candidate.finishReason && badFinishReasons.includes(candidate.finishReason);
}

export function convertResponseBadFinishReasonToErrorMsg(
  response: EnhancedGenerateContentResponse
): string | null {
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (hadBadFinishReason(candidate)) {
      if (
        candidate.finishReason === FinishReason.SAFETY &&
        candidate.safetyRatings &&
        (candidate.safetyRatings?.length ?? 0) > 0
      ) {
        const safetyReasons = getSafetyReasons(candidate.safetyRatings as SafetyReason[]);
        return `Gemini Utils: action result status is error. Candidate was blocked due to ${candidate.finishReason} - ${safetyReasons}`;
      } else {
        return `Gemini Utils: action result status is error. Candidate was blocked due to ${candidate.finishReason}`;
      }
    }
  }
  return null;
}

// not sure why these properties are not on the type, as they are on the data
interface SafetyReason extends SafetyRating {
  blocked: boolean;
  severity: string;
}

const getSafetyReasons = (safetyRatings: SafetyReason[]) => {
  const reasons = safetyRatings.filter((t: SafetyReason) => t.blocked);
  return reasons.reduce(
    (acc: string, t: SafetyReason, i: number) =>
      `${acc.length ? `${acc} ` : ''}${t.category}: ${t.severity}${
        i < reasons.length - 1 ? ',' : ''
      }`,
    ''
  );
};

export const parseGeminiStreamAsAsyncIterator = async function* (
  stream: Readable,
  logger: Logger,
  abortSignal?: AbortSignal
) {
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => {
      stream.destroy();
    });
  }
  try {
    for await (const chunk of stream) {
      const decoded = chunk.toString();
      const parsed = parseGeminiResponse(decoded);
      // Split the parsed string into chunks of 5 characters
      for (let i = 0; i < parsed.length; i += 5) {
        yield parsed.substring(i, i + 5);
      }
    }
  } catch (err) {
    if (abortSignal?.aborted) {
      logger.info('Gemini stream parsing was aborted.');
    } else {
      throw err;
    }
  }
};

export const parseGeminiStream: StreamParser = async (
  stream,
  logger,
  abortSignal,
  tokenHandler
) => {
  let responseBody = '';
  stream.on('data', (chunk) => {
    const decoded = chunk.toString();
    const parsed = parseGeminiResponse(decoded);
    if (tokenHandler) {
      // Split the parsed string into chunks of 5 characters
      for (let i = 0; i < parsed.length; i += 5) {
        tokenHandler(parsed.substring(i, i + 5));
      }
    }
    responseBody += parsed;
  });
  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      resolve(responseBody);
    });
    stream.on('error', (err) => {
      reject(err);
    });
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        logger.info('Bedrock stream parsing was aborted.');
        stream.destroy();
        resolve(responseBody);
      });
    }
  });
};

/** Parse Gemini stream response body */
export const parseGeminiResponse = (responseBody: string) => {
  return responseBody
    .split('\n')
    .filter((line) => line.startsWith('data: ') && !line.endsWith('[DONE]'))
    .map((line) => JSON.parse(line.replace('data: ', '')))
    .filter(
      (
        line
      ): line is {
        candidates: Array<{
          content: { role: string; parts: Array<{ text: string }> };
          finishReason: string;
          safetyRatings: Array<{ category: string; probability: string }>;
        }>;
        usageMetadata: {
          promptTokenCount: number;
          candidatesTokenCount: number;
          totalTokenCount: number;
        };
      } => 'candidates' in line
    )
    .reduce((prev, line) => {
      if (line.candidates[0] && line.candidates[0].content) {
        const parts = line.candidates[0].content.parts;
        const text = parts.map((part) => part.text).join('');
        return prev + text;
      }
      return prev;
    }, '');
};
