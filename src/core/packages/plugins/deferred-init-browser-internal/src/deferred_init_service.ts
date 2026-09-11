/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Subject, timer, merge, from, EMPTY, type Observable } from 'rxjs';
import {
  exhaustMap,
  map,
  distinctUntilChanged,
  takeWhile,
  takeUntil,
  shareReplay,
  catchError,
} from 'rxjs';
import { getDeferredInitStatusPath } from '@kbn/core-deferred-init-common';
import type { DeferredInitStatusResponse } from '@kbn/core-deferred-init-common';
import type { CoreService } from '@kbn/core-base-browser-internal';
import type { InternalHttpSetup, InternalHttpStart } from '@kbn/core-http-browser-internal';
import type { DeferredInitStart, DeferredInitStatus } from '@kbn/core-deferred-init-browser';

/** How often to re-poll the status endpoint while a plugin is not yet `available`. */
const POLL_INTERVAL_MS = 1000;

interface Deps {
  http: InternalHttpSetup | InternalHttpStart;
}

const isSameStatus = (a: DeferredInitStatus, b: DeferredInitStatus): boolean =>
  a.status === b.status && a.error?.message === b.error?.message && a.attempts === b.attempts;

/**
 * Owns the browser-side poll loop against core's deferred-init status endpoint, so plugins never
 * hand-roll `setInterval` + cleanup + trigger themselves. One shared, ref-counted poll per plugin
 * id: the first subscriber starts polling (which also triggers the plugin's deferred work
 * server-side, since the status endpoint's `ensureInitialized` kicks it), the last unsubscribing
 * one stops it.
 *
 * @internal
 */
export class DeferredInitService implements CoreService<DeferredInitStart, DeferredInitStart> {
  private readonly stop$ = new Subject<void>();
  private readonly statusCache = new Map<string, Observable<DeferredInitStatus>>();
  private readonly refreshTriggers = new Map<string, Subject<void>>();

  public setup({ http }: Deps): DeferredInitStart {
    return this.buildContract(http);
  }

  public start({ http }: Deps): DeferredInitStart {
    return this.buildContract(http);
  }

  public stop() {
    this.stop$.next();
    this.statusCache.clear();
    this.refreshTriggers.clear();
  }

  private buildContract(http: Deps['http']): DeferredInitStart {
    return {
      getStatus$: (pluginId) => this.getStatus$(http, pluginId),
      refresh: (pluginId) => this.refreshTriggers.get(pluginId)?.next(),
    };
  }

  private getStatus$(http: Deps['http'], pluginId: string): Observable<DeferredInitStatus> {
    let status$ = this.statusCache.get(pluginId);
    if (!status$) {
      const refresh$ = new Subject<void>();
      this.refreshTriggers.set(pluginId, refresh$);
      status$ = merge(timer(0, POLL_INTERVAL_MS), refresh$).pipe(
        exhaustMap(() =>
          from(http.get<DeferredInitStatusResponse>(getDeferredInitStatusPath(pluginId))).pipe(
            map((res) => ({ status: res.status, error: res.error, attempts: res.attempts })),
            // Transient fetch error on this tick: skip it and let the next timer tick retry,
            // rather than erroring the shared observable out for every subscriber.
            catchError(() => EMPTY)
          )
        ),
        distinctUntilChanged(isSameStatus),
        // `available` is terminal: emit it once (inclusive) then complete, so the poll actually
        // stops instead of hitting the endpoint every second for the app's whole mounted lifetime.
        // Keeps polling through `idle`/`initializing`/`failed`. Late subscribers still get the
        // final `available` replayed via `shareReplay` below.
        takeWhile((status) => status.status !== 'available', true),
        takeUntil(this.stop$),
        shareReplay({ bufferSize: 1, refCount: true })
      );
      this.statusCache.set(pluginId, status$);
    }
    return status$;
  }
}
