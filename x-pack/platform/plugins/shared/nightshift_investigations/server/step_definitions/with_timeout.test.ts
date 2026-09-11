/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { withTimeout } from './with_timeout';

describe('withTimeout', () => {
  it('resolves when the work finishes first', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'timed out')).resolves.toBe('ok');
  });

  it('rejects with the timeout message when the work is slow', async () => {
    await expect(withTimeout(new Promise(() => undefined), 20, 'timed out')).rejects.toThrow(
      'timed out'
    );
  });

  it('does not emit an unhandled rejection when the work fails after the timeout', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    let rejectWork: (reason: Error) => void = () => undefined;
    const work = new Promise<void>((_, reject) => {
      rejectWork = reject;
    });

    await expect(withTimeout(work, 20, 'timed out')).rejects.toThrow('timed out');
    rejectWork(new Error('late gRPC failure'));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    process.off('unhandledRejection', onUnhandled);
    expect(unhandled).toEqual([]);
  });
});
