/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { memoize } from 'lodash';
import { applyBackoffJitter } from '../backoff_jitter/backoff_jitter';
import { parseDuration } from '../parse-duration/parse-duration';

// parseDuration is on the hot path of retry delay computation,
// so we memoize it to avoid redundant parsing of the same duration strings across retries.
// The number of unique duration strings is expected to be small (e.g. "5s", "1m", "5m"),
// so the memory overhead of memoization should be minimal.
const parseDurationMemoized = memoize(parseDuration);
/**
 * Configuration for retry delay computation.
 * Matches the retry section of workflow on-failure config (delay, strategy, multiplier, max-delay, jitter).
 */
export interface RetryDelayConfig {
  /** Fixed delay duration (e.g. "5s", "1m"). Used as initial delay for exponential. */
  delay?: string;
  /** Strategy: fixed (same delay each retry) or exponential backoff. Default: fixed. */
  strategy?: 'fixed' | 'exponential';
  /** Multiplier for exponential backoff. Default: 2. Ignored when strategy is fixed. */
  multiplier?: number;
  /** Cap for exponential backoff (e.g. "5m"). Ignored when strategy is fixed. */
  'max-delay'?: string;
  /** Add jitter to delay. Default: false. */
  jitter?: boolean;
}

const DEFAULT_EXPONENTIAL_MULTIPLIER = 2;
const DEFAULT_EXPONENTIAL_INITIAL_DELAY = '1s';

/**
 * Computes the delay in milliseconds before the next retry attempt.
 *
 * @param config - Retry delay configuration (strategy, delay, multiplier, max-delay, jitter).
 * @param attempt - Zero-based index of the attempt that just failed (0 = first failure, 1 = second failure, etc.).
 * @returns Delay in milliseconds. Returns 0 when no delay is configured or delay would be 0.
 */
export function computeRetryDelayMs(config: RetryDelayConfig, attempt: number): number {
  const strategy = config.strategy ?? 'fixed';
  const hasDelay = config.delay != null && config.delay.length > 0;

  if (strategy === 'fixed') {
    if (!hasDelay || !config.delay) {
      return 0;
    }
    let delayMs = parseDurationMemoized(config.delay);
    if (config.jitter) {
      delayMs = applyBackoffJitter(delayMs);
    }
    return delayMs;
  }

  // strategy === 'exponential'
  const initialDelayStr = config.delay ?? DEFAULT_EXPONENTIAL_INITIAL_DELAY;
  const initialMs = parseDurationMemoized(initialDelayStr);
  const multiplier = config.multiplier ?? DEFAULT_EXPONENTIAL_MULTIPLIER;
  let delayMs = initialMs * Math.pow(multiplier, attempt);

  if (config['max-delay']) {
    const maxMs = parseDurationMemoized(config['max-delay']);
    delayMs = Math.min(delayMs, maxMs);
  }

  if (config.jitter) {
    delayMs = applyBackoffJitter(delayMs);
  }

  return Math.max(0, Math.floor(delayMs));
}
