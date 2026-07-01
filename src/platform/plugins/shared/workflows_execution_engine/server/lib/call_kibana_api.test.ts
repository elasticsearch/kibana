/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart, KibanaRequest } from '@kbn/core/server';
import {
  callKibanaApi,
  CallKibanaApiResponseTooLargeError,
  KibanaApiCallError,
} from './call_kibana_api';
import { toExecutionError } from '../step/errors';

const originalFetch = global.fetch;
const mockedFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

beforeAll(() => {
  global.fetch = mockedFetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

function createMockReadableStream(payload: Uint8Array) {
  let consumed = false;
  return {
    getReader: () => ({
      read: async () => {
        if (consumed) return { done: true, value: undefined };
        consumed = true;
        return { done: false, value: payload };
      },
      releaseLock: () => {},
      cancel: jest.fn(),
    }),
  } as unknown as ReadableStream<Uint8Array>;
}

function createMockResponse({
  body,
  status = 200,
  contentType = 'application/json',
}: {
  body: unknown;
  status?: number;
  contentType?: string | null;
}): Response {
  const headers = new Headers();
  if (contentType !== null) {
    headers.set('content-type', contentType);
  }
  let payload: Uint8Array;
  if (body instanceof Uint8Array) {
    payload = body;
  } else if (typeof body === 'string') {
    payload = new TextEncoder().encode(body);
  } else {
    payload = new TextEncoder().encode(JSON.stringify(body));
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    body: createMockReadableStream(payload),
  } as unknown as Response;
}

function createFakeRequest({
  headers = {},
  isInternalApiRequest = false,
}: {
  headers?: Record<string, string>;
  isInternalApiRequest?: boolean;
} = {}): KibanaRequest {
  return {
    headers: {
      authorization: 'ApiKey test-key',
      ...headers,
    },
    isInternalApiRequest,
  } as unknown as KibanaRequest;
}

function createCoreStart(publicBaseUrl = 'https://kibana.example.com'): CoreStart {
  return {
    http: {
      basePath: { publicBaseUrl },
    },
  } as unknown as CoreStart;
}

describe('callKibanaApi', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('builds the URL with query parameters and forwards method', async () => {
    mockedFetch.mockResolvedValue(createMockResponse({ body: { ok: true } }));

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      {
        method: 'GET',
        path: '/api/cases/_find',
        query: { perPage: 20, owner: 'cases', skip: undefined },
      }
    );

    const [url, init] = mockedFetch.mock.calls[0];
    expect(url).toBe('https://kibana.example.com/api/cases/_find?perPage=20&owner=cases');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).body).toBeUndefined();
  });

  it('serializes the body as JSON for POST', async () => {
    mockedFetch.mockResolvedValue(createMockResponse({ body: { id: 'abc' } }));

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      {
        method: 'POST',
        path: '/api/cases',
        body: { title: 'Test', owner: 'cases' },
      }
    );

    const [, init] = mockedFetch.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect((init as RequestInit).body).toBe(JSON.stringify({ title: 'Test', owner: 'cases' }));
  });

  it('propagates Authorization from the fake request', async () => {
    mockedFetch.mockResolvedValue(createMockResponse({ body: { ok: true } }));

    await callKibanaApi(
      {
        fakeRequest: createFakeRequest({ headers: { authorization: 'ApiKey caller-key' } }),
        coreStart: createCoreStart(),
      },
      { method: 'GET', path: '/api/status' }
    );

    const [, init] = mockedFetch.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('ApiKey caller-key');
  });

  it('throws when the fake request has no Authorization header', async () => {
    await expect(
      callKibanaApi(
        {
          fakeRequest: { headers: {}, isInternalApiRequest: false } as unknown as KibanaRequest,
          coreStart: createCoreStart(),
        },
        { method: 'GET', path: '/api/status' }
      )
    ).rejects.toThrow(/missing Authorization header/);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('always sets x-elastic-internal-origin to Kibana', async () => {
    mockedFetch.mockResolvedValue(createMockResponse({ body: { ok: true } }));

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/status' }
    );

    const [, init] = mockedFetch.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-elastic-internal-origin']).toBe('Kibana');
  });

  it('injects event-chain headers from the fake request and workflow run id', async () => {
    mockedFetch.mockResolvedValue(createMockResponse({ body: { ok: true } }));

    await callKibanaApi(
      {
        fakeRequest: createFakeRequest({
          headers: {
            authorization: 'ApiKey k',
            'x-elastic-internal-origin': 'Kibana',
            'x-kibana-event-chain-depth': '2',
            'x-kibana-event-chain-source-execution-id': 'src-exec',
          },
          isInternalApiRequest: true,
        }),
        coreStart: createCoreStart(),
        workflowRunId: 'run-42',
      },
      { method: 'GET', path: '/api/status' }
    );

    const [, init] = mockedFetch.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-kibana-event-chain-depth']).toBe('2');
    expect(headers['x-kibana-event-chain-source-execution-id']).toBe('src-exec');
    expect(headers['x-kibana-workflow-execution-id']).toBe('run-42');
  });

  it('drops caller-supplied reserved headers but keeps custom ones', async () => {
    mockedFetch.mockResolvedValue(createMockResponse({ body: { ok: true } }));

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      {
        method: 'POST',
        path: '/api/foo',
        body: { a: 1 },
        headers: {
          Authorization: 'Bearer attacker',
          'content-type': 'text/plain',
          'x-elastic-internal-origin': 'spoof',
          'x-kibana-event-chain-depth': '99',
          'x-custom-trace-id': 'trace-1',
        },
      }
    );

    const [, init] = mockedFetch.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('ApiKey test-key');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['x-elastic-internal-origin']).toBe('Kibana');
    expect(headers['x-kibana-event-chain-depth']).toBeUndefined();
    expect(headers['x-custom-trace-id']).toBe('trace-1');
  });

  it('throws a KibanaApiCallError with the unchanged HTTP <status>: <body> message on non-2xx', async () => {
    mockedFetch.mockResolvedValue(
      createMockResponse({ body: { message: 'forbidden' }, status: 403 })
    );

    await expect(
      callKibanaApi(
        { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
        { method: 'GET', path: '/api/forbidden' }
      )
    ).rejects.toThrow('HTTP 403: {"message":"forbidden"}');
  });

  it('exposes parsed status, headers, and body on the thrown KibanaApiCallError', async () => {
    const response = createMockResponse({
      body: { attributes: { summary: { failed: 1 }, results: { updated: [{ id: 'r1' }] } } },
      status: 500,
    });
    response.headers.set('x-trace-id', 'trace-err');
    mockedFetch.mockResolvedValue(response);

    expect.assertions(5);
    try {
      await callKibanaApi(
        { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
        { method: 'POST', path: '/api/detection_engine/rules/_bulk_action' }
      );
    } catch (err) {
      expect(err).toBeInstanceOf(KibanaApiCallError);
      const error = err as KibanaApiCallError;
      expect(error.status).toBe(500);
      expect(error.headers['x-trace-id']).toBe('trace-err');
      expect(error.body).toEqual({
        attributes: { summary: { failed: 1 }, results: { updated: [{ id: 'r1' }] } },
      });
      // message stays byte-compatible with the previous behavior
      expect(error.message).toBe(
        `HTTP 500: ${JSON.stringify({
          attributes: { summary: { failed: 1 }, results: { updated: [{ id: 'r1' }] } },
        })}`
      );
    }
  });

  it('does not truncate the recovered error body at the old 1 MB cap', async () => {
    // ~2 MB JSON body, well above the previous hard-coded 1 MB error-body cap.
    const updated = Array.from({ length: 20000 }, (_, i) => ({
      id: `rule-${i}`,
      status: 'failed',
    }));
    const largeBody = { attributes: { results: { updated } } };
    mockedFetch.mockResolvedValue(createMockResponse({ body: largeBody, status: 500 }));

    expect.assertions(2);
    try {
      await callKibanaApi(
        { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
        { method: 'POST', path: '/api/detection_engine/rules/_bulk_action' }
      );
    } catch (err) {
      const error = err as KibanaApiCallError;
      // Full structured body is parseable (not a truncated string) and complete.
      expect((error.body as typeof largeBody).attributes.results.updated).toHaveLength(20000);
      expect(error.body).toEqual(largeBody);
    }
  });

  it('throws CallKibanaApiResponseTooLargeError when an error body exceeds maxResponseBytes', async () => {
    const payload = new TextEncoder().encode(JSON.stringify({ message: 'x'.repeat(2048) }));
    mockedFetch.mockResolvedValue(createMockResponse({ body: payload, status: 500 }));

    await expect(
      callKibanaApi(
        { fakeRequest: createFakeRequest(), coreStart: createCoreStart(), maxResponseBytes: 256 },
        { method: 'GET', path: '/api/boom' }
      )
    ).rejects.toBeInstanceOf(CallKibanaApiResponseTooLargeError);
  });

  it('normalizes to type/message/details:{status} via toExecutionError, never body/headers (ES guard)', async () => {
    mockedFetch.mockResolvedValue(
      createMockResponse({ body: { secret: 'do-not-persist', big: 'x'.repeat(100) }, status: 500 })
    );

    expect.assertions(5);
    try {
      await callKibanaApi(
        { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
        { method: 'GET', path: '/api/boom' }
      );
    } catch (err) {
      // The engine normalizes a thrown KibanaApiCallError via `toExecutionError` (not the generic
      // `fromError`), lifting only the safe scalar `status` into `details`.
      const serialized = toExecutionError(err as Error).toSerializableObject();
      expect(serialized.type).toBe('KibanaApiCallError');
      expect(serialized.details).toEqual({ status: 500 });
      expect(serialized as Record<string, unknown>).not.toHaveProperty('body');
      expect(serialized as Record<string, unknown>).not.toHaveProperty('headers');
      // The raw body must not leak into the persisted `details`.
      expect(JSON.stringify(serialized.details)).not.toContain('do-not-persist');
    }
  });

  it('returns body {} for 204 No Content', async () => {
    mockedFetch.mockResolvedValue(createMockResponse({ body: '', status: 204 }));

    const result = await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'DELETE', path: '/api/foo/1' }
    );

    expect(result.status).toBe(204);
    expect(result.body).toEqual({});
  });

  it('returns body {} for 304 Not Modified', async () => {
    mockedFetch.mockResolvedValue(createMockResponse({ body: '', status: 304 }));

    const result = await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/foo' }
    );

    expect(result.status).toBe(304);
    expect(result.body).toEqual({});
  });

  it('parses JSON content types into objects', async () => {
    mockedFetch.mockResolvedValue(
      createMockResponse({ body: { id: '1', value: 'ok' }, contentType: 'application/json' })
    );

    const result = await callKibanaApi<{ id: string; value: string }>(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/foo' }
    );

    expect(result.body).toEqual({ id: '1', value: 'ok' });
  });

  it('returns a string when text content cannot be parsed as JSON', async () => {
    mockedFetch.mockResolvedValue(
      createMockResponse({ body: 'plain text response', contentType: 'text/plain' })
    );

    const result = await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/foo' }
    );

    expect(result.body).toBe('plain text response');
  });

  it('returns a Buffer for binary content types', async () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03, 0xff]);
    mockedFetch.mockResolvedValue(
      createMockResponse({ body: bytes, contentType: 'application/octet-stream' })
    );

    const result = await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/blob' }
    );

    expect(Buffer.isBuffer(result.body)).toBe(true);
    expect(Buffer.from(bytes).equals(result.body as Buffer)).toBe(true);
  });

  it('forwards the abort signal to fetch', async () => {
    mockedFetch.mockResolvedValue(createMockResponse({ body: { ok: true } }));
    const controller = new AbortController();

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/foo', signal: controller.signal }
    );

    const [, init] = mockedFetch.mock.calls[0];
    expect((init as RequestInit).signal).toBe(controller.signal);
  });

  it('throws CallKibanaApiResponseTooLargeError when body exceeds maxResponseBytes', async () => {
    const payload = new Uint8Array(1024);
    mockedFetch.mockResolvedValue(
      createMockResponse({ body: payload, contentType: 'application/octet-stream' })
    );

    await expect(
      callKibanaApi(
        {
          fakeRequest: createFakeRequest(),
          coreStart: createCoreStart(),
          maxResponseBytes: 256,
        },
        { method: 'GET', path: '/api/blob' }
      )
    ).rejects.toBeInstanceOf(CallKibanaApiResponseTooLargeError);
  });

  it('returns the response status and headers', async () => {
    const response = createMockResponse({ body: { ok: true } });
    response.headers.set('x-trace-id', 'trace-xyz');
    mockedFetch.mockResolvedValue(response);

    const result = await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/foo' }
    );

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('application/json');
    expect(result.headers['x-trace-id']).toBe('trace-xyz');
  });
});
