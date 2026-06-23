/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import { Subject, of } from 'rxjs';
import type { Logger } from '@kbn/core/server';
import type { CoreStart } from '@kbn/core/server';
import type { TaskScheduling } from '../../task_scheduling';
import { UiamProvisioningFeatureFlagScheduler } from './uiam_provisioning_feature_flag_scheduler';

const makeLogger = (): jest.Mocked<Logger> =>
  ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<Logger>);

const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('UiamProvisioningFeatureFlagScheduler', () => {
  const logger = makeLogger();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeCore(flag$: Observable<boolean>): CoreStart {
    return {
      featureFlags: { getBooleanValue$: jest.fn().mockReturnValue(flag$) },
    } as unknown as CoreStart;
  }

  it('reacts only to flag value changes via distinctUntilChanged', async () => {
    const flag$ = new Subject<boolean>();
    const scheduler = new UiamProvisioningFeatureFlagScheduler(logger);
    const taskScheduling = {
      ensureScheduled: jest.fn().mockResolvedValue(undefined),
    } as unknown as TaskScheduling;
    const removeIfExists = jest.fn().mockResolvedValue(undefined);

    scheduler.start({
      core: makeCore(flag$),
      taskScheduling,
      removeIfExists,
      schedule: { interval: '1d' },
    });

    flag$.next(true);
    flag$.next(true);
    flag$.next(false);
    flag$.next(false);
    await flushPromises();

    expect(taskScheduling.ensureScheduled).toHaveBeenCalledTimes(1);
    expect(removeIfExists).toHaveBeenCalledTimes(1);
  });

  it('does not call removeIfExists or log on the initial false emission', async () => {
    const scheduler = new UiamProvisioningFeatureFlagScheduler(logger);
    const taskScheduling = {
      ensureScheduled: jest.fn().mockResolvedValue(undefined),
    } as unknown as TaskScheduling;
    const removeIfExists = jest.fn().mockResolvedValue(undefined);

    scheduler.start({
      core: makeCore(of(false)),
      taskScheduling,
      removeIfExists,
      schedule: { interval: '1d' },
    });

    await flushPromises();

    expect(taskScheduling.ensureScheduled).not.toHaveBeenCalled();
    expect(removeIfExists).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('calls removeIfExists and logs info when flag emits false after true', async () => {
    const flag$ = new Subject<boolean>();
    const scheduler = new UiamProvisioningFeatureFlagScheduler(logger);
    const taskScheduling = {
      ensureScheduled: jest.fn().mockResolvedValue(undefined),
    } as unknown as TaskScheduling;
    const removeIfExists = jest.fn().mockResolvedValue(undefined);

    scheduler.start({
      core: makeCore(flag$),
      taskScheduling,
      removeIfExists,
      schedule: { interval: '1d' },
    });

    flag$.next(true);
    await flushPromises();
    flag$.next(false);
    await flushPromises();

    expect(taskScheduling.ensureScheduled).toHaveBeenCalledTimes(1);
    expect(removeIfExists).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(2);
  });

  it('does not throw and logs an error when scheduling fails', async () => {
    const flag$ = new Subject<boolean>();
    const scheduler = new UiamProvisioningFeatureFlagScheduler(logger);
    const taskScheduling = {
      ensureScheduled: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as TaskScheduling;
    const removeIfExists = jest.fn().mockResolvedValue(undefined);

    scheduler.start({
      core: makeCore(flag$),
      taskScheduling,
      removeIfExists,
      schedule: { interval: '1d' },
    });

    flag$.next(true);
    await flushPromises();

    expect(taskScheduling.ensureScheduled).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
