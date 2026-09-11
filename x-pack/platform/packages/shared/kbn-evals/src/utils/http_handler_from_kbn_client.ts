/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { HttpFetchOptions, HttpFetchOptionsWithPath, HttpHandler } from '@kbn/core/public';
import type { KbnClient, KbnClientRequesterError } from '@kbn/kbn-client';
import type { ToolingLog } from '@kbn/tooling-log';
import { EXECUTION_ID_BAGGAGE_KEY, EVAL_EXPERIMENT_ID_BAGGAGE_KEY } from '@kbn/inference-tracing';

// redefine args type to make it easier to handle in a type-safe way
type HttpHandlerArgs =
  | [string, HttpFetchOptions & { asResponse: true }]
  | [HttpFetchOptionsWithPath & { asResponse: true }]
  | [string]
  | [string, HttpFetchOptions?]
  | [HttpFetchOptionsWithPath];

/**
 * Creates a function that matches the HttpHandler interface from Core's
 * API, using the KbnClient from @kbn/kbn-client
 */
/**
 * Combine an optional caller signal with an optional timeout signal so an abort from
 * either one takes effect. Picking one (`a || b`) silently disables the other.
 */
function combineSignals(
  callerSignal: AbortSignal | null | undefined,
  timeoutSignal: AbortSignal | undefined
): AbortSignal | undefined {
  if (!callerSignal) return timeoutSignal;
  if (!timeoutSignal) return callerSignal;
  return AbortSignal.any([callerSignal, timeoutSignal]);
}

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
}) {
  const fetch: HttpHandler = async (...args: HttpHandlerArgs) => {
    const options: HttpFetchOptionsWithPath =
      typeof args[0] === 'string' ? { path: args[0], ...(args[1] as any) } : args[0];

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

    const maxRetries = Number(process.env.KBN_EVALS_HTTP_RETRIES ?? '0') || 0;
    // 500 belongs here: EIS surfaces transient upstream provider faults as a
    // Kibana 500 ("Received a server error status code for request from inference
    // entity id [...] status [500]"), not a 502/503. Observed 2026-09-02: a
    // provider-side blip failed 21/21 examples on two independent VMs at the same
    // repetition and discarded two good repetitions with them. These are retryable
    // by nature — a non-retryable 500 just fails again and costs one extra call.
    const retryStatuses = new Set([429, 500, 502, 503, 504]);
    // Transport-level deaths, which arrive with no HTTP status at all.
    const RETRYABLE_TRANSPORT_ERRORS =
      /fetch failed|aborted|AbortError|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|socket hang up|other side closed/i;

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

    // A hung endpoint is worse than a failing one: retries need a request that
    // FAILS, and a converse call that never returns just parks the worker in
    // ep_poll forever. Observed on 2026-08-29: a glm-5-2 run sat 45 minutes with
    // 4 seconds of CPU and six open sockets while /api/status still answered 200.
    // Bound each attempt so a dead endpoint becomes a retryable failure. Set it
    // ABOVE the slowest legitimate call: golden shows a real glm-5-2 example at
    // 1198s, so too tight a bound aborts healthy work and the retry aborts again.
    //
    // Default to a bound rather than 0. With no bound no AbortController is created,
    // so nothing can ever abort and attempt 4 parks forever: measured 2026-09-02 at
    // concurrency 1, 2 and 5 alike (Kibana 0.0% CPU, zero established sockets),
    // which is what ruled concurrency out as the cause.
    const DEFAULT_REQUEST_TIMEOUT_MS = 1_500_000;
    const rawTimeout = process.env.KBN_EVALS_HTTP_TIMEOUT_MS;
    const requestTimeoutMs =
      rawTimeout === undefined || rawTimeout === ''
        ? DEFAULT_REQUEST_TIMEOUT_MS
        : Number(rawTimeout) || 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const timeoutController = requestTimeoutMs > 0 ? new AbortController() : undefined;
      const timeoutHandle = timeoutController
        ? setTimeout(() => timeoutController.abort(), requestTimeoutMs)
        : undefined;
      try {
        const response = await kbnClient.request({
          path: options.path,
          method: method as any,
          body: body && typeof body === 'string' ? JSON.parse(body) : null,
          query,
          responseType: rawResponse ? 'stream' : undefined,
          headers: finalHeaders,
          // Compose rather than choose: `signal || timeoutController?.signal` silently
          // drops the timeout the moment a caller supplies its own signal, leaving the
          // abort timer firing into nothing and restoring the unbounded hang.
          signal: combineSignals(signal, timeoutController?.signal),
          // We implement retries here so we can retry only on specific status codes.
          retries: 0,
        });
        if (timeoutHandle) clearTimeout(timeoutHandle);
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
        if (timeoutHandle) clearTimeout(timeoutHandle);
        // `kbnClient.request` only ever throws `KbnClientRequesterError`.
        const error = err as KbnClientRequesterError;
        const status = error.status;

        lastError = error;

        // A dead transport carries no HTTP status: kbnClient surfaces it as
        // `Status: N/A, Cause: fetch failed` (undici) or a bare socket errno.
        // Those are exactly the blips a long sweep must survive -- glm-5-2 lost
        // 19 of 21 examples 58 minutes in when Kibana stopped answering and
        // every remaining example failed this way. Retry them like a 503, but
        // stay narrow: a status-less TypeError from our own code is a bug, not
        // a blip, and must still fail fast.
        const transportCause = `${error.message ?? ''} ${
          (error as { cause?: { code?: string; message?: string } }).cause?.code ?? ''
        } ${(error as { cause?: { message?: string } }).cause?.message ?? ''}`;
        const isTransportFailure =
          typeof status !== 'number' && RETRYABLE_TRANSPORT_ERRORS.test(transportCause);

        const shouldRetry =
          attempt < maxRetries &&
          ((typeof status === 'number' && retryStatuses.has(status)) || isTransportFailure);

        if (!shouldRetry) {
          throw error;
        }

        const retryAfterMs =
          parseRetryAfterMsFromHeaders(error.headers) ??
          parseRetryAfterMsFromMessage(error.message);

        // Exponential backoff (1s, 2s, 4s, ...) with jitter, but never sooner than retry-after.
        //
        // Cap the growth, not the patience: an uncapped 2^attempt reaches 8.5
        // minutes by attempt 6, but a floor that is too eager is worse. Measured
        // 2026-09-06 on sweep-1788696599-g53: Kibana went unreachable and
        // examples 3 and 4 burned all four attempts inside SEVEN SECONDS
        // (1s + 2s + 4s), losing two examples of a shard whose examples cost
        // ~5 minutes each. The endpoint answered 200 again minutes later, so the
        // outage outlived the retry window by orders of magnitude. Retry patience
        // must be proportional to the cost of the work it protects, so hold a
        // floor of 30s once the cheap early attempts are exhausted.
        const baseBackoffMs = 1000 * Math.pow(2, attempt);
        const patientBackoffMs = attempt >= 2 ? Math.max(baseBackoffMs, 30_000) : baseBackoffMs;
        const baseDelayMs = retryAfterMs
          ? Math.max(patientBackoffMs, retryAfterMs)
          : patientBackoffMs;
        const jitterMs = Math.floor(
          Math.random() * Math.min(1000, Math.max(100, baseDelayMs * 0.15))
        );
        const delayMs = baseDelayMs + jitterMs;

        log.warning(
          `${
            typeof status === 'number' ? `HTTP ${status}` : 'Transport failure'
          } from Kibana; retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${
            maxRetries + 1
          })`
        );
        await sleep(delayMs);
      }
    }

    throw lastError;
  };

  return fetch;
}
