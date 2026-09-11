/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isRetryableNetworkError, withRetry } from './retry_utils';

const fastRetryOptions = { minDelayMs: 1, maxDelayMs: 2, jitter: false } as const;

function makeStatusError(status: number, message = `HTTP ${status}`) {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = status;
  return err;
}

// Mirrors the real `KbnClientRequesterError` shape: `.status` is the HTTP status code.
function makeKbnClientRequesterError(status: number, message = `HTTP ${status}`) {
  const err = new Error(message) as Error & { status: number };
  err.name = 'KbnClientRequesterError';
  err.status = status;
  return err;
}

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, fastRetryOptions);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([502, 503, 504])('retries on HTTP %s', async (status) => {
    const fn = jest.fn().mockRejectedValueOnce(makeStatusError(status)).mockResolvedValueOnce('ok');
    const result = await withRetry(fn, fastRetryOptions);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on HTTP 429 (regression)', async () => {
    const fn = jest.fn().mockRejectedValueOnce(makeStatusError(429)).mockResolvedValueOnce('ok');
    const result = await withRetry(fn, fastRetryOptions);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on HTTP 500 (treated as deterministic in this stack)', async () => {
    const err = makeStatusError(500);
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, fastRetryOptions)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on HTTP 413 (payload too large)', async () => {
    const err = makeStatusError(413, 'Payload Too Large');
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, fastRetryOptions)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 404, 409])('does NOT retry on HTTP %s', async (status) => {
    const err = makeStatusError(status);
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, fastRetryOptions)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries KbnClientRequesterError with .status', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(makeKbnClientRequesterError(503))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, fastRetryOptions);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on terminal KbnClientRequesterError status', async () => {
    const err = makeKbnClientRequesterError(413, 'Payload Too Large');
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, fastRetryOptions)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws last error after exhausting attempts on persistent 503', async () => {
    const err = makeStatusError(503);
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { ...fastRetryOptions, maxAttempts: 3 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('invokes onRetry hook between attempts', async () => {
    const onRetry = jest.fn();
    const fn = jest.fn().mockRejectedValueOnce(makeStatusError(503)).mockResolvedValueOnce('ok');
    await withRetry(fn, { ...fastRetryOptions, onRetry, label: 'upsert' });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, label: 'upsert' }));
  });
});

describe('isRetryableNetworkError', () => {
  it.each(['fetch failed', 'other side closed', 'socket hang up', 'terminated'])(
    'recognizes the top-level transport message "%s"',
    (message) => {
      expect(isRetryableNetworkError(new Error(message))).toBe(true);
    }
  );

  it.each(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'UND_ERR_SOCKET'])(
    'recognizes a transport code in the immediate cause: %s',
    (code) => {
      const cause = Object.assign(new Error('socket failure'), { code });
      expect(isRetryableNetworkError(Object.assign(new Error('fetch failed'), { cause }))).toBe(
        true
      );
    }
  );

  it('should not recognize unrelated errors', () => {
    expect(isRetryableNetworkError(new Error('request failed'))).toBe(false);
  });

  it('should not recognize errors with an HTTP status', () => {
    expect(isRetryableNetworkError(Object.assign(new Error('fetch failed'), { status: 500 }))).toBe(
      false
    );
  });

  it('should not retry caller cancellation in the immediate cause', () => {
    const cause = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    expect(isRetryableNetworkError(Object.assign(new Error('fetch failed'), { cause }))).toBe(
      false
    );
  });
});
