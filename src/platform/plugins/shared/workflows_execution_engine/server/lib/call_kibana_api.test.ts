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
  deriveInternalCallerAttestation,
  HTTPAuthorizationHeader,
  markExternalUiamCredential,
} from '@kbn/core-security-server';
import {
  callKibanaApi,
  CallKibanaApiResponseTooLargeError,
  KibanaApiCallError,
} from './call_kibana_api';
import { toExecutionError } from '../step/errors';

// Core's HTTP self client is the transport. `asScoped(request).fetch(path, options)` is mocked so we
// assert what the helper hands to Core (path, query, body, the headers Core does not manage, and the
// access/rawResponse flags) and drive its response-shaping contract from the mocked raw `Response`.
const mockSelfFetch = jest.fn();
const mockAsScoped = jest.fn(() => ({ fetch: mockSelfFetch }));

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

/** Mirrors what the self client returns for `{ asResponse: true, rawResponse: true }`. */
const mockSelfResponse = (response: Response) => ({ response });

function createFakeRequest({
  headers = {},
  isInternalApiRequest = false,
  externalUiamCredential = false,
}: {
  headers?: Record<string, string>;
  isInternalApiRequest?: boolean;
  externalUiamCredential?: boolean;
} = {}): KibanaRequest {
  const request = {
    headers: {
      authorization: 'ApiKey test-key',
      ...headers,
    },
    isInternalApiRequest,
    isFakeRequest: true,
  } as unknown as KibanaRequest;

  if (externalUiamCredential) {
    markExternalUiamCredential(request);
  }

  return request;
}

/**
 * Whatever header security uses to carry the attestation is its own business, and the engine never
 * names it - so this suite picks an arbitrary one and drives the contract with it.
 */
const UIAM_ATTESTATION_HEADER = 'x-some-internal-caller-attestation';

const mockGetAttestationHeaders = jest.fn();

function createCoreStart({
  uiamAttestation,
  serverBasePath = '',
}: {
  uiamAttestation?: string;
  serverBasePath?: string;
} = {}): CoreStart {
  if (uiamAttestation) {
    mockGetAttestationHeaders.mockReturnValue({ [UIAM_ATTESTATION_HEADER]: uiamAttestation });
  }

  return {
    http: {
      basePath: {
        serverBasePath,
        prepend: jest.fn((path: string) => `${serverBasePath}${path}`),
      },
      selfClient: { asScoped: mockAsScoped },
    },
    security: {
      authc: {
        apiKeys: {
          uiam: uiamAttestation
            ? { getInternalCallerAttestationHeaders: mockGetAttestationHeaders }
            : null,
        },
      },
    },
  } as unknown as CoreStart;
}

/** Options the helper passed to the self client's `fetch` on its first (only) call. */
const lastFetchOptions = () => mockSelfFetch.mock.calls[0][1] as Record<string, any>;
const lastFetchHeaders = () => lastFetchOptions().headers as Record<string, string>;

describe('callKibanaApi', () => {
  beforeEach(() => {
    mockSelfFetch.mockReset();
    mockGetAttestationHeaders.mockReset();
    mockAsScoped.mockClear();
    mockAsScoped.mockImplementation(() => ({ fetch: mockSelfFetch }));
  });

  it('forwards the path, query, and method to the self client', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      {
        method: 'GET',
        path: '/api/cases/_find',
        query: { perPage: 20, owner: 'cases', skip: undefined },
      }
    );

    const [path, options] = mockSelfFetch.mock.calls[0];
    expect(path).toBe('/api/cases/_find');
    expect(options.method).toBe('GET');
    expect(options.query).toEqual({ perPage: 20, owner: 'cases', skip: undefined });
    expect(options.body).toBeUndefined();
  });

  it('includes the configured server base path in loopback requests', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      {
        fakeRequest: createFakeRequest(),
        coreStart: createCoreStart({ serverBasePath: '/my-base-path' }),
      },
      {
        method: 'GET',
        path: '/api/status',
      }
    );

    expect(mockSelfFetch.mock.calls[0][0]).toBe('/my-base-path/api/status');
  });

  it('delegates server base path resolution to Core', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));
    const coreStart = createCoreStart({ serverBasePath: '/configured-base-path' });
    const prependBasePath = coreStart.http.basePath.prepend as jest.Mock;
    prependBasePath.mockReturnValue('/core-resolved-base-path/api/status');

    await callKibanaApi(
      {
        fakeRequest: createFakeRequest(),
        coreStart,
      },
      {
        method: 'GET',
        path: '/api/status',
      }
    );

    expect(prependBasePath).toHaveBeenCalledWith('/api/status');
    expect(mockSelfFetch.mock.calls[0][0]).toBe('/core-resolved-base-path/api/status');
  });

  it('places a non-default space after the configured server base path', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      {
        fakeRequest: createFakeRequest(),
        coreStart: createCoreStart({ serverBasePath: '/my-base-path' }),
        spaceId: 'my-space',
      },
      {
        method: 'POST',
        path: '/api/detection_engine/signals/assignees',
        body: { assignees: ['elastic'] },
      }
    );

    expect(mockSelfFetch.mock.calls[0][0]).toBe(
      '/my-base-path/s/my-space/api/detection_engine/signals/assignees'
    );
    expect(lastFetchOptions().body).toEqual({ assignees: ['elastic'] });
  });

  // The self client resolves the base URL itself, and the workflow fake request has no base path, so
  // the space can only reach Core through the path we hand it.
  it('prefixes the path with /s/{spaceId} for a non-default space', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart(), spaceId: 'my-space' },
      { method: 'GET', path: '/api/cases/_find', query: { perPage: 20 } }
    );

    const [path, options] = mockSelfFetch.mock.calls[0];
    expect(path).toBe('/s/my-space/api/cases/_find');
    expect(options.prependBasePath).toBe(false);
  });

  it('does not prefix the path for the default space', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart(), spaceId: 'default' },
      { method: 'GET', path: '/api/cases/_find' }
    );

    expect(mockSelfFetch.mock.calls[0][0]).toBe('/api/cases/_find');
  });

  it('does not prefix the path when no space is provided', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/status' }
    );

    expect(mockSelfFetch.mock.calls[0][0]).toBe('/api/status');
  });

  it('forwards the body for POST (the self client serializes it)', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { id: 'abc' } })));

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      {
        method: 'POST',
        path: '/api/cases',
        body: { title: 'Test', owner: 'cases' },
      }
    );

    expect(lastFetchOptions().body).toEqual({ title: 'Test', owner: 'cases' });
  });

  it('scopes the self client to the fake request (so Core forwards its credential)', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));
    const fakeRequest = createFakeRequest({ headers: { authorization: 'ApiKey caller-key' } });

    await callKibanaApi(
      { fakeRequest, coreStart: createCoreStart() },
      {
        method: 'GET',
        path: '/api/status',
      }
    );

    expect(mockAsScoped).toHaveBeenCalledWith(fakeRequest);
  });

  it('requests the internal access level and a raw response', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/status' }
    );

    const options = lastFetchOptions();
    expect(options.access).toBe('internal');
    expect(options.asResponse).toBe(true);
    expect(options.rawResponse).toBe(true);
    expect(options.prependBasePath).toBe(false);
  });

  it('stamps the internal-caller attestation for an internal UIAM (essu_) credential', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      {
        fakeRequest: createFakeRequest({ headers: { authorization: 'ApiKey essu_internal_key' } }),
        coreStart: createCoreStart({ uiamAttestation: 'valid-attestation' }),
      },
      { method: 'GET', path: '/api/status' }
    );

    expect(lastFetchHeaders()[UIAM_ATTESTATION_HEADER]).toBe('valid-attestation');
  });

  it('asks for an attestation bound to the credential the request carries', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      {
        fakeRequest: createFakeRequest({ headers: { authorization: 'ApiKey essu_internal_key' } }),
        coreStart: createCoreStart({ uiamAttestation: 'valid-attestation' }),
      },
      { method: 'GET', path: '/api/status' }
    );

    expect(mockGetAttestationHeaders).toHaveBeenCalledTimes(1);
    expect(mockGetAttestationHeaders).toHaveBeenCalledWith(
      new HTTPAuthorizationHeader('ApiKey', 'essu_internal_key')
    );
  });

  it('derives a new attestation when a service-account Bearer credential is replaced', async () => {
    const fakeRequest = createFakeRequest({
      headers: { authorization: 'Bearer essu_service_account_initial' },
    });
    const coreStart = createCoreStart({ uiamAttestation: 'enabled' });
    mockGetAttestationHeaders.mockImplementation((credential: HTTPAuthorizationHeader) => ({
      [UIAM_ATTESTATION_HEADER]: deriveInternalCallerAttestation('shared-secret', credential),
    }));
    const sentAttestations: string[] = [];

    for (const token of ['essu_service_account_initial', 'essu_service_account_replacement']) {
      // The service-account registry replaces authorization on the same fake request in place.
      (fakeRequest.headers as Record<string, string>).authorization = `Bearer ${token}`;
      mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));
      await callKibanaApi({ fakeRequest, coreStart }, { method: 'GET', path: '/api/status' });
      const credential = new HTTPAuthorizationHeader('Bearer', token);
      expect(mockGetAttestationHeaders).toHaveBeenLastCalledWith(credential);
      const options = mockSelfFetch.mock.calls[sentAttestations.length][1];
      const attestation = options.headers[UIAM_ATTESTATION_HEADER];
      expect(attestation).toBe(deriveInternalCallerAttestation('shared-secret', credential));
      sentAttestations.push(attestation);
      expect(mockAsScoped).toHaveBeenLastCalledWith(fakeRequest);
    }

    expect(sentAttestations[0]).not.toBe(sentAttestations[1]);
    expect(mockGetAttestationHeaders).toHaveBeenCalledTimes(2);
  });

  it('does not stamp the attestation for a user-created (external) UIAM credential', async () => {
    // The receiving Kibana would honor the attestation and attach the UIAM shared secret to its
    // Elasticsearch calls, and UIAM rejects external keys presented with client authentication.
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      {
        fakeRequest: createFakeRequest({
          headers: { authorization: 'ApiKey essu_user_created_key' },
          externalUiamCredential: true,
        }),
        coreStart: createCoreStart({ uiamAttestation: 'valid-attestation' }),
      },
      { method: 'GET', path: '/api/status' }
    );

    expect(lastFetchHeaders()[UIAM_ATTESTATION_HEADER]).toBeUndefined();
    expect(mockGetAttestationHeaders).not.toHaveBeenCalled();
    // The credential itself still goes out; only the attestation is withheld.
    expect(mockAsScoped).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'ApiKey essu_user_created_key' }),
      })
    );
  });

  it('does not stamp the attestation for a non-UIAM credential', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      {
        fakeRequest: createFakeRequest({ headers: { authorization: 'ApiKey regular-key' } }),
        coreStart: createCoreStart({ uiamAttestation: 'valid-attestation' }),
      },
      { method: 'GET', path: '/api/status' }
    );

    expect(lastFetchHeaders()[UIAM_ATTESTATION_HEADER]).toBeUndefined();
  });

  it('does not stamp the attestation when UIAM is not enabled (no attestation available)', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      {
        fakeRequest: createFakeRequest({ headers: { authorization: 'ApiKey essu_internal_key' } }),
        coreStart: createCoreStart(),
      },
      { method: 'GET', path: '/api/status' }
    );

    expect(lastFetchHeaders()[UIAM_ATTESTATION_HEADER]).toBeUndefined();
  });

  it('ignores a caller-supplied (forged) attestation header and stamps its own', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

    await callKibanaApi(
      {
        fakeRequest: createFakeRequest({ headers: { authorization: 'ApiKey essu_internal_key' } }),
        coreStart: createCoreStart({ uiamAttestation: 'valid-attestation' }),
      },
      {
        method: 'GET',
        path: '/api/status',
        headers: { [UIAM_ATTESTATION_HEADER]: 'forged-attestation' },
      }
    );

    expect(lastFetchHeaders()[UIAM_ATTESTATION_HEADER]).toBe('valid-attestation');
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
    expect(mockSelfFetch).not.toHaveBeenCalled();
  });

  it('injects event-chain headers from the fake request and workflow run id', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

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

    const headers = lastFetchHeaders();
    expect(headers['x-kibana-event-chain-depth']).toBe('2');
    expect(headers['x-kibana-event-chain-source-execution-id']).toBe('src-exec');
    expect(headers['x-kibana-workflow-execution-id']).toBe('run-42');
  });

  it('drops caller-supplied reserved headers (Core-owned or engine-stamped) but keeps custom ones', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));

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

    const headers = lastFetchHeaders();
    // Core owns these; forwarding them would make the self client throw, so they are stripped here.
    expect(headers.Authorization).toBeUndefined();
    expect(headers['content-type']).toBeUndefined();
    expect(headers['x-elastic-internal-origin']).toBeUndefined();
    // Engine-stamped, not caller-forgeable.
    expect(headers['x-kibana-event-chain-depth']).toBeUndefined();
    // Genuinely custom headers pass through untouched.
    expect(headers['x-custom-trace-id']).toBe('trace-1');
  });

  it('throws a KibanaApiCallError with the unchanged HTTP <status>: <body> message on non-2xx', async () => {
    mockSelfFetch.mockResolvedValue(
      mockSelfResponse(createMockResponse({ body: { message: 'forbidden' }, status: 403 }))
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
    mockSelfFetch.mockResolvedValue(mockSelfResponse(response));

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
    mockSelfFetch.mockResolvedValue(
      mockSelfResponse(createMockResponse({ body: largeBody, status: 500 }))
    );

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
    mockSelfFetch.mockResolvedValue(
      mockSelfResponse(createMockResponse({ body: payload, status: 500 }))
    );

    await expect(
      callKibanaApi(
        { fakeRequest: createFakeRequest(), coreStart: createCoreStart(), maxResponseBytes: 256 },
        { method: 'GET', path: '/api/boom' }
      )
    ).rejects.toBeInstanceOf(CallKibanaApiResponseTooLargeError);
  });

  it('normalizes to type/message/details:{status} via toExecutionError, never body/headers (ES guard)', async () => {
    mockSelfFetch.mockResolvedValue(
      mockSelfResponse(
        createMockResponse({
          body: { secret: 'do-not-persist', big: 'x'.repeat(100) },
          status: 500,
        })
      )
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
    mockSelfFetch.mockResolvedValue(
      mockSelfResponse(createMockResponse({ body: '', status: 204 }))
    );

    const result = await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'DELETE', path: '/api/foo/1' }
    );

    expect(result.status).toBe(204);
    expect(result.body).toEqual({});
  });

  it('returns body {} for 304 Not Modified', async () => {
    mockSelfFetch.mockResolvedValue(
      mockSelfResponse(createMockResponse({ body: '', status: 304 }))
    );

    const result = await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/foo' }
    );

    expect(result.status).toBe(304);
    expect(result.body).toEqual({});
  });

  it('parses JSON content types into objects', async () => {
    mockSelfFetch.mockResolvedValue(
      mockSelfResponse(
        createMockResponse({ body: { id: '1', value: 'ok' }, contentType: 'application/json' })
      )
    );

    const result = await callKibanaApi<{ id: string; value: string }>(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/foo' }
    );

    expect(result.body).toEqual({ id: '1', value: 'ok' });
  });

  it('returns a string when text content cannot be parsed as JSON', async () => {
    mockSelfFetch.mockResolvedValue(
      mockSelfResponse(
        createMockResponse({ body: 'plain text response', contentType: 'text/plain' })
      )
    );

    const result = await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/foo' }
    );

    expect(result.body).toBe('plain text response');
  });

  it('returns a Buffer for binary content types', async () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03, 0xff]);
    mockSelfFetch.mockResolvedValue(
      mockSelfResponse(createMockResponse({ body: bytes, contentType: 'application/octet-stream' }))
    );

    const result = await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/blob' }
    );

    expect(Buffer.isBuffer(result.body)).toBe(true);
    expect(Buffer.from(bytes).equals(result.body as Buffer)).toBe(true);
  });

  it('forwards the abort signal to the self client', async () => {
    mockSelfFetch.mockResolvedValue(mockSelfResponse(createMockResponse({ body: { ok: true } })));
    const controller = new AbortController();

    await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/foo', signal: controller.signal }
    );

    expect(lastFetchOptions().signal).toBe(controller.signal);
  });

  it('throws CallKibanaApiResponseTooLargeError when body exceeds maxResponseBytes', async () => {
    const payload = new Uint8Array(1024);
    mockSelfFetch.mockResolvedValue(
      mockSelfResponse(
        createMockResponse({ body: payload, contentType: 'application/octet-stream' })
      )
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
    mockSelfFetch.mockResolvedValue(mockSelfResponse(response));

    const result = await callKibanaApi(
      { fakeRequest: createFakeRequest(), coreStart: createCoreStart() },
      { method: 'GET', path: '/api/foo' }
    );

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('application/json');
    expect(result.headers['x-trace-id']).toBe('trace-xyz');
  });
});
