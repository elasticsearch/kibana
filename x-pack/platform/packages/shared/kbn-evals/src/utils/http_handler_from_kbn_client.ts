/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { HttpFetchOptions, HttpFetchOptionsWithPath, HttpResponse } from '@kbn/core/public';
import type { KbnClient, KbnClientRequesterError } from '@kbn/kbn-client';
import type { ToolingLog } from '@kbn/tooling-log';
import { EXECUTION_ID_BAGGAGE_KEY, EVAL_EXPERIMENT_ID_BAGGAGE_KEY } from '@kbn/inference-tracing';
import { isRetryableNetworkError } from './retry_utils';

/**
 * Adapter-local retry policy. Network retries are opt-in per call site because a transport
 * failure is outcome-ambiguous: the server may have processed the request before the
 * connection dropped. Only calls with an established replay-safety story (idempotent reads,
 * server-side deduplication, ...) should enable `onNetworkError`.
 */
export interface KbnEvalsRetryPolicy {
  /**
   * Allow retries on transient transport failures (no usable HTTP response). The retry
   * count comes from `KBN_EVALS_NETWORK_RETRIES` (default 3); the environment variable
   * supplies the budget only — it never enables retries on its own.
   */
  onNetworkError?: boolean;
}

export type KbnEvalsHttpFetchOptions = HttpFetchOptions & { retryPolicy?: KbnEvalsRetryPolicy };
export type KbnEvalsHttpFetchOptionsWithPath = HttpFetchOptionsWithPath & {
  retryPolicy?: KbnEvalsRetryPolicy;
};

/**
 * An {@link HttpHandler}-compatible function whose fetch options additionally accept the
 * adapter-local {@link KbnEvalsRetryPolicy}. Structurally assignable to `HttpHandler`, so it
 * can be used wherever the normal Core handler is expected; the `retryPolicy` option is
 * stripped before the request reaches `KbnClient.request`.
 */
export interface KbnEvalsHttpHandler {
  <TResponseBody = unknown>(
    path: string,
    options: KbnEvalsHttpFetchOptions & { asResponse: true }
  ): Promise<HttpResponse<TResponseBody>>;

  <TResponseBody = unknown>(
    options: KbnEvalsHttpFetchOptionsWithPath & { asResponse: true }
  ): Promise<HttpResponse<TResponseBody>>;

  <TResponseBody = unknown>(
    path: string,
    options?: KbnEvalsHttpFetchOptions
  ): Promise<TResponseBody>;

  <TResponseBody = unknown>(options: KbnEvalsHttpFetchOptionsWithPath): Promise<TResponseBody>;
}

// redefine args type to make it easier to handle in a type-safe way
type KbnEvalsHttpHandlerArgs =
  | [string, KbnEvalsHttpFetchOptions & { asResponse: true }]
  | [KbnEvalsHttpFetchOptionsWithPath & { asResponse: true }]
  | [string]
  | [string, KbnEvalsHttpFetchOptions?]
  | [KbnEvalsHttpFetchOptionsWithPath];

/**
 * Creates a function that matches the HttpHandler interface from Core's
 * API, using the KbnClient from @kbn/kbn-client
 */
export function httpHandlerFromKbnClient({
  kbnClient,
  log,
  getExecutionId,
  getExperimentId,
}: {
  kbnClient: KbnClient;
  log: ToolingLog;
  getExecutionId?: () => string | undefined;
  getExperimentId?: () => string | undefined;
}): KbnEvalsHttpHandler {
  const fetch: KbnEvalsHttpHandler = async (...args: KbnEvalsHttpHandlerArgs) => {
    // `retryPolicy` is an adapter-only policy: extract it here so it is never forwarded to
    // `KbnClient.request` (whose options are built field-by-field below).
    const { retryPolicy, ...options }: KbnEvalsHttpFetchOptionsWithPath =
      typeof args[0] === 'string' ? { path: args[0], ...(args[1] as any) } : args[0];
    const retryOnNetworkError = retryPolicy?.onNetworkError === true;

    const { method = 'GET', body, asResponse, rawResponse, query, signal, headers } = options;

    // Add a W3C baggage entry so Kibana can tag OTEL spans with the per-model build run ID.
    const executionId = getExecutionId?.() ?? process.env.TEST_RUN_ID;
    const nextHeaders: Record<string, string> = headers
      ? ({ ...(headers as Record<string, unknown>) } as Record<string, string>)
      : {};

    const baggageEntries: string[] = [];
    if (executionId) {
      baggageEntries.push(`${EXECUTION_ID_BAGGAGE_KEY}=${encodeURIComponent(executionId)}`);
    }
    const experimentId = getExperimentId?.();
    if (experimentId) {
      baggageEntries.push(`${EVAL_EXPERIMENT_ID_BAGGAGE_KEY}=${encodeURIComponent(experimentId)}`);
    }
    if (baggageEntries.length > 0) {
      const existingKey = Object.keys(nextHeaders).find((k) => k.toLowerCase() === 'baggage');
      const existing = existingKey ? nextHeaders[existingKey] : undefined;
      const merged = existing
        ? `${existing},${baggageEntries.join(',')}`
        : baggageEntries.join(',');
      nextHeaders[existingKey ?? 'baggage'] = merged;
    }

    const finalHeaders = Object.keys(nextHeaders).length ? nextHeaders : undefined;

    // Status and network retry budgets are independent: status retries (429/503/504) consume
    // only KBN_EVALS_HTTP_RETRIES (default 0); transport-level failures consume only
    // KBN_EVALS_NETWORK_RETRIES (default 3) and additionally require the call site to opt in
    // via `retryPolicy: { onNetworkError: true }`.
    const maxStatusRetries = Number(process.env.KBN_EVALS_HTTP_RETRIES ?? '0') || 0;
    const maxNetworkRetries = Number(process.env.KBN_EVALS_NETWORK_RETRIES ?? '0') || 0;
    const retryStatuses = new Set([429, 503, 504]);

    async function sleep(ms: number) {
      await new Promise((r) => setTimeout(r, ms));
    }

    function parseRetryAfterMsFromHeaders(
      responseHeaders: Headers | undefined
    ): number | undefined {
      const value = responseHeaders?.get('retry-after');
      if (!value) {
        return undefined;
      }

      const seconds = Number.parseInt(value, 10);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return undefined;
      }

      return seconds * 1000;
    }

    function parseRetryAfterMsFromMessage(message: string): number | undefined {
      const match = message.match(/retry after\s+(\d+)\s*seconds?/i);
      if (!match) return undefined;
      const seconds = Number(match[1]);
      if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
      return seconds * 1000;
    }

    let statusRetriesMade = 0;
    let networkRetriesMade = 0;

    // Bounded loop: every iteration returns, throws, or consumes one unit of exactly one
    // budget, so attempts are bounded by 1 + maxStatusRetries + maxNetworkRetries. A single
    // shared attempt counter is deliberately not used to decide either budget.
    while (true) {
      try {
        const response = await kbnClient.request({
          path: options.path,
          method: method as any,
          body: body && typeof body === 'string' ? JSON.parse(body) : null,
          query,
          responseType: rawResponse ? 'stream' : undefined,
          headers: finalHeaders,
          signal: signal || undefined,
          // We implement retries here so we can retry only on specific status codes.
          retries: 0,
        });
        // success
        if (asResponse) {
          // `HttpResponse.request` is required by Core's type. We don't have access to undici's
          // underlying outgoing Request, so reconstruct an equivalent stub from the inputs. Strip
          // user:pass from the URL because `new Request(...)` rejects URLs with embedded credentials
          // (same WHATWG parsing as fetch).
          const requestUrl = new URL(kbnClient.resolveUrl(options.path));
          requestUrl.username = '';
          requestUrl.password = '';

          return {
            fetchOptions: options,
            request: new Request(requestUrl, {
              method,
              headers: finalHeaders,
              signal: signal || undefined,
            }),
            body: undefined,
            response: new Response(response.data as BodyInit, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            }),
          };
        }
        return response.data as any;
      } catch (err) {
        // `kbnClient.request` only ever throws `KbnClientRequesterError`.
        const error = err as KbnClientRequesterError;

        const status = error.status;
        const statusShouldRetry =
          typeof status === 'number' &&
          retryStatuses.has(status) &&
          statusRetriesMade < maxStatusRetries;
        // Network retries are gated on the call-site opt-in: a transport failure does not
        // prove the server did not process the request, so replay safety is the caller's
        // decision. The environment variable only supplies the retry count.
        const networkShouldRetry =
          !statusShouldRetry &&
          retryOnNetworkError &&
          networkRetriesMade < maxNetworkRetries &&
          isRetryableNetworkError(error);

        if (!statusShouldRetry && !networkShouldRetry) {
          throw error;
        }

        let delayMs: number;
        if (networkShouldRetry) {
          // Exponential backoff gives Kibana time to GC/recover after an OOM-induced drop.
          // Use the network-retry counter so the delay grows correctly across multiple drops.
          const baseBackoffMs = 1000 * Math.pow(2, networkRetriesMade);
          const jitterMs = Math.floor(
            Math.random() * Math.min(1000, Math.max(100, baseBackoffMs * 0.15))
          );
          delayMs = baseBackoffMs + jitterMs;
          networkRetriesMade++;
          log.warning(
            `Network error from Kibana (no HTTP response); retrying in ${Math.round(
              delayMs / 1000
            )}s (network retry ${networkRetriesMade}/${maxNetworkRetries})`
          );
        } else {
          const retryAfterMs =
            parseRetryAfterMsFromHeaders(error.headers) ??
            parseRetryAfterMsFromMessage(error.message);

          // Exponential backoff (1s, 2s, 4s, ...) with jitter, but never sooner than retry-after.
          const baseBackoffMs = 1000 * Math.pow(2, statusRetriesMade);
          const baseDelayMs = retryAfterMs ? Math.max(baseBackoffMs, retryAfterMs) : baseBackoffMs;
          const jitterMs = Math.floor(
            Math.random() * Math.min(1000, Math.max(100, baseDelayMs * 0.15))
          );
          delayMs = baseDelayMs + jitterMs;
          statusRetriesMade++;

          log.warning(
            `HTTP ${status} from Kibana; retrying in ${Math.round(
              delayMs / 1000
            )}s (status retry ${statusRetriesMade}/${maxStatusRetries})`
          );
        }
        await sleep(delayMs);
      }
    }
  };

  return fetch;
}
