/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { withRetry } from './retry_utils';

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

  it('retries an EIS-shaped HTTP 500 (transient upstream provider fault)', async () => {
    // Policy change 2026-09-02, overturning "500 is deterministic in this stack".
    // EIS wraps transient upstream provider faults as a Kibana 500, not a 502/503:
    //   "Received a server error status code for request from inference entity id
    //    [.anthropic-claude-4.7-opus-chat_completion] status [500]"
    // Observed: 27 such 500s per model failed 21/21 examples on two independent
    // VMs at the same repetition, discarding two good repetitions with them.
    // A truly deterministic 500 costs one extra call; a transient one cost a sweep.
    const fn = jest.fn().mockRejectedValueOnce(makeStatusError(500)).mockResolvedValueOnce('ok');
    const result = await withRetry(fn, fastRetryOptions);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up on a persistent HTTP 500 instead of retrying forever', async () => {
    const err = makeStatusError(500);
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { ...fastRetryOptions, maxAttempts: 3 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
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
