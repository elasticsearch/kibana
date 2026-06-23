/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server/task';
import type { DispatcherServiceContract } from './dispatcher';
import { DispatcherTaskRunner } from './task_runner';

describe('DispatcherTaskRunner', () => {
  let dispatcherService: jest.Mocked<DispatcherServiceContract>;
  let runner: DispatcherTaskRunner;
  let abortController: AbortController;

  // @ts-expect-error: not all fields are required for these tests
  const taskInstance: ConcreteTaskInstance = {
    id: 'task-1',
    params: {},
    state: {
      previousStartedAt: '2026-01-22T07:30:00.000Z',
    },
    scheduledAt: new Date('2026-01-22T07:30:00.000Z'),
    startedAt: new Date('2026-01-22T07:30:00.000Z'),
  };

  beforeEach(() => {
    dispatcherService = { run: jest.fn() };
    runner = new DispatcherTaskRunner(dispatcherService);
    abortController = new AbortController();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('run', () => {
    it('maps task state to dispatcher params', async () => {
      dispatcherService.run.mockResolvedValue({
        startedAt: new Date('2026-01-22T07:45:00.000Z'),
      });

      await runner.run({ taskInstance, abortController });

      const [params] = dispatcherService.run.mock.calls[0];
      expect(params.abortController).toBe(abortController);
      expect(params.previousStartedAt?.toISOString()).toBe('2026-01-22T07:30:00.000Z');
    });

    it('returns updated previousStartedAt in state', async () => {
      dispatcherService.run.mockResolvedValue({
        startedAt: new Date('2026-01-22T07:45:00.000Z'),
      });

      const result = await runner.run({ taskInstance, abortController });

      expect(result).toEqual({
        state: {
          previousStartedAt: '2026-01-22T07:45:00.000Z',
        },
      });
    });
  });
});
