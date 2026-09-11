/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolingLog } from '@kbn/tooling-log';
import { httpHandlerFromKbnClient } from './http_handler_from_kbn_client';

/**
 * A dead transport arrives with no HTTP status, so the retry predicate used to
 * skip it entirely: glm-5-2 lost 19 of 21 examples 58 minutes into a sweep when
 * Kibana stopped answering and every remaining call failed as
 * `Status: N/A, Cause: fetch failed`.
 */
describe('httpHandlerFromKbnClient transport retries', () => {
  const log = new ToolingLog({ level: 'silent', writeTo: process.stdout });

  const makeError = (message: string, status?: number) =>
    Object.assign(new Error(message), { status, headers: undefined });

  const kbnClient = (request: jest.Mock) => ({ request } as never);

  beforeEach(() => {
    process.env.KBN_EVALS_HTTP_RETRIES = '2';
  });

  afterEach(() => {
    delete process.env.KBN_EVALS_HTTP_RETRIES;
    delete process.env.KBN_EVALS_HTTP_TIMEOUT_MS;
  });

  it('retries a status-less "fetch failed" and succeeds', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeError('request failed -- Status: N/A, Cause: fetch failed'))
      .mockResolvedValueOnce({ data: { ok: true }, status: 200, statusText: 'OK', headers: {} });

    const handler = httpHandlerFromKbnClient({ kbnClient: kbnClient(request), log });
    await handler('/api/agent_builder/converse', { method: 'POST' });

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('retries a socket hang up', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(makeError('socket hang up'))
      .mockResolvedValueOnce({ data: {}, status: 200, statusText: 'OK', headers: {} });

    const handler = httpHandlerFromKbnClient({ kbnClient: kbnClient(request), log });
    await handler('/api/agent_builder/converse', { method: 'POST' });

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a status-less programming error', async () => {
    const request = jest.fn().mockRejectedValue(new TypeError('x.map is not a function'));

    const handler = httpHandlerFromKbnClient({ kbnClient: kbnClient(request), log });
    await expect(handler('/api/agent_builder/converse', { method: 'POST' })).rejects.toThrow(
      'x.map is not a function'
    );

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('still retries a 503 and still refuses a 400', async () => {
    const ok = { data: {}, status: 200, statusText: 'OK', headers: {} };
    const retried = jest
      .fn()
      .mockRejectedValueOnce(makeError('service unavailable', 503))
      .mockResolvedValueOnce(ok);
    const handler = httpHandlerFromKbnClient({ kbnClient: kbnClient(retried), log });
    await handler('/api/x', { method: 'POST' });
    expect(retried).toHaveBeenCalledTimes(2);

    const refused = jest.fn().mockRejectedValue(makeError('bad request', 400));
    const handler2 = httpHandlerFromKbnClient({ kbnClient: kbnClient(refused), log });
    await expect(handler2('/api/x', { method: 'POST' })).rejects.toThrow('bad request');
    expect(refused).toHaveBeenCalledTimes(1);
  });
  it('retries an EIS-shaped 500 and still refuses a 501', async () => {
    // EIS surfaces transient upstream provider faults as a Kibana 500, not a 503.
    // On 2026-09-02 this exact shape failed 21/21 examples on two VMs at the same
    // repetition because 500 was absent from retryStatuses.
    const ok = { data: {}, status: 200, statusText: 'OK', headers: {} };
    const eisFault = jest
      .fn()
      .mockRejectedValueOnce(
        makeError(
          'Received a server error status code for request from inference entity id ' +
            '[.anthropic-claude-4.7-opus-chat_completion] status [500]. Error message: [Internal error]',
          500
        )
      )
      .mockResolvedValueOnce(ok);
    const handler = httpHandlerFromKbnClient({ kbnClient: kbnClient(eisFault), log });
    await handler('/api/agent_builder/converse', { method: 'POST' });
    expect(eisFault).toHaveBeenCalledTimes(2);

    // 501 is a real "server will never do this" — must stay terminal so a genuine
    // bug is not retried into a slow failure.
    const refused = jest.fn().mockRejectedValue(makeError('not implemented', 501));
    const handler2 = httpHandlerFromKbnClient({ kbnClient: kbnClient(refused), log });
    await expect(handler2('/api/x', { method: 'POST' })).rejects.toThrow('not implemented');
    expect(refused).toHaveBeenCalledTimes(1);
  });
  it('aborts a hung request and retries it', async () => {
    process.env.KBN_EVALS_HTTP_RETRIES = '1';
    process.env.KBN_EVALS_HTTP_TIMEOUT_MS = '150';
    let calls = 0;
    const request = jest.fn().mockImplementation(async ({ signal }: { signal?: AbortSignal }) => {
      calls += 1;
      if (calls === 1) {
        // Never resolves on its own -- only the timeout signal ends it.
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const err: any = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      return { data: { ok: true } };
    });

    const handler = httpHandlerFromKbnClient({ kbnClient: { request } as any, log });
    const result = await handler({ path: '/api/agent_builder/converse', method: 'POST' } as any);

    expect(result).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('bounds a hung request even when KBN_EVALS_HTTP_TIMEOUT_MS is unset', async () => {
    // The wedge shape: with the old `?? '0'` default no AbortController was built, so
    // nothing could abort and the attempt parked forever. Assert a controller reaches
    // the request rather than waiting out the real 1,500,000ms default.
    delete process.env.KBN_EVALS_HTTP_TIMEOUT_MS;
    const request = jest.fn().mockResolvedValue({ data: { ok: true } });

    const handler = httpHandlerFromKbnClient({ kbnClient: kbnClient(request), log });
    await handler({ path: '/api/agent_builder/converse', method: 'POST' } as any);

    const { signal } = request.mock.calls[0][0];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('keeps the timeout active when the caller supplies its own signal', async () => {
    // `signal || timeoutController?.signal` returned the caller's signal and discarded
    // the timeout, so the abort timer fired into nothing and the hang came back.
    process.env.KBN_EVALS_HTTP_RETRIES = '1';
    process.env.KBN_EVALS_HTTP_TIMEOUT_MS = '150';
    const callerController = new AbortController();
    let calls = 0;

    const request = jest.fn().mockImplementation(async ({ signal }: { signal?: AbortSignal }) => {
      calls += 1;
      if (calls === 1) {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const err: any = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      return { data: { ok: true } };
    });

    const handler = httpHandlerFromKbnClient({ kbnClient: kbnClient(request), log });
    const result = await handler({
      path: '/api/agent_builder/converse',
      method: 'POST',
      signal: callerController.signal,
    } as any);

    // The caller never aborted; only the timeout did, and it still took effect.
    expect(callerController.signal.aborted).toBe(false);
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  /**
   * Regression gate for the too-eager retry window. On sweep-1788696599-g53
   * (2026-09-06) Kibana went unreachable and two examples burned all four
   * attempts in SEVEN SECONDS (1s + 2s + 4s), losing work that costs ~5
   * minutes per example while the endpoint recovered minutes later. Retry
   * patience must be proportional to the cost of the work it protects.
   */
  it('waits at least 30s once the cheap early attempts are exhausted', async () => {
    process.env.KBN_EVALS_HTTP_RETRIES = '4';
    const delays: number[] = [];
    const realSetTimeout = global.setTimeout;
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number
    ) => {
      // Record backoff sleeps, then fire immediately so the test stays fast.
      // The request timeout uses a multi-minute bound; only short sleeps are
      // backoff. Firing it would abort the request under test, so leave the
      // timeout handle pending instead.
      if (typeof ms === 'number' && ms < 1_000_000) {
        delays.push(ms);
        return realSetTimeout(fn, 0);
      }
      return realSetTimeout(() => {}, 0);
    }) as never);

    try {
      const request = jest
        .fn()
        .mockRejectedValue(makeError('request failed -- Status: N/A, Cause: fetch failed'));

      const handler = httpHandlerFromKbnClient({ kbnClient: kbnClient(request), log });
      await expect(
        handler('/api/agent_builder/converse', { method: 'POST' })
      ).rejects.toBeDefined();

      // Attempts 0 and 1 stay cheap; from attempt 2 the floor holds at 30s.
      expect(delays.length).toBe(4);
      expect(delays[0]).toBeLessThan(2_000);
      expect(delays[1]).toBeLessThan(3_000);
      expect(delays[2]).toBeGreaterThanOrEqual(30_000);
      expect(delays[3]).toBeGreaterThanOrEqual(30_000);

      // The whole window must outlast a real outage, not seven seconds.
      const total = delays.reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(60_000);
    } finally {
      spy.mockRestore();
    }
  });
});
