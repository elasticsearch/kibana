/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AxiosInstance } from 'axios';
import { createFetchFromAxios } from './create_fetch_from_axios';

const makeNodeStream = () => {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    on(event: string, listener: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(listener);
      return this;
    },
    destroy: jest.fn(),
  } as unknown as NodeJS.ReadableStream;
};

const makeAxiosResponse = (overrides: Record<string, unknown> = {}) => ({
  status: 200,
  statusText: 'OK',
  headers: {},
  data: null,
  ...overrides,
});

describe('createFetchFromAxios', () => {
  let mockRequest: jest.Mock;
  let fetch: ReturnType<typeof createFetchFromAxios>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockRequest = jest.fn();
    fetch = createFetchFromAxios({ request: mockRequest } as unknown as AxiosInstance);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('GET (SSE stream channel)', () => {
    it('makes a streaming axios request', async () => {
      mockRequest.mockResolvedValue(makeAxiosResponse({ data: makeNodeStream() }));

      const response = await fetch('https://example.com/mcp', { method: 'GET' });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET', responseType: 'stream' })
      );
      expect(response.status).toBe(200);
    });

    it('defaults to GET when no method is provided', async () => {
      mockRequest.mockResolvedValue(makeAxiosResponse({ data: makeNodeStream() }));

      await fetch('https://example.com/mcp');

      expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET' }));
    });

    it('accepts a URL object', async () => {
      mockRequest.mockResolvedValue(makeAxiosResponse({ data: makeNodeStream() }));

      await fetch(new URL('https://example.com/mcp'), { method: 'GET' });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com/mcp' })
      );
    });

    it('forwards response headers', async () => {
      mockRequest.mockResolvedValue(
        makeAxiosResponse({
          data: makeNodeStream(),
          headers: { 'content-type': 'text/event-stream', 'x-multi': ['a', 'b'] },
        })
      );

      const response = await fetch('https://example.com/mcp', { method: 'GET' });

      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.headers.get('x-multi')).toBe('a, b');
    });

    it('skips null and undefined header values', async () => {
      mockRequest.mockResolvedValue(
        makeAxiosResponse({
          data: makeNodeStream(),
          headers: { 'x-present': 'yes', 'x-null': null, 'x-undefined': undefined },
        })
      );

      const response = await fetch('https://example.com/mcp', { method: 'GET' });

      expect(response.headers.get('x-present')).toBe('yes');
      expect(response.headers.get('x-null')).toBeNull();
      expect(response.headers.get('x-undefined')).toBeNull();
    });
  });

  describe('non-GET (tool calls)', () => {
    it('makes a buffered arraybuffer request', async () => {
      mockRequest.mockResolvedValue(makeAxiosResponse({ data: Buffer.from('{}') }));

      const response = await fetch('https://example.com/mcp', {
        method: 'POST',
        body: '{"jsonrpc":"2.0"}',
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          responseType: 'arraybuffer',
          data: '{"jsonrpc":"2.0"}',
        })
      );
      expect(response.status).toBe(200);
    });

    it('passes through arbitrary methods (DELETE, PUT, etc.)', async () => {
      mockRequest.mockResolvedValue(makeAxiosResponse({ data: Buffer.from('') }));

      await fetch('https://example.com/mcp', { method: 'DELETE' });

      expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'DELETE' }));
    });

    it('forwards response headers', async () => {
      mockRequest.mockResolvedValue(
        makeAxiosResponse({
          data: Buffer.from(''),
          headers: { 'content-type': 'application/json', 'x-multi': ['c', 'd'] },
        })
      );

      const response = await fetch('https://example.com/mcp', { method: 'POST' });

      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.get('x-multi')).toBe('c, d');
    });
  });

  describe('sseReady gate', () => {
    it('does not block when no gate is active (no prior 202)', async () => {
      mockRequest.mockResolvedValue(makeAxiosResponse({ data: Buffer.from('{}') }));

      await fetch('https://example.com/mcp', { method: 'POST' });

      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('creates a gate on a 202 response and blocks the next POST', async () => {
      mockRequest
        .mockResolvedValueOnce(makeAxiosResponse({ status: 202, data: null }))
        .mockResolvedValueOnce(makeAxiosResponse({ data: Buffer.from('{}') }));

      await fetch('https://example.com/mcp', { method: 'POST' }); // init → 202, gate created

      const toolCall = fetch('https://example.com/mcp', { method: 'POST' });
      // Gate is active — second axios call has not been made yet
      expect(mockRequest).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5000); // advance past SSE_READY_TIMEOUT_MS
      await toolCall;

      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('resolves the gate when the GET SSE channel opens', async () => {
      mockRequest
        .mockResolvedValueOnce(makeAxiosResponse({ status: 202, data: null })) // POST init
        .mockResolvedValueOnce(makeAxiosResponse({ data: makeNodeStream() })) // GET SSE
        .mockResolvedValueOnce(makeAxiosResponse({ data: Buffer.from('{}') })); // POST tool-call

      await fetch('https://example.com/mcp', { method: 'POST' }); // creates gate

      const toolCall = fetch('https://example.com/mcp', { method: 'POST' }); // gated
      expect(mockRequest).toHaveBeenCalledTimes(1);

      await fetch('https://example.com/mcp', { method: 'GET' }); // resolves gate
      await toolCall;

      expect(mockRequest).toHaveBeenCalledTimes(3);
    });

    it('falls through after SSE_READY_TIMEOUT_MS when GET never arrives', async () => {
      mockRequest
        .mockResolvedValueOnce(makeAxiosResponse({ status: 202, data: null }))
        .mockResolvedValueOnce(makeAxiosResponse({ data: Buffer.from('{}') }));

      await fetch('https://example.com/mcp', { method: 'POST' });

      const toolCall = fetch('https://example.com/mcp', { method: 'POST' });
      jest.advanceTimersByTime(5000);
      await toolCall;

      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('falls through immediately when the abort signal is already set', async () => {
      mockRequest
        .mockResolvedValueOnce(makeAxiosResponse({ status: 202, data: null }))
        .mockResolvedValueOnce(makeAxiosResponse({ data: Buffer.from('{}') }));

      await fetch('https://example.com/mcp', { method: 'POST' });

      const controller = new AbortController();
      controller.abort();

      await fetch('https://example.com/mcp', {
        method: 'POST',
        signal: controller.signal,
      });

      expect(mockRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('header normalization', () => {
    it('accepts a Headers instance', async () => {
      mockRequest.mockResolvedValue(makeAxiosResponse({ data: Buffer.from('') }));

      await fetch('https://example.com/mcp', {
        method: 'POST',
        headers: new Headers({ authorization: 'Bearer token' }),
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ headers: { authorization: 'Bearer token' } })
      );
    });

    it('accepts an array of pairs', async () => {
      mockRequest.mockResolvedValue(makeAxiosResponse({ data: Buffer.from('') }));

      await fetch('https://example.com/mcp', {
        method: 'POST',
        headers: [['authorization', 'Bearer token']],
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ headers: { authorization: 'Bearer token' } })
      );
    });

    it('accepts a plain object', async () => {
      mockRequest.mockResolvedValue(makeAxiosResponse({ data: Buffer.from('') }));

      await fetch('https://example.com/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer token' },
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ headers: { authorization: 'Bearer token' } })
      );
    });

    it('passes undefined headers to axios when none provided', async () => {
      mockRequest.mockResolvedValue(makeAxiosResponse({ data: Buffer.from('') }));

      await fetch('https://example.com/mcp', { method: 'POST' });

      expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ headers: undefined }));
    });
  });
});
