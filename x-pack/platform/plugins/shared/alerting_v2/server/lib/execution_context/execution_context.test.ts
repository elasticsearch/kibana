/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AbortSignalExecutionContext, createExecutionContext } from './execution_context';
import { RuleExecutionCancellationError } from './cancellation_error';

describe('AbortSignalExecutionContext', () => {
  describe('throwIfAborted', () => {
    it('does not throw when signal is not aborted', () => {
      const controller = new AbortController();
      const context = new AbortSignalExecutionContext(controller.signal);

      expect(() => context.throwIfAborted()).not.toThrow();
    });

    it('wraps a non-cancellation Error reason in RuleExecutionCancellationError, preserving it as cause', () => {
      const controller = new AbortController();
      const reason = new Error('custom abort reason');
      controller.abort(reason);
      const context = new AbortSignalExecutionContext(controller.signal);

      try {
        context.throwIfAborted();
        fail('Expected throwIfAborted to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(RuleExecutionCancellationError);
        expect((error as RuleExecutionCancellationError).cause).toBe(reason);
      }
    });

    it('throws RuleExecutionCancellationError when abort reason is not an Error', () => {
      const controller = new AbortController();
      controller.abort('string reason');
      const context = new AbortSignalExecutionContext(controller.signal);

      expect(() => context.throwIfAborted()).toThrow(RuleExecutionCancellationError);
    });

    it('preserves non-Error reason as cause', () => {
      const controller = new AbortController();
      controller.abort('string reason');
      const context = new AbortSignalExecutionContext(controller.signal);

      try {
        context.throwIfAborted();
        fail('Expected throwIfAborted to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(RuleExecutionCancellationError);
        expect((error as RuleExecutionCancellationError).cause).toBe('string reason');
      }
    });

    it('throws RuleExecutionCancellationError when abort has no reason', () => {
      const controller = new AbortController();
      controller.abort();
      const context = new AbortSignalExecutionContext(controller.signal);

      expect(() => context.throwIfAborted()).toThrow(RuleExecutionCancellationError);
    });

    it('rethrows an already-recognized cancellation reason unchanged', () => {
      const controller = new AbortController();
      const reason = new RuleExecutionCancellationError('already a cancellation');
      controller.abort(reason);
      const context = new AbortSignalExecutionContext(controller.signal);

      expect(() => context.throwIfAborted()).toThrow(reason);
    });
  });

  describe('onAbort', () => {
    it('calls handler when signal is aborted', () => {
      const controller = new AbortController();
      const context = new AbortSignalExecutionContext(controller.signal);
      const handler = jest.fn();

      context.onAbort(handler);
      controller.abort();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('calls handler only once', () => {
      const controller = new AbortController();
      const context = new AbortSignalExecutionContext(controller.signal);
      const handler = jest.fn();

      context.onAbort(handler);
      controller.abort();

      // Cannot abort twice, but ensure handler registered with { once: true }
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('returns unsubscribe function that prevents handler from being called', () => {
      const controller = new AbortController();
      const context = new AbortSignalExecutionContext(controller.signal);
      const handler = jest.fn();

      const unsubscribe = context.onAbort(handler);
      unsubscribe();
      controller.abort();

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not call handler if signal was already aborted before registration', () => {
      const controller = new AbortController();
      controller.abort();
      const context = new AbortSignalExecutionContext(controller.signal);
      const handler = jest.fn();

      context.onAbort(handler);

      // AbortSignal does not fire 'abort' event retroactively
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('createScope', () => {
    it('disposes scope resources when signal is aborted', async () => {
      const controller = new AbortController();
      const context = new AbortSignalExecutionContext(controller.signal);
      const scope = context.createScope();
      const disposer = jest.fn();

      scope.add(disposer);
      controller.abort();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(disposer).toHaveBeenCalledTimes(1);
    });

    it('can be disposed manually via disposeAll', async () => {
      const controller = new AbortController();
      const context = new AbortSignalExecutionContext(controller.signal);
      const scope = context.createScope();
      const disposer = jest.fn();

      scope.add(disposer);
      await scope.disposeAll();

      expect(disposer).toHaveBeenCalledTimes(1);
    });

    it('does not throw on abort when disposer fails', async () => {
      const controller = new AbortController();
      const context = new AbortSignalExecutionContext(controller.signal);
      const scope = context.createScope();
      const unhandledRejectionHandler = jest.fn();

      process.on('unhandledRejection', unhandledRejectionHandler);

      scope.add(() => {
        throw new Error('disposer failed');
      });

      controller.abort();

      await new Promise((resolve) => setTimeout(resolve, 10));

      process.off('unhandledRejection', unhandledRejectionHandler);

      expect(unhandledRejectionHandler).not.toHaveBeenCalled();
    });

    it('unsubscribes abort listener when scope is disposed manually', async () => {
      const controller = new AbortController();
      const context = new AbortSignalExecutionContext(controller.signal);
      const scope = context.createScope();
      const disposer = jest.fn();

      scope.add(disposer);
      await scope.disposeAll();

      // The unsubscribe disposer was already called during disposeAll,
      // so aborting now should not trigger disposal again
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // disposer called once from manual disposeAll, not from abort
      expect(disposer).toHaveBeenCalledTimes(1);
    });
  });

  describe('signal', () => {
    it('exposes the underlying AbortSignal', () => {
      const controller = new AbortController();
      const context = new AbortSignalExecutionContext(controller.signal);

      expect(context.signal).toBe(controller.signal);
    });
  });
});

describe('createExecutionContext', () => {
  it('creates an AbortSignalExecutionContext', () => {
    const controller = new AbortController();
    const context = createExecutionContext(controller.signal);

    expect(context).toBeInstanceOf(AbortSignalExecutionContext);
    expect(context.signal).toBe(controller.signal);
  });
});
