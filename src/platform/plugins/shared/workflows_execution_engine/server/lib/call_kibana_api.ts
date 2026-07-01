/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { CoreStart, KibanaRequest } from '@kbn/core/server';
import {
  getOutboundEventChainHeaders,
  KibanaApiCallError,
  X_ELASTIC_INTERNAL_ORIGIN_REQUEST,
} from '@kbn/workflows-extensions/server';
import { getKibanaUrl } from '../utils/get_kibana_url';
import { isTextContentType, readResponseStream } from '../utils/http_response';

export { KibanaApiCallError } from '@kbn/workflows-extensions/server';

/**
 * Default cap on the response body size (bytes) when no per-step limit is supplied.
 * Matches the workflows execution engine default for `max-step-size` to keep behavior
 * consistent across the engine's two HTTP paths (this helper and the `kibana.request` step).
 */
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/**
 * Maximum number of characters of the (stringified) error body appended to the thrown
 * error's `message`. This only caps the human-readable log string; the full parsed body
 * (up to `maxResponseBytes`) is preserved on {@link KibanaApiCallError.body} for recovery.
 */
const ERROR_MESSAGE_BODY_MAX_CHARS = 1024 * 1024;

/**
 * Thrown by {@link callKibanaApi} when the response body exceeds the configured
 * size limit. Callers that need a richer (e.g. {@link ResponseSizeLimitError}-style)
 * error can `instanceof`-check this and rethrow as their own type.
 */
export class CallKibanaApiResponseTooLargeError extends Error {
  public readonly limitBytes: number;
  constructor(limitBytes: number) {
    super(`callKibanaApi: response body exceeded ${limitBytes} bytes and was truncated`);
    this.name = 'CallKibanaApiResponseTooLargeError';
    this.limitBytes = limitBytes;
  }
}

/**
 * Public input for `callKibanaApi`. Kept intentionally minimal so the implementation
 * can later swap from `global.fetch` to an in-process Kibana HTTP API without changing
 * the caller-visible API.
 */
export interface CallKibanaApiParams {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Route path starting with `/`, e.g. `/api/cases`. Space prefix is added automatically. */
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Caller-supplied headers. Cross-cutting headers (Authorization, x-elastic-internal-origin-request,
   * event-chain headers, Content-Type) are managed by the helper and cannot be overridden.
   */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface CallKibanaApiResult<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

/**
 * Dependencies the helper needs from the workflow execution engine to perform a call
 * on behalf of the running workflow.
 */
export interface CallKibanaApiDeps {
  fakeRequest: KibanaRequest;
  workflowRunId?: string;
  coreStart: CoreStart;
  cloudSetup?: CloudSetup;
  /**
   * Cap on the size of the response body in bytes. `0` disables the limit. When omitted,
   * `DEFAULT_MAX_RESPONSE_BYTES` is used.
   */
  maxResponseBytes?: number;
  /**
   * Optional override for the base Kibana URL. When supplied, this is used verbatim
   * instead of going through {@link getKibanaUrl} resolution. Used by callers that
   * already resolved a custom URL (e.g. with `use_server_info` / `use_localhost`).
   */
  baseUrlOverride?: string;
}

/**
 * Headers managed by the helper. Any caller-supplied value for these keys is dropped to keep
 * authentication, internal-origin marking, event-chain propagation, and content negotiation
 * under the engine's control.
 */
const RESERVED_HEADER_NAMES = new Set([
  'authorization',
  'content-type',
  'kbn-xsrf',
  X_ELASTIC_INTERNAL_ORIGIN_REQUEST.toLowerCase(),
  'x-kibana-event-chain-depth',
  'x-kibana-event-chain-source-execution-id',
  'x-kibana-event-chain-visited-workflows',
  'x-kibana-workflow-execution-id',
]);

const stripReservedHeaders = (
  headers: Record<string, string> | undefined
): Record<string, string> => {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!RESERVED_HEADER_NAMES.has(name.toLowerCase())) {
      out[name] = value;
    }
  }
  return out;
};

const buildQueryString = (query: CallKibanaApiParams['query']): string => {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized === '' ? '' : `?${serialized}`;
};

const getAuthorizationHeader = (request: KibanaRequest): string => {
  const value = request.headers?.authorization;
  if (typeof value === 'string' && value !== '') {
    return value;
  }
  if (Array.isArray(value) && value[0]) {
    return value[0];
  }
  throw new Error('callKibanaApi: missing Authorization header on the workflow fake request');
};

const headersToRecord = (headers: Headers | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  if (headers === undefined) {
    return out;
  }
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
};

const parseResponseBody = async (
  response: Response,
  maxResponseBytes: number
): Promise<unknown> => {
  if (response.status === 204 || response.status === 304) {
    return {};
  }
  if (!response.body) {
    return null;
  }
  const contentType = response.headers?.get('content-type') ?? null;
  const { buffer, truncated } = await readResponseStream(response, maxResponseBytes);
  if (truncated) {
    throw new CallKibanaApiResponseTooLargeError(maxResponseBytes);
  }
  if (buffer.byteLength === 0) {
    return null;
  }
  if (!isTextContentType(contentType)) {
    return buffer;
  }
  const text = buffer.toString('utf-8');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * Builds the human-readable body fragment appended to {@link KibanaApiCallError.message}.
 * Mirrors the previous `HTTP <status>: <body>` shape: objects are JSON-stringified, strings
 * are used verbatim, Buffers are decoded as UTF-8. The result is capped at
 * {@link ERROR_MESSAGE_BODY_MAX_CHARS} characters for log-safety; the full parsed value is
 * still available on {@link KibanaApiCallError.body}.
 */
const stringifyErrorBodyForMessage = (body: unknown): string => {
  if (body == null) return '';
  let text: string;
  if (typeof body === 'string') {
    text = body;
  } else if (Buffer.isBuffer(body)) {
    text = body.toString('utf-8');
  } else {
    try {
      text = JSON.stringify(body);
    } catch {
      text = String(body);
    }
  }
  return text.length > ERROR_MESSAGE_BODY_MAX_CHARS
    ? `${text.slice(0, ERROR_MESSAGE_BODY_MAX_CHARS)}... [truncated]`
    : text;
};

/**
 * Calls a Kibana HTTP route on the running Kibana instance using the workflow's fake request
 * for authentication and origin marking. Throws a {@link KibanaApiCallError} on non-2xx
 * responses (other than 304). Its `message` keeps the previous `HTTP <status>: <body>` shape,
 * and it additionally exposes the parsed `status`, `headers`, and `body` so callers can recover
 * a structured partial-success response via `try/catch` + `instanceof KibanaApiCallError`.
 *
 * This helper backs both the `kibana.request` YAML step (for its JSON-body / connector-definition
 * branches) and the `callKibanaApi` tool exposed to custom step handlers. Behavior is intentionally
 * kept narrow (no multipart, no fetcher options, no streaming) so the underlying transport can be
 * swapped to an in-process Kibana HTTP API later without changing observable behavior.
 */
export async function callKibanaApi<T = unknown>(
  deps: CallKibanaApiDeps,
  params: CallKibanaApiParams
): Promise<CallKibanaApiResult<T>> {
  const { fakeRequest, workflowRunId, coreStart, cloudSetup, baseUrlOverride } = deps;
  const maxResponseBytes = deps.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  const baseUrl = baseUrlOverride ?? getKibanaUrl(coreStart, cloudSetup);
  const url = `${baseUrl}${params.path}${buildQueryString(params.query)}`;

  const callerHeaders = stripReservedHeaders(params.headers);
  const outboundHeaders: Record<string, string> = {
    ...callerHeaders,
    Authorization: getAuthorizationHeader(fakeRequest),
    'Content-Type': 'application/json',
    'kbn-xsrf': 'true',
    [X_ELASTIC_INTERNAL_ORIGIN_REQUEST]: 'Kibana',
    ...getOutboundEventChainHeaders(fakeRequest, workflowRunId),
  };

  const requestInit: RequestInit = {
    method: params.method,
    headers: outboundHeaders,
    body: params.body != null ? JSON.stringify(params.body) : undefined,
    signal: params.signal,
  };

  const response = await fetch(url, requestInit);

  // `Response.ok` is true only for 2xx; treat 304 Not Modified as a successful response with no body
  // so callers using conditional GETs see the same shape as a 204.
  if (!response.ok && response.status !== 304) {
    // Parse the error body via the same path (and size limit) as success so step authors can
    // recover a structured partial-success response without string-parsing the message and
    // without the previous separate 1 MB cap.
    const errorBody = await parseResponseBody(response, maxResponseBytes);
    throw new KibanaApiCallError({
      status: response.status,
      headers: headersToRecord(response.headers),
      body: errorBody,
      message: `HTTP ${response.status}: ${stringifyErrorBodyForMessage(errorBody)}`,
    });
  }

  const body = (await parseResponseBody(response, maxResponseBytes)) as T;

  return {
    status: response.status,
    headers: headersToRecord(response.headers),
    body,
  };
}
