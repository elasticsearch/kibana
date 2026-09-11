/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MessageRole, type Message } from '@kbn/inference-common';
import type { PiiTextRecord } from '@kbn/inference-plugin/server';

type RecordValues = ReadonlyMap<string, string>;

// Fail-closed guard: tool-call arguments are user-influenced and could be arbitrarily nested.
// Exceeding this depth throws rather than silently truncating or OOM-ing.
const MAX_STRUCTURED_DEPTH = 100;

const collectStructuredStrings = (
  value: unknown,
  path: string,
  records: PiiTextRecord[],
  depth = 0
): void => {
  if (depth > MAX_STRUCTURED_DEPTH) {
    throw new Error(
      `PII scanner exceeded maximum nesting depth (${MAX_STRUCTURED_DEPTH}) at path "${path}"`
    );
  }

  if (typeof value === 'string') {
    records.push({ id: path, text: value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectStructuredStrings(item, `${path}/${index}`, records, depth + 1)
    );
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  const objectValue = value as Record<string, unknown>;
  if (objectValue.type === 'image') {
    return;
  }

  Object.entries(objectValue).forEach(([key, entry]) =>
    collectStructuredStrings(entry, `${path}/${key}`, records, depth + 1)
  );
};

const replaceStructuredStrings = <T>(
  value: T,
  path: string,
  values: RecordValues,
  depth = 0
): T => {
  if (depth > MAX_STRUCTURED_DEPTH) {
    throw new Error(
      `PII scanner exceeded maximum nesting depth (${MAX_STRUCTURED_DEPTH}) at path "${path}"`
    );
  }

  if (typeof value === 'string') {
    return (values.get(path) ?? value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      replaceStructuredStrings(item, `${path}/${index}`, values, depth + 1)
    ) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const objectValue = value as Record<string, unknown>;
  if (objectValue.type === 'image') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(objectValue).map(([key, entry]) => [
      key,
      replaceStructuredStrings(entry, `${path}/${key}`, values, depth + 1),
    ])
  ) as T;
};

const collectMessageStrings = (message: Message, index: number, records: PiiTextRecord[]): void => {
  const path = `/messages/${index}`;

  if (message.role === MessageRole.User) {
    if (typeof message.content === 'string') {
      records.push({ id: `${path}/content`, text: message.content });
      return;
    }

    message.content.forEach((content, contentIndex) => {
      if (content.type === 'text') {
        records.push({ id: `${path}/content/${contentIndex}/text`, text: content.text });
      }
    });
    return;
  }

  if (message.role === MessageRole.Assistant) {
    if (typeof message.content === 'string') {
      records.push({ id: `${path}/content`, text: message.content });
    }
    message.toolCalls?.forEach((toolCall, toolCallIndex) =>
      collectStructuredStrings(
        toolCall.function.arguments,
        `${path}/toolCalls/${toolCallIndex}/function/arguments`,
        records
      )
    );
    return;
  }

  collectStructuredStrings(message.response, `${path}/response`, records);
  if (message.data !== undefined) {
    collectStructuredStrings(message.data, `${path}/data`, records);
  }
};

const replaceMessageStrings = (message: Message, index: number, values: RecordValues): Message => {
  const path = `/messages/${index}`;

  if (message.role === MessageRole.User) {
    return {
      ...message,
      content:
        typeof message.content === 'string'
          ? values.get(`${path}/content`) ?? message.content
          : message.content.map((content, contentIndex) =>
              content.type === 'text'
                ? {
                    ...content,
                    text: values.get(`${path}/content/${contentIndex}/text`) ?? content.text,
                  }
                : content
            ),
    };
  }

  if (message.role === MessageRole.Assistant) {
    return {
      ...message,
      content:
        typeof message.content === 'string'
          ? values.get(`${path}/content`) ?? message.content
          : message.content,
      toolCalls: message.toolCalls?.map((toolCall, toolCallIndex) => ({
        ...toolCall,
        function: {
          ...toolCall.function,
          arguments: replaceStructuredStrings(
            toolCall.function.arguments,
            `${path}/toolCalls/${toolCallIndex}/function/arguments`,
            values
          ),
        },
      })),
    };
  }

  return {
    ...message,
    response: replaceStructuredStrings(message.response, `${path}/response`, values),
    ...(message.data !== undefined
      ? { data: replaceStructuredStrings(message.data, `${path}/data`, values) }
      : {}),
  };
};

export const createCompletionTextRecords = ({
  system,
  messages,
}: {
  system?: string;
  messages: readonly Message[];
}): {
  records: readonly PiiTextRecord[];
  replace(values: RecordValues): { system?: string; messages: Message[] };
} => {
  const records: PiiTextRecord[] = [];
  if (system !== undefined) {
    records.push({ id: '/system', text: system });
  }
  messages.forEach((message, index) => collectMessageStrings(message, index, records));

  return {
    records,
    replace: (values) => ({
      ...(system !== undefined ? { system: values.get('/system') ?? system } : {}),
      messages: messages.map((message, index) => replaceMessageStrings(message, index, values)),
    }),
  };
};
