/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/kbn-client';
import type { ToolingLog } from '@kbn/tooling-log';
import { httpHandlerFromKbnClient } from './http_handler_from_kbn_client';

// Mirrors the real `KbnClientRequesterError` shape used inside the handler.
function makeKbnRequesterError(message: string, opts: { status?: number; cause?: unknown } = {}) {
  return Object.assign(new Error(message), {
    name: 'KbnClientRequesterError',
    ...(opts.status !== undefined ? { status: opts.status } : {}),
    ...(opts.cause !== undefined ? { cause: opts.cause } : {}),
  });
}

function createLog() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  } as unknown as ToolingLog & { warning: jest.Mock; error: jest.Mock };
}

function createKbnClient(requestFn: jest.Mock): KbnClient {
  return {
    request: requestFn,
    resolveUrl: (p: string) => `http://localhost:5620${p}`,
  } as unknown as KbnClient;
}

describe('httpHandlerFromKbnClient — connection-drop retry', () => {
  const originalEnv = { ...process.env };
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    // Make all sleep() calls instant so tests don't slow down for the exponential backoff.
    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
      fn();
      return 0 as any;
    });

    process.env.KBN_EVALS_NETWORK_RETRIES = '2'; // 2 retries → 3 total attempts
    process.env.KBN_EVALS_HTTP_RETRIES = '0';
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  function makeFetch(request: jest.Mock) {
    const log = createLog();
    const kbnClient = createKbnClient(request);
    const fetch = httpHandlerFromKbnClient({ kbnClient, log });
    return {
      fetch: (path = '/internal/siem_migrations/dashboards/_invoke') =>
        fetch(path, {
          method: 'POST',
          body: JSON.stringify({ connector_id: 'test' }),
          // Preserve the legacy suite's explicit network-retry behavior.
          retryPolicy: { onNetworkError: true },
        }),
      log,
    };
  }

  it('retries "fetch failed" (plain message) and succeeds on second attempt', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeKbnRequesterError('fetch failed'))
      .mockResolvedValueOnce({
        data: { result: 'ok' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

    const { fetch, log } = makeFetch(request);
    await expect(fetch()).resolves.toEqual({ result: 'ok' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(log.warning).toHaveBeenCalledWith(expect.stringMatching(/network retry/i));
  });

  it('retries when ECONNRESET is buried in error.cause', async () => {
    const cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeKbnRequesterError('fetch failed', { cause }))
      .mockResolvedValueOnce({ data: 'ok', status: 200, statusText: 'OK', headers: {} });

    const { fetch } = makeFetch(request);
    await expect(fetch()).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('retries when UND_ERR_SOCKET is buried in error.cause', async () => {
    const cause = Object.assign(new Error('Socket closed'), { code: 'UND_ERR_SOCKET' });
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeKbnRequesterError('fetch failed', { cause }))
      .mockResolvedValueOnce({ data: 'ok', status: 200, statusText: 'OK', headers: {} });

    const { fetch } = makeFetch(request);
    await expect(fetch()).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('retries "other side closed" (Kibana socket reset message)', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeKbnRequesterError('other side closed'))
      .mockResolvedValueOnce({ data: 'ok', status: 200, statusText: 'OK', headers: {} });

    const { fetch } = makeFetch(request);
    await expect(fetch()).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('exhausts network retries and re-throws last error', async () => {
    const err = makeKbnRequesterError('fetch failed');
    const request = jest.fn().mockRejectedValue(err);

    const { fetch } = makeFetch(request);
    await expect(fetch()).rejects.toBe(err);
    // networkRetries=2 → 3 total attempts (initial + 2 retries)
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry a connection drop that also carries a numeric .status', async () => {
    // A numeric status means a real HTTP response was received; not a connection drop.
    const err = makeKbnRequesterError('fetch failed', { status: 500 });
    const request = jest.fn().mockRejectedValue(err);

    const { fetch } = makeFetch(request);
    await expect(fetch()).rejects.toBe(err);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('still retries HTTP 429 via the status-retry budget', async () => {
    process.env.KBN_EVALS_HTTP_RETRIES = '1';
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeKbnRequesterError('HTTP 429', { status: 429 }))
      .mockResolvedValueOnce({ data: 'ok', status: 200, statusText: 'OK', headers: {} });

    const { fetch, log } = makeFetch(request);
    await expect(fetch()).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
    expect(log.warning).toHaveBeenCalledWith(expect.stringMatching(/HTTP 429/i));
  });

  it('should disable network-drop retries when KBN_EVALS_NETWORK_RETRIES=0', async () => {
    process.env.KBN_EVALS_NETWORK_RETRIES = '0';
    const err = makeKbnRequesterError('fetch failed');
    const request = jest.fn().mockRejectedValue(err);

    const { fetch } = makeFetch(request);
    await expect(fetch()).rejects.toBe(err);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('httpHandlerFromKbnClient — call-site-controlled retries', () => {
  const originalEnv = { ...process.env };
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
      fn();
      return 0 as any;
    });
    process.env.KBN_EVALS_NETWORK_RETRIES = '2';
    process.env.KBN_EVALS_HTTP_RETRIES = '0';
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  const createHandler = (request: jest.Mock) => {
    const log = createLog();
    const fetch = httpHandlerFromKbnClient({
      kbnClient: createKbnClient(request),
      log,
    });
    return { fetch, log };
  };

  it('should not retry network errors unless the call site opts in', async () => {
    const error = makeKbnRequesterError('fetch failed');
    const request = jest.fn().mockRejectedValue(error);
    const { fetch } = createHandler(request);

    await expect(
      fetch('/internal/siem_migrations/rules/_invoke', {
        method: 'POST',
        retryPolicy: undefined,
      })
    ).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('should retry network errors when the call site opts in', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeKbnRequesterError('fetch failed'))
      .mockResolvedValueOnce({ data: 'ok', status: 200, statusText: 'OK', headers: {} });
    const { fetch, log } = createHandler(request);

    await expect(
      fetch('/internal/siem_migrations/rules/_invoke', {
        method: 'POST',
        retryPolicy: { onNetworkError: true },
      })
    ).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
    expect(log.warning).toHaveBeenCalledWith(expect.stringMatching(/network retry/i));
  });

  it('should not forward retryPolicy to kbnClient.request', async () => {
    const request = jest.fn().mockResolvedValue({
      data: 'ok',
      status: 200,
      statusText: 'OK',
      headers: {},
    });
    const { fetch } = createHandler(request);

    await fetch('/internal/siem_migrations/rules/_invoke', {
      method: 'POST',
      retryPolicy: { onNetworkError: true },
    });

    expect(request).toHaveBeenCalledWith(
      expect.not.objectContaining({ retryPolicy: expect.anything() })
    );
  });

  it('should keep status retries enabled independently of network retry opt-in', async () => {
    process.env.KBN_EVALS_HTTP_RETRIES = '1';
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeKbnRequesterError('HTTP 429', { status: 429 }))
      .mockResolvedValueOnce({ data: 'ok', status: 200, statusText: 'OK', headers: {} });
    const { fetch } = createHandler(request);

    await expect(
      fetch('/internal/siem_migrations/rules/_invoke', { method: 'POST' })
    ).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
  });
});
