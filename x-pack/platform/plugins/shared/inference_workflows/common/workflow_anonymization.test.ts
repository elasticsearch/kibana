/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MessageRole, type Message } from '@kbn/inference-common';
import {
  aiPiiInputSchema,
  anonymizationRuleSchema,
  tokenMapSchema,
  workflowChatMessageSchema,
} from './workflow_anonymization';

describe('workflow anonymization schemas', () => {
  const supportedEntityClasses = [
    'PER',
    'ORG',
    'LOC',
    'MISC',
    'HOST_NAME',
    'USER_NAME',
    'IP',
    'URL',
    'EMAIL',
    'CLOUD_ACCOUNT',
    'ENTITY_NAME',
    'RESOURCE_NAME',
    'RESOURCE_ID',
  ] as const;
  const messages: Message[] = [
    {
      role: MessageRole.User,
      content: [
        { type: 'text', text: 'hello' },
        { type: 'image', source: { data: 'base64', mimeType: 'image/png' } },
      ],
    },
    {
      role: MessageRole.Assistant,
      content: null,
      refusal: null,
      toolCalls: [
        {
          toolCallId: 'call-1',
          function: { name: 'lookup', arguments: { email: 'person@example.com' } },
        },
      ],
    },
    {
      role: MessageRole.Tool,
      name: 'lookup',
      toolCallId: 'call-1',
      response: { nested: ['value'] },
      data: { source: 'test' },
    },
  ];

  it.each(messages)('accepts a valid inference Message %#', (message) => {
    expect(workflowChatMessageSchema.parse(message)).toEqual(message);
  });

  it('preserves opaque image extensions for forward compatibility', () => {
    const message = {
      role: MessageRole.User,
      content: [
        {
          type: 'image',
          source: { data: 'base64', mimeType: 'image/png', sourceMetadata: 'preserved' },
          altText: 'preserved',
        },
      ],
    };

    expect(workflowChatMessageSchema.parse(message)).toEqual(message);
  });

  it('rejects unknown message, rule, and token-map fields', () => {
    expect(() =>
      workflowChatMessageSchema.parse({
        role: MessageRole.User,
        content: 'hello',
        unexpected: 'value',
      })
    ).toThrow();
    expect(() =>
      anonymizationRuleSchema.parse({
        type: 'RegExp',
        enabled: true,
        pattern: 'secret',
        entityClass: 'ENTITY_NAME',
        unexpected: 'value',
      })
    ).toThrow();
    expect(() =>
      tokenMapSchema.parse({
        TOKEN: { original: 'secret', entityClass: 'ENTITY_NAME', unexpected: 'value' },
      })
    ).toThrow();
  });

  it.each(supportedEntityClasses)('accepts the supported %s entity class', (entityClass) => {
    expect(
      anonymizationRuleSchema.parse({
        type: 'RegExp',
        enabled: true,
        pattern: 'value',
        entityClass,
      })
    ).toEqual({ type: 'RegExp', enabled: true, pattern: 'value', entityClass });
  });

  it('rejects an unsupported message role through the PII input boundary', () => {
    expect(() =>
      aiPiiInputSchema.parse({
        messages: [{ role: 'system', content: 'not a Message role' }],
        rules: [],
      })
    ).toThrow();
  });
});
