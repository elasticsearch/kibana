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
  if (error instanceof Error) return error.message;
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

// 500 is included deliberately. EIS surfaces transient upstream provider faults
// as a Kibana 500 ("Received a server error status code for request from inference
// entity id [...] status [500]"), not a 502/503. Observed 2026-09-02: 27 such 500s
// per model failed 21/21 examples on two independent VMs at the same repetition,
// destroying two good repetitions with them. A genuinely non-retryable 500 just
// fails again and costs one extra call; a transient one costs a whole sweep.
const RETRYABLE_SERVER_STATUSES = new Set<number>([500, 502, 503, 504]);

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
    return { retry: true, retryAfterMs };
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
