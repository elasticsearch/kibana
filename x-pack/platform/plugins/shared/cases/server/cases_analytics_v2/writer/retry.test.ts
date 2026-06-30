/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { withRetry } from './retry';

describe('withRetry', () => {
  it('returns immediately when the first attempt succeeds', async () => {
    const op = jest.fn().mockResolvedValue(undefined);
    await withRetry({ op, maxRetries: 3, initialDelayMs: 1 });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries up to maxRetries on failure, then succeeds', async () => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(new Error('blip 1'))
      .mockRejectedValueOnce(new Error('blip 2'))
      .mockResolvedValue(undefined);

    await withRetry({ op, maxRetries: 3, initialDelayMs: 1 });
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('throws the final error when retries are exhausted', async () => {
    const op = jest.fn().mockRejectedValue(new Error('persistent'));
    await expect(withRetry({ op, maxRetries: 2, initialDelayMs: 1 })).rejects.toThrow('persistent');
    // 1 initial + 2 retries = 3 total attempts.
    expect(op).toHaveBeenCalledTimes(3);
  });
});
