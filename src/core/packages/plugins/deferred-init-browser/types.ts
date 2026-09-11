/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type { AppInitializingState, AppInitializingError } from '@kbn/core-application-browser';

/**
 * Status of a plugin's server-side deferred (lazy) initialization, as observed from the browser.
 *
 * @public
 */
export interface DeferredInitStatus {
  status: AppInitializingState;
  /** Present only when `status === 'failed'`: the plugin's most recent lazyInitialize() error. */
  error?: AppInitializingError;
  /** Present only when `status === 'failed'`: how many consecutive attempts have failed. */
  attempts?: number;
}

/**
 * Status of a plugin's server-side deferred (lazy) initialization, as observed from the browser.
 * Core already uses this to automatically gate a lazy plugin's registered app behind
 * `<AppInitializingGate>`; this contract exposes the same underlying poll loop for plugins that
 * need to build custom UI on top of it instead of (or in addition to) the automatic gate.
 *
 * @public
 */
export interface DeferredInitStart {
  /**
   * Observable of a plugin's deferred-init status. Core owns the underlying fetch loop
   * (triggering, polling, backoff, cleanup); the returned observable is shared across
   * subscribers and stops polling once no one is subscribed.
   */
  getStatus$(pluginId: string): Observable<DeferredInitStatus>;

  /** Force an immediate re-check for a plugin id, outside the normal poll cadence. */
  refresh(pluginId: string): void;
}
