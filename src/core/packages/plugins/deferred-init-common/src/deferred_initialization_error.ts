/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DeferredInitState } from './deferred_init_status_route';

/**
 * Thrown when a lazy plugin's wrapped `start()` contract function is called and the plugin's
 * deferred initialization has not (yet) succeeded. If this error escapes an HTTP route handler,
 * core's central handler converts it to a `503` + `Retry-After` response. Plugins may also catch
 * it and handle it explicitly.
 *
 * @public
 */
export class DeferredInitializationError extends Error {
  public readonly pluginId: string;
  /**
   * Whether retrying later could plausibly succeed. `false` for errors that stem from a
   * misconfiguration (e.g. the target plugin never attached a deferred-init runner) rather than
   * a transient failure of the runner itself — retrying those wastes a caller's retry budget on
   * something that cannot self-heal.
   */
  public readonly retriable: boolean;
  /**
   * The plugin's deferred-init state at the moment this error was thrown. Lets core's central
   * error handler report the *real* state in its `503` body instead of a hardcoded string.
   * `undefined` when the thrower didn't have a state to attach.
   */
  public readonly status?: DeferredInitState;

  constructor(
    pluginId: string,
    options?: { message?: string; cause?: unknown; retriable?: boolean; status?: DeferredInitState }
  ) {
    super(
      options?.message ?? `Plugin "${pluginId}" is not yet available; retry later.`,
      options?.cause !== undefined ? { cause: options.cause } : undefined
    );
    this.name = 'DeferredInitializationError';
    this.pluginId = pluginId;
    this.retriable = options?.retriable ?? true;
    this.status = options?.status;
    // Restores the prototype chain so `instanceof` keeps working across transpilation targets.
    Object.setPrototypeOf(this, DeferredInitializationError.prototype);
  }
}

/**
 * Checks if the provided `error` is a {@link DeferredInitializationError}. Falls back to a
 * name-based check so the predicate still matches across bundle/realm boundaries where
 * `instanceof` can fail.
 *
 * @public
 */
export const isDeferredInitializationError = (e: unknown): e is DeferredInitializationError =>
  e instanceof DeferredInitializationError ||
  (e instanceof Error && e.name === 'DeferredInitializationError');
