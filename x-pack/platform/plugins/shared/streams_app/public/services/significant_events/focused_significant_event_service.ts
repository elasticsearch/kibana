/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject } from 'rxjs';
import type { SignificantEvent } from '@kbn/significant-events-schema';

export class FocusedSignificantEventService {
  private readonly focusedEventSubject$ = new BehaviorSubject<SignificantEvent | undefined>(
    undefined
  );

  public readonly focusedEvent$ = this.focusedEventSubject$.asObservable();

  public setFocusedEvent(event: SignificantEvent): void {
    this.focusedEventSubject$.next(event);
  }

  public clearFocusedEvent(discoverySlug?: string): void {
    const focusedEvent = this.focusedEventSubject$.getValue();

    if (discoverySlug && focusedEvent?.discovery_slug !== discoverySlug) {
      return;
    }

    this.focusedEventSubject$.next(undefined);
  }

  public getFocusedEvent(): SignificantEvent | undefined {
    return this.focusedEventSubject$.getValue();
  }
}
