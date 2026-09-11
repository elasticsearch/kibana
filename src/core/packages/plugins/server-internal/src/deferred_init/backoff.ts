/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Backoff scale for {@link DeferredInitEngine}'s cooldown between failed attempts at a lazy
 * plugin's deferred phases (`lazyInitialize`, then `start`). Applied with full jitter, so the
 * values below bound the delay rather than fixing it.
 *
 * The base and ceiling are intentionally modelled on Fleet's battle-tested Serverless retry
 * profile (`retrySetupOnBoot`), which was tuned for slow-starting Elasticsearch clusters that can
 * take up to five minutes on cold start (see kibana#167246). Fleet capped at 25 attempts; core
 * keeps the same timing curve and cap, then switches to on-demand retries (see
 * {@link DEFERRED_INIT_MAX_BACKGROUND_ATTEMPTS}).
 *
 * Progression with full jitter (upper bound per attempt):
 *   1st retry: 0 – 1 s
 *   2nd retry: 0 – 2 s
 *   3rd retry: 0 – 4 s
 *   4th retry: 0 – 8 s
 *   5th retry: 0 – 16 s
 *   6th retry: 0 – 32 s
 *   7th retry: 0 – 64 s  → capped at 5 min
 *   8th–25th retry: 0 – 5 min
 */

/** Upper bound on the delay before the first retry (~1 s with full jitter). */
export const DEFERRED_INIT_BACKOFF_BASE_MS = 1_000;
/**
 * Upper bound on the delay between retries once the backoff curve saturates.
 * Chosen to match Fleet's Serverless cold-start ceiling (5 minutes).
 */
export const DEFERRED_INIT_BACKOFF_MAX_MS = 300_000;
/** Exponential growth factor applied per attempt, before capping at {@link DEFERRED_INIT_BACKOFF_MAX_MS}. */
export const DEFERRED_INIT_BACKOFF_FACTOR = 2;

/**
 * Maximum number of automatic background retries before the cooldown timer stops firing.
 * After this many consecutive failures the engine stays `failed` and waits for an explicit
 * on-demand kick (an incoming gated request or a {@link DeferredInitEngine.waitUntilAvailable}
 * call) rather than scheduling further unsolicited retries.
 *
 * Matches Fleet's historic `retrySetupOnBoot` attempt cap, which was the most battle-tested
 * value for Serverless Elasticsearch cold-start scenarios (see kibana#167246).
 */
export const DEFERRED_INIT_MAX_BACKGROUND_ATTEMPTS = 25;

/**
 * Timeout applied to a lazy plugin's deferred `start()`. It runs off the boot path, so the boot
 * loop's own 10 s watchdog no longer covers it; this keeps the same budget so a hung `start()`
 * surfaces as a `failed` attempt instead of pinning the plugin at `initializing` forever.
 * `lazyInitialize()` deliberately gets no timeout: it is the phase that is allowed to be slow.
 */
export const DEFERRED_START_TIMEOUT_MS = 10_000;
