/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock, type MockedLogger } from '@kbn/logging-mocks';
import { PiiRegexWorkerService } from './regex_worker_service';
import type { WorkflowAnonymizationWorkerConfig } from '../../config';
import type { PiiRegexWorkerTaskPayload } from './types';

function createTestConfig(
  overrides: Partial<WorkflowAnonymizationWorkerConfig> = {}
): WorkflowAnonymizationWorkerConfig {
  return {
    enabled: true,
    minThreads: 1,
    maxThreads: 2,
    maxQueue: 20,
    idleTimeout: { asMilliseconds: () => 30_000 },
    taskTimeout: { asMilliseconds: () => 15_000 },
    ...overrides,
  } as WorkflowAnonymizationWorkerConfig;
}

const IP_PAYLOAD: PiiRegexWorkerTaskPayload = {
  rules: [{ entityClass: 'IP', pattern: '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b' }],
  records: [{ content: 'connect to 10.0.0.1' }],
};

describe('PiiRegexWorkerService', () => {
  let logger: MockedLogger;
  let service: PiiRegexWorkerService;

  beforeEach(() => {
    jest.resetAllMocks();
    logger = loggerMock.create();
  });

  afterEach(async () => {
    await service?.stop();
  });

  it('executes rules through the worker pool and returns matches', async () => {
    service = new PiiRegexWorkerService(createTestConfig(), logger);
    const results = await service.run(IP_PAYLOAD);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      entityClass: 'IP',
      matchValue: '10.0.0.1',
      recordIndex: 0,
      recordKey: 'content',
      ruleIndex: 0,
      start: expect.any(Number),
      end: expect.any(Number),
    });
  });

  it('runs synchronously when the worker pool is disabled', async () => {
    service = new PiiRegexWorkerService(createTestConfig({ enabled: false }), logger);
    const results = await service.run(IP_PAYLOAD);

    expect((service as any).worker).toBeUndefined();
    expect(results).toHaveLength(1);
    expect(results[0].matchValue).toBe('10.0.0.1');
  });

  it('throws on the sync path for patterns that require native RegExp (lookahead/lookbehind/backrefs)', async () => {
    service = new PiiRegexWorkerService(createTestConfig({ enabled: false }), logger);
    // (?=a) is a positive lookahead — RE2 rejects it; native RegExp can backtrack catastrophically
    await expect(
      service.run({
        rules: [{ entityClass: 'MISC', pattern: '(?=a)a+' }],
        records: [{ content: 'aaa' }],
      })
    ).rejects.toThrow();
  });

  it('aborts the timed-out task and throws when taskTimeout elapses', async () => {
    service = new PiiRegexWorkerService(
      createTestConfig({ taskTimeout: { asMilliseconds: () => 1 } } as any),
      logger
    );

    // (?=a)(a+)+$ falls back to native RegExp (RE2 rejects the lookahead) and
    // backtracks catastrophically on a long all-'a' string — guaranteed timeout.
    await expect(
      service.run({
        rules: [{ entityClass: 'MISC', pattern: '(?=a)(a+)+$' }],
        records: [{ content: 'a'.repeat(10_000) + 'b' }],
      })
    ).rejects.toThrow('timed out');
  });

  describe('allow_unsafe failure mode', () => {
    it('skips the invalid rule and still returns matches from valid rules', async () => {
      service = new PiiRegexWorkerService(createTestConfig(), logger);
      const results = await service.run(
        {
          rules: [
            { entityClass: 'BAD', pattern: '(unclosed' },
            { entityClass: 'IP', pattern: '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b' },
          ],
          records: [{ content: 'connect to 10.0.0.1' }],
        },
        'allow_unsafe'
      );

      // The bad rule is skipped; the good IP rule still fires
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ entityClass: 'IP', matchValue: '10.0.0.1' });
      expect(logger.warn).toHaveBeenCalledWith(
        'PII regex rule skipped: pattern could not be compiled',
        expect.objectContaining({ entityClass: 'BAD' })
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('returns [] when every rule is invalid', async () => {
      service = new PiiRegexWorkerService(createTestConfig(), logger);
      const results = await service.run(
        {
          rules: [{ entityClass: 'BAD', pattern: '(unclosed' }],
          records: [{ content: 'test' }],
        },
        'allow_unsafe'
      );

      expect(results).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'PII regex rule skipped: pattern could not be compiled',
        expect.objectContaining({ entityClass: 'BAD' })
      );
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  it('throws when failureMode is block (default)', async () => {
    service = new PiiRegexWorkerService(createTestConfig(), logger);
    const badPayload: PiiRegexWorkerTaskPayload = {
      rules: [{ entityClass: 'BAD', pattern: '(unclosed' }],
      records: [{ content: 'test' }],
    };

    await expect(service.run(badPayload)).rejects.toThrow();
    expect(logger.error).not.toHaveBeenCalled();
  });

  describe('worker queue at capacity', () => {
    it('throws a distinct "queue at capacity" error distinguishable from rule errors', async () => {
      service = new PiiRegexWorkerService(createTestConfig(), logger);
      jest
        .spyOn((service as any).worker, 'run')
        .mockRejectedValueOnce(new Error('Task queue is at limit'));

      await expect(service.run(IP_PAYLOAD)).rejects.toThrow('queue at capacity');
    });

    it('logs and returns [] in allow_unsafe mode when queue is at capacity', async () => {
      service = new PiiRegexWorkerService(createTestConfig(), logger);
      jest
        .spyOn((service as any).worker, 'run')
        .mockRejectedValueOnce(new Error('Task queue is at limit'));

      const results = await service.run(IP_PAYLOAD, 'allow_unsafe');

      expect(results).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'PII regex detection failed; proceeding without anonymization',
        expect.objectContaining({ error: expect.anything() })
      );
    });
  });
});
