/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Route pattern for core's always-available deferred-init status endpoint, shared between the
 * server route registration and the browser status client so the two can't drift.
 *
 * @internal
 */
export const DEFERRED_INIT_STATUS_ROUTE = '/internal/core/deferred_init/{pluginId}';

/**
 * Build the concrete path for a given plugin id. See {@link DEFERRED_INIT_STATUS_ROUTE}.
 *
 * @internal
 */
export const getDeferredInitStatusPath = (pluginId: string): string =>
  `/internal/core/deferred_init/${pluginId}`;

/**
 * Status of a plugin's deferred initialization, as reported by {@link DEFERRED_INIT_STATUS_ROUTE}.
 * Duplicated as a literal union (not imported) from `InitState` (`@kbn/core-plugins-server`,
 * server-only) and `AppInitializingState` (`@kbn/core-application-browser`, browser-only) so this
 * isomorphic package doesn't have to depend on either environment-scoped one; keep the four
 * literals in sync if this ever changes.
 *
 * @internal
 */
export type DeferredInitState = 'idle' | 'initializing' | 'available' | 'failed';

/**
 * The two deferred lifecycle phases core runs, in order, on a lazy plugin's first trigger:
 * the retriable `lazyInitialize()` and then the deferred `start()`.
 *
 * @internal
 */
export type DeferredInitPhase = 'lazyInitialize' | 'start';

/**
 * Body of the {@link DEFERRED_INIT_STATUS_ROUTE} response, shared between the server route
 * registration and the browser status client so the two can't drift.
 *
 * @internal
 */
export interface DeferredInitStatusResponse {
  pluginId: string;
  status: DeferredInitState;
  /** Present only when `status === 'failed'`: the plugin's most recent deferred-phase error. */
  error?: { message: string };
  /** Present only when `status === 'failed'`: how many consecutive attempts have failed. */
  attempts?: number;
  /** Present only when `status === 'failed'`: which deferred phase the last attempt failed in. */
  phase?: DeferredInitPhase;
}

/**
 * Body of the `503` a gated route returns while a plugin's deferred init is not yet `available`.
 * Both trigger paths (the guarded router and the central error handler for an escaped
 * {@link DeferredInitializationError}) return this exact shape so clients read one stable body.
 *
 * @internal
 */
export interface DeferredInitUnavailableBody {
  pluginId: string;
  status: DeferredInitState;
}
