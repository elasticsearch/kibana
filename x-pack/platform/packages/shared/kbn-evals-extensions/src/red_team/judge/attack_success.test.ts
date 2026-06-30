/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { executeUntilValid } from '@kbn/inference-prompt-utils';
import { createAttackSuccessJudge } from './attack_success';

jest.mock('@kbn/inference-prompt-utils');
const mockExecuteUntilValid = executeUntilValid as jest.MockedFunction<typeof executeUntilValid>;

const createMockLog = () => ({
  info: jest.fn(),
  warning: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  success: jest.fn(),
  write: jest.fn(),
  getWritten: jest.fn().mockReturnValue({ log: [], error: [] }),
  indent: jest.fn(),
  get: jest.fn(),
});

describe('AttackSuccessJudge', () => {
  it('has correct name and kind', () => {
    const mockInferenceClient = {} as any;
    const judge = createAttackSuccessJudge({
      inferenceClient: mockInferenceClient,
      log: createMockLog() as any,
    });

    expect(judge.name).toBe('attack-success-judge');
    expect(judge.kind).toBe('LLM');
  });

  it('skips evaluation when no intent is provided', async () => {
    const mockInferenceClient = {} as any;
    const judge = createAttackSuccessJudge({
      inferenceClient: mockInferenceClient,
      log: createMockLog() as any,
    });

    const result = await judge.evaluate({
      input: { prompt: 'test' },
      output: 'response',
      expected: { expectedBehavior: 'refuse' },
      metadata: null,
    });

    expect(result.score).toBeNull();
    expect(result.label).toBe('skipped');
  });

  it('skips evaluation when expected is null', async () => {
    const mockInferenceClient = {} as any;
    const judge = createAttackSuccessJudge({
      inferenceClient: mockInferenceClient,
      log: createMockLog() as any,
    });

    const result = await judge.evaluate({
      input: { prompt: 'test' },
      output: 'response',
      expected: null,
      metadata: null,
    });

    expect(result.score).toBeNull();
    expect(result.label).toBe('skipped');
  });

  it('fails soft (skips) instead of throwing when the judge returns no tool call', async () => {
    // Regression: an empty toolCalls array (provider ignored the forced tool
    // choice) previously threw a TypeError that aborted the whole suite run.
    mockExecuteUntilValid.mockResolvedValue({ toolCalls: [] } as any);

    const judge = createAttackSuccessJudge({
      inferenceClient: {} as any,
      log: createMockLog() as any,
    });

    const result = await judge.evaluate({
      input: { prompt: 'test' },
      output: 'some model response',
      expected: { intent: 'extract the system prompt' },
      metadata: null,
    });

    expect(result.score).toBeNull();
    expect(result.label).toBe('skipped');
  });
});
