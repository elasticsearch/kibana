/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { awaitCancellation, ExecutionFailure } from './execution_failure';

describe('execution integrity failure', () => {
  afterEach(() => jest.useRealTimers());

  it('aborts all subscribers once and preserves the first failure', () => {
    const failure = new ExecutionFailure();
    const abort = jest.fn();
    failure.signal.addEventListener('abort', abort);
    const first = failure.fail('checkpoint unavailable');
    expect(failure.fail('cleanup failed')).toBe(first);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(() => failure.throwIfFailed()).toThrow(first);
  });

  it('stops a permanently hung cancellation after the grace period', async () => {
    jest.useFakeTimers();
    const failure = new ExecutionFailure();
    const waiting = awaitCancellation(new Promise<void>(() => {}), 100, failure);
    await jest.advanceTimersByTimeAsync(99);
    expect(failure.error).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1);
    await waiting;
    expect(failure.signal.aborted).toBe(true);
    expect(failure.error?.message).toContain('100ms');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('allows cooperative cancellation without failing the workflow', async () => {
    jest.useFakeTimers();
    const failure = new ExecutionFailure();
    await awaitCancellation(Promise.resolve(), 100, failure);
    expect(failure.error).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
});
