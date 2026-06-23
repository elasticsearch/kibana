/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { combineLatest, filter, map, type Observable, type Subscription } from 'rxjs';

import type { PublishingSubject } from '@kbn/presentation-publishing';

/**
 * Exposes a PublishingSubject whose subscribers wait for children to finish loading,
 * while preserving BehaviorSubject-style synchronous reads via getValue/value.
 *
 * Subscribers use a gated observable so stale defaults (e.g. `[]` for esqlVariables$)
 * are not replayed immediately. getValue returns the latest post-load value once
 * available, otherwise falls back to the source subject.
 */
export function gatePublishingSubjectWhileLoading<T>(
  source$: PublishingSubject<T>,
  childrenLoading$: Observable<boolean>,
  subscriptions: Subscription
): PublishingSubject<T> {
  let latestLoadedValue: T | undefined;

  const gated$ = combineLatest([source$, childrenLoading$]).pipe(
    filter(([, loading]) => !loading),
    map(([value]) => value)
  );

  // Keep getValue/value in sync with what subscribers receive after the loading gate.
  subscriptions.add(
    gated$.subscribe((value) => {
      latestLoadedValue = value;
    })
  );

  // Inherit BehaviorSubject methods (asObservable, pipe, etc.) from source$ without copying
  // its subscribe/getValue implementations, which would still replay stale loading defaults.
  const gatedSubject = Object.create(source$) as PublishingSubject<T>;

  // Route subscribers through gated$ so they only see values after children finish loading.
  gatedSubject.subscribe = gated$.subscribe.bind(gated$);
  gatedSubject.getValue = () => latestLoadedValue ?? source$.getValue();
  // BehaviorSubject exposes a `value` getter alongside getValue(); override both paths.
  Object.defineProperty(gatedSubject, 'value', {
    get: () => gatedSubject.getValue(),
  });

  return gatedSubject;
}
