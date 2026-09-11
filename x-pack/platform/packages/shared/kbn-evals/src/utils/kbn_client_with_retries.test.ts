/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClient } from '@kbn/kbn-client';
import { wrapKbnClientWithRetries } from './kbn_client_with_retries';

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

function createLog() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  } as unknown as ToolingLog & {
    debug: jest.Mock;
    info: jest.Mock;
    warning: jest.Mock;
    error: jest.Mock;
  };
}

const fastEnv = {
  KBN_EVALS_KBNCLIENT_MIN_DELAY_MS: '1',
  KBN_EVALS_KBNCLIENT_MAX_DELAY_MS: '2',
  KBN_EVALS_KBNCLIENT_MAX_ATTEMPTS: '3',
};

describe('wrapKbnClientWithRetries', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, fastEnv);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('retries transient 503 then succeeds', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeStatusError(503))
      .mockResolvedValueOnce({ data: 'ok' });
    const inner = { request } as unknown as KbnClient;
    const log = createLog();

    const wrapped = wrapKbnClientWithRetries({ kbnClient: inner, log });
    const result = await wrapped.request({
      path: '/x',
      method: 'POST',
    } as Parameters<KbnClient['request']>[0]);

    expect(result).toEqual({ data: 'ok' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(log.warning).toHaveBeenCalledTimes(1);
  });

  it('retries an EIS-shaped HTTP 500, inheriting the retry_utils policy', async () => {
    // Policy owned by retry_utils (RETRYABLE_SERVER_STATUSES), which this wrapper
    // delegates to; changed 2026-09-02 because EIS reports transient upstream
    // provider faults as a Kibana 500 rather than a 502/503. See retry_utils.ts.
    const err = makeStatusError(500);
    const request = jest.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');
    const inner = { request } as unknown as KbnClient;
    const log = createLog();

    const wrapped = wrapKbnClientWithRetries({ kbnClient: inner, log });

    await expect(
      wrapped.request({ path: '/x', method: 'POST' } as Parameters<KbnClient['request']>[0])
    ).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('logs distinct error and does not retry on 413', async () => {
    const err = makeStatusError(413, 'Payload Too Large');
    const request = jest.fn().mockRejectedValue(err);
    const inner = { request } as unknown as KbnClient;
    const log = createLog();

    const wrapped = wrapKbnClientWithRetries({ kbnClient: inner, log });

    await expect(
      wrapped.request({ path: '/x', method: 'POST' } as Parameters<KbnClient['request']>[0])
    ).rejects.toBe(err);
    expect(request).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toMatch(/413|payload too large/i);
  });

  it('retries KbnClientRequesterError with .status', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeKbnClientRequesterError(502))
      .mockResolvedValueOnce({ data: 'ok' });
    const inner = { request } as unknown as KbnClient;
    const log = createLog();

    const wrapped = wrapKbnClientWithRetries({ kbnClient: inner, log });
    const result = await wrapped.request({
      path: '/x',
      method: 'POST',
    } as Parameters<KbnClient['request']>[0]);

    expect(result).toEqual({ data: 'ok' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('logs distinct 413 error when status is on KbnClientRequesterError', async () => {
    const err = makeKbnClientRequesterError(413, 'Payload Too Large');
    const request = jest.fn().mockRejectedValue(err);
    const inner = { request } as unknown as KbnClient;
    const log = createLog();

    const wrapped = wrapKbnClientWithRetries({ kbnClient: inner, log });

    await expect(
      wrapped.request({ path: '/x', method: 'POST' } as Parameters<KbnClient['request']>[0])
    ).rejects.toBe(err);
    expect(request).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toMatch(/413|payload too large/i);
  });

  it('skips retries when params.retries is 0', async () => {
    const err = makeStatusError(503);
    const request = jest.fn().mockRejectedValue(err);
    const inner = { request } as unknown as KbnClient;
    const log = createLog();

    const wrapped = wrapKbnClientWithRetries({ kbnClient: inner, log });

    await expect(
      wrapped.request({
        path: '/x',
        method: 'GET',
        retries: 0,
      } as Parameters<KbnClient['request']>[0])
    ).rejects.toBe(err);
    expect(request).toHaveBeenCalledTimes(1);
    expect(log.warning).not.toHaveBeenCalled();
  });

  it('still retries when params.retries is not 0', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeStatusError(429))
      .mockResolvedValueOnce({ data: 'ok' });
    const inner = { request } as unknown as KbnClient;
    const log = createLog();

    const wrapped = wrapKbnClientWithRetries({ kbnClient: inner, log });
    const result = await wrapped.request({
      path: '/x',
      method: 'GET',
      retries: 2,
    } as Parameters<KbnClient['request']>[0]);

    expect(result).toEqual({ data: 'ok' });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
