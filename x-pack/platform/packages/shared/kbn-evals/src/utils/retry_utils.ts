/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_MIN_DELAY_MS = 2000;
const DEFAULT_MAX_DELAY_MS = 60_000;

export interface RetryOptions {
  /**
   * Total number of attempts (initial try + retries).
   */
  maxAttempts?: number;
  /**
   * Minimum delay for exponential backoff (ms).
   */
  minDelayMs?: number;
  /**
   * Maximum delay cap (ms).
   */
  maxDelayMs?: number;
  /**
   * If true, add a small random jitter to the delay.
   */
  jitter?: boolean;
  /**
   * Optional label for error messages/logging.
   */
  label?: string;
  /**
   * Optional hook invoked before sleeping between retries.
   */
  onRetry?: (params: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: unknown;
    label: string;
  }) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Fold in error.cause so nested undici socket codes (ECONNRESET, UND_ERR_SOCKET, etc.)
    // are visible to the retryable-pattern regex even when the top-level message is generic
    // ("fetch failed"). Include both the cause message and its code property when present.
    const causeMsg =
      error.cause instanceof Error
        ? error.cause.message
        : error.cause != null
        ? String(error.cause)
        : '';
    const causeCode: string = (error.cause as any)?.code ?? '';
    const extras = [causeMsg, causeCode].filter(Boolean).join(' ');
    return extras ? `${error.message} (${extras})` : error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function getStatusCode(error: any): number | undefined {
  return (
    error?.statusCode ??
    error?.status ??
    error?.response?.status ??
    error?.meta?.status ??
    undefined
  );
}

/**
 * Message shapes produced by known Node/Undici runtime failures that carry no structured
 * code at the level where they surface (e.g. the `TypeError: fetch failed` that undici
 * throws for any socket-level failure, or `terminated` mid-response). Matching these
 * identifies the transport-failure class only; it never proves the request was unprocessed.
 */
const KNOWN_TRANSPORT_FAILURE_MESSAGES =
  /fetch failed|other side closed|socket hang ?up|terminated|SocketError/i;

const RETRYABLE_NETWORK_CODES =
  /ECONNRESET|ECONNREFUSED|EPIPE|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT/i;

const CALLER_CANCELLATION_MESSAGES = /operation was aborted/i;

/**
 * Caller-initiated cancellation shapes: `AbortError` DOMException/Error (the default
 * `AbortSignal.reason`), Node's `ABORT_ERR` code, and their wrapped messages. Cancellation
 * is never a transient network failure, even when wrapped by another error type.
 */
function isCallerCancellation(error: Error): boolean {
  if (error.name === 'AbortError') return true;
  if ((error as { code?: unknown }).code === 'ABORT_ERR') return true;
  return CALLER_CANCELLATION_MESSAGES.test(error.message);
}

/**
 * Identifies a transient transport failure that may be retried when the caller has
 * established replay safety. It does not prove that the request was unprocessed or that
 * no response was received.
 *
 * Returns `true` when the error or its immediate cause contains a recognized transport/network
 * failure. `KbnClientRequesterError` includes the underlying error message in its own message,
 * so checking the top-level message and first cause covers the runtime shapes produced by the
 * request path.
 *
 * Caller cancellation is checked on the wrapper and immediate cause and always wins. A numeric
 * status on the top-level error means the server produced a response and is not a transport
 * failure. TLS/auth, malformed-request, and unrelated errors are not recognized.
 *
 * A `true` result is necessary but not sufficient for a retry: the caller must separately
 * opt in to network retries (e.g. `retryPolicy: { onNetworkError: true }`), and the
 * `KBN_EVALS_NETWORK_RETRIES` budget must have retries remaining.
 */
export function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (typeof (error as { status?: unknown }).status === 'number') return false;

  const cause = error.cause instanceof Error ? error.cause : undefined;
  if (isCallerCancellation(error) || (cause !== undefined && isCallerCancellation(cause))) {
    return false;
  }

  const message = toErrorMessage(error);
  return KNOWN_TRANSPORT_FAILURE_MESSAGES.test(message) || RETRYABLE_NETWORK_CODES.test(message);
}

function parseRetryAfterMsFromMessage(message: string): number | undefined {
  // Many providers include: "Please retry after 5 seconds."
  const match = message.match(/retry after\s+(\d+)\s*seconds?/i);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return seconds * 1000;
}

function computeDelayMs({
  attempt,
  minDelayMs,
  maxDelayMs,
  retryAfterMs,
  jitter,
}: {
  attempt: number;
  minDelayMs: number;
  maxDelayMs: number;
  retryAfterMs?: number;
  jitter: boolean;
}): number {
  const exp = Math.min(maxDelayMs, minDelayMs * Math.pow(2, attempt - 1));
  const base = retryAfterMs ? Math.max(exp, retryAfterMs) : exp;

  if (!jitter) return base;

  // Keep jitter small to avoid masking "retry after" guidance.
  const extra = Math.min(1000, Math.max(100, Math.floor(base * 0.15)));
  return base + Math.floor(Math.random() * extra);
}

const RETRYABLE_SERVER_STATUSES = new Set<number>([502, 503, 504]);

function isRetryable(error: any): { retry: boolean; retryAfterMs?: number } {
  const status = getStatusCode(error);
  const message = toErrorMessage(error);
  const retryAfterMs = parseRetryAfterMsFromMessage(message);

  // Primary target: rate limiting
  if (status === 429) return { retry: true, retryAfterMs };
  if (/status code 429|too many requests|ratelimit|rate limit/i.test(message)) {
    return { retry: true, retryAfterMs };
  }

  // Transient server-side failures (idempotent endpoints can safely retry).
  if (status !== undefined && RETRYABLE_SERVER_STATUSES.has(status)) {
    return { retry: true, retryAfterMs };
  }

  // Common transient network issues (best-effort).
  // "other side closed" / "fetch failed" are SocketError signatures from undici when a
  // keep-alive connection is closed by the server (e.g. Kibana's Node.js keepAliveTimeout)
  // while the eval worker is busy with a long ES replay operation.
  if (
    /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|other side closed|socket hang up|fetch failed/i.test(
      message
    )
  ) {
    return { retry: true };
  }

  return { retry: false };
}

/**
 * Retry a promise-returning function with exponential backoff.
 *
 * This is intended for evals/test-call sites (e.g. `kbnClient.request`) where we don't
 * reliably have access to response headers and may only have an error message string.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const minDelayMs = options.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitter = options.jitter ?? true;
  const label = options.label ?? 'operation';

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const { retry, retryAfterMs } = isRetryable(error);
      const isLast = attempt === maxAttempts;
      if (!retry || isLast) {
        throw error;
      }

      const delayMs = computeDelayMs({
        attempt,
        minDelayMs,
        maxDelayMs,
        retryAfterMs,
        jitter,
      });

      options.onRetry?.({ attempt, maxAttempts, delayMs, error, label });

      await sleep(delayMs);
    }
  }

  // Should be unreachable.
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
