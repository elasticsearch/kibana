/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  RuleExecutionCancellationError,
  isRuleExecutionCancellationError,
} from './cancellation_error';
import { CancellationScope } from './cancellation_scope';

export interface ExecutionContext {
  readonly signal: AbortSignal;
  throwIfAborted(): void;
  onAbort(handler: () => void): () => void;
  createScope(): CancellationScope;
}

export class AbortSignalExecutionContext implements ExecutionContext {
  constructor(public readonly signal: AbortSignal) {}

  public throwIfAborted(): void {
    if (!this.signal.aborted) {
      return;
    }

    const reason = this.signal.reason;

    // A bare `abort()` sets `reason` to a DOMException (name: 'AbortError'),
    // which is an Error but not a recognized cancellation - normalize it (and
    // any other non-cancellation reason) into our own error type here, at the
    // single boundary where "aborted" becomes "thrown", so every consumer of
    // `isRuleExecutionCancellationError` sees a consistent cancellation shape.
    if (isRuleExecutionCancellationError(reason)) {
      throw reason;
    }

    throw new RuleExecutionCancellationError(undefined, { cause: reason });
  }

  public onAbort(handler: () => void): () => void {
    this.signal.addEventListener('abort', handler, { once: true });
    return () => this.signal.removeEventListener('abort', handler);
  }

  /**
   * Creates a CancellationScope that automatically disposes all registered
   * resources when the abort signal fires. The scope can also be disposed
   * manually via `disposeAll()`.
   */
  public createScope(): CancellationScope {
    const scope = new CancellationScope();
    const unsubscribe = this.onAbort(() => {
      scope.disposeAll().catch(() => {
        // Disposal errors during abort are best-effort.
        // The primary abort reason is already propagated through
        // the stream/pipeline error path.
      });
    });

    scope.add(unsubscribe);

    return scope;
  }
}

export const createExecutionContext = (signal: AbortSignal): ExecutionContext =>
  new AbortSignalExecutionContext(signal);
