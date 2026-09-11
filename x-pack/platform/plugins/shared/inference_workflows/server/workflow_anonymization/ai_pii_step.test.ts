/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MessageRole } from '@kbn/inference-common';
import {
  createPiiTokenizationCapabilityValue,
  PII_TOKENIZATION_CAPABILITY_ID,
  type DetectedPiiEntity,
  type PiiTextRecord,
  type PiiTokenizationContext,
} from '@kbn/inference-plugin/server';
import type { WorkflowExecutionCapabilities } from '@kbn/workflows-extensions/server';
import type { AiPiiInput } from '../../common/workflow_anonymization';
import { executePiiProtection } from './ai_pii_step';

const rule = {
  type: 'RegExp',
  enabled: true,
  pattern: '[^\\s]+@[^\\s]+',
  entityClass: 'EMAIL',
} as const;

const createCapabilities = (pii: PiiTokenizationContext): WorkflowExecutionCapabilities => [
  { id: PII_TOKENIZATION_CAPABILITY_ID, value: createPiiTokenizationCapabilityValue(pii) },
];

const createLogger = () => ({ warn: jest.fn() });

const input: AiPiiInput = {
  system: 'Contact person@example.com',
  messages: [
    { role: MessageRole.User, content: 'Email person@example.com' },
    {
      role: MessageRole.Assistant,
      content: null,
      toolCalls: [
        {
          toolCallId: 'call-1',
          function: { name: 'lookup', arguments: { email: 'person@example.com' } },
        },
      ],
    },
  ],
  rules: [rule],
};

const detectEmailEntities = (records: readonly PiiTextRecord[]): DetectedPiiEntity[] =>
  records.flatMap((record) => {
    const value = 'person@example.com';
    const start = record.text.indexOf(value);
    return start === -1
      ? []
      : [
          {
            recordId: record.id,
            start,
            end: start + value.length,
            value,
            entityClass: 'EMAIL',
          },
        ];
  });

describe('executePiiProtection', () => {
  it('protects system, message content, and structured tool arguments with one call-local map', async () => {
    const detectEntities = jest.fn(({ records }) => Promise.resolve(detectEmailEntities(records)));
    const capabilities = createCapabilities({
      detectEntities,
      tokenize: () => 'EMAIL_TOKEN',
    });

    const output = await executePiiProtection({
      input,
      capabilities,
      abortSignal: new AbortController().signal,
      logger: createLogger(),
    });

    expect(output.system).toBe('Contact EMAIL_TOKEN');
    expect(output.messages[0]).toEqual({ role: MessageRole.User, content: 'Email EMAIL_TOKEN' });
    expect(output.messages[1]).toEqual({
      role: MessageRole.Assistant,
      content: null,
      toolCalls: [
        {
          toolCallId: 'call-1',
          function: { name: 'lookup', arguments: { email: 'EMAIL_TOKEN' } },
        },
      ],
    });
    expect(output.tokenMap).toEqual({
      EMAIL_TOKEN: { original: 'person@example.com', entityClass: 'EMAIL' },
    });
    expect(detectEntities).toHaveBeenCalledWith({
      records: expect.any(Array),
      rules: [rule],
      abortSignal: expect.any(AbortSignal),
    });
    const detectedRecords = detectEntities.mock.calls[0][0].records;
    expect(detectedRecords).not.toContainEqual(
      expect.objectContaining({ id: expect.stringContaining('/function/name') })
    );
  });

  it('fails closed when the detector returns an invalid range', async () => {
    const capabilities = createCapabilities({
      detectEntities: jest
        .fn()
        .mockResolvedValue([
          { recordId: '/system', start: 0, end: 999, value: 'Contact', entityClass: 'EMAIL' },
        ]),
      tokenize: jest.fn(),
    });

    await expect(
      executePiiProtection({
        input,
        capabilities,
        abortSignal: new AbortController().signal,
        logger: createLogger(),
      })
    ).rejects.toThrow('PII detector returned an invalid range');
  });

  it('honors abort signal that fires during detection and before entity application', async () => {
    const abortController = new AbortController();
    const capabilities = createCapabilities({
      detectEntities: jest.fn().mockImplementation(async () => {
        abortController.abort();
        return [];
      }),
      tokenize: jest.fn(),
    });

    await expect(
      executePiiProtection({
        input,
        capabilities,
        abortSignal: abortController.signal,
        logger: createLogger(),
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('deduplicates the same detected value into a single token-map entry', async () => {
    // Regression guard for the tokenize-determinism contract on PiiTokenizationContext.
    // If tokenize() were non-deterministic, repeated occurrences would produce different tokens,
    // triggering a false collision error or leaving orphaned token-map entries.
    const detectEntities = jest.fn(({ records }) => Promise.resolve(detectEmailEntities(records)));
    const capabilities = createCapabilities({
      detectEntities,
      tokenize: () => 'EMAIL_TOKEN',
    });

    const output = await executePiiProtection({
      input: {
        messages: [
          { role: MessageRole.User, content: 'First person@example.com mention' },
          { role: MessageRole.User, content: 'Second person@example.com mention' },
        ],
        rules: [rule],
      },
      capabilities,
      abortSignal: new AbortController().signal,
      logger: createLogger(),
    });

    expect(output.messages[0]).toEqual({
      role: MessageRole.User,
      content: 'First EMAIL_TOKEN mention',
    });
    expect(output.messages[1]).toEqual({
      role: MessageRole.User,
      content: 'Second EMAIL_TOKEN mention',
    });
    // Both occurrences share one entry — not two separate entries
    expect(Object.keys(output.tokenMap)).toHaveLength(1);
    expect(output.tokenMap).toEqual({
      EMAIL_TOKEN: { original: 'person@example.com', entityClass: 'EMAIL' },
    });
  });

  it('requires a valid request-local PII capability', async () => {
    await expect(
      executePiiProtection({
        input,
        capabilities: [],
        abortSignal: new AbortController().signal,
        logger: createLogger(),
      })
    ).rejects.toThrow(PII_TOKENIZATION_CAPABILITY_ID);
  });

  it('warns when a later detected entity overlaps an earlier protected range', async () => {
    const logger = createLogger();
    const capabilities = createCapabilities({
      detectEntities: jest.fn().mockResolvedValue([
        { recordId: '/system', start: 0, end: 7, value: 'Contact', entityClass: 'ENTITY_NAME' },
        { recordId: '/system', start: 4, end: 10, value: 'act pe', entityClass: 'ENTITY_NAME' },
      ]),
      tokenize: () => 'ENTITY_TOKEN',
    });

    await executePiiProtection({
      input,
      capabilities,
      abortSignal: new AbortController().signal,
      logger,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'PII detector returned overlapping entities; ignoring the later match',
      { recordId: '/system', entityClass: 'ENTITY_NAME', start: 4, end: 10 }
    );
  });

  it('logs token collisions without recording sensitive values and then fails closed', async () => {
    const logger = createLogger();
    // Two different emails both tokenize to the same token — within-call collision.
    const capabilities = createCapabilities({
      detectEntities: jest.fn(({ records }) =>
        Promise.resolve(
          records.flatMap((record) => {
            const entities: DetectedPiiEntity[] = [];
            for (const value of ['person@example.com', 'other@example.com']) {
              const start = record.text.indexOf(value);
              if (start !== -1) {
                entities.push({
                  recordId: record.id,
                  start,
                  end: start + value.length,
                  value,
                  entityClass: 'EMAIL',
                });
              }
            }
            return entities;
          })
        )
      ),
      tokenize: () => 'COLLISION_TOKEN',
    });

    await expect(
      executePiiProtection({
        input: {
          system: 'person@example.com and other@example.com',
          messages: [],
          rules: [rule],
        },
        capabilities,
        abortSignal: new AbortController().signal,
        logger,
      })
    ).rejects.toThrow('PII token collision detected');
    expect(logger.warn).toHaveBeenCalledWith(
      'PII token collision detected; failing workflow protection',
      { existingEntityClass: 'EMAIL', detectedEntityClass: 'EMAIL' }
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('person@example.com');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('other@example.com');
  });
});
