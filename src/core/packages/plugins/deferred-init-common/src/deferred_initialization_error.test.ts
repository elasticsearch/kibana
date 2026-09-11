/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  DeferredInitializationError,
  isDeferredInitializationError,
} from './deferred_initialization_error';

describe('DeferredInitializationError', () => {
  it('carries the plugin id and a default message', () => {
    const error = new DeferredInitializationError('myPlugin');

    expect(error.pluginId).toBe('myPlugin');
    expect(error.message).toBe('Plugin "myPlugin" is not yet available; retry later.');
    expect(error.name).toBe('DeferredInitializationError');
  });

  it('supports a custom message and cause', () => {
    const cause = new Error('lock timed out');
    const error = new DeferredInitializationError('myPlugin', {
      message: 'custom message',
      cause,
    });

    expect(error.message).toBe('custom message');
    expect(error.cause).toBe(cause);
  });

  it('defaults to retriable', () => {
    const error = new DeferredInitializationError('myPlugin');

    expect(error.retriable).toBe(true);
  });

  it('supports marking itself as non-retriable', () => {
    const error = new DeferredInitializationError('myPlugin', {
      message: 'no runner attached',
      retriable: false,
    });

    expect(error.retriable).toBe(false);
  });

  it('carries the deferred-init state when provided, and is undefined otherwise', () => {
    expect(new DeferredInitializationError('myPlugin').status).toBeUndefined();
    expect(new DeferredInitializationError('myPlugin', { status: 'failed' }).status).toBe('failed');
  });
});

describe('isDeferredInitializationError', () => {
  it('returns true for a DeferredInitializationError instance', () => {
    expect(isDeferredInitializationError(new DeferredInitializationError('myPlugin'))).toBe(true);
  });

  it('returns true for an Error-like object with matching name (cross-realm)', () => {
    // Simulates an error thrown from a different JS realm (vm context, worker,
    // iframe, etc.) where `instanceof DeferredInitializationError` is false
    // but the error's shape and name are preserved.
    const crossRealmError = Object.assign(new Error('not available'), {
      name: 'DeferredInitializationError',
      pluginId: 'myPlugin',
    });

    expect(crossRealmError).not.toBeInstanceOf(DeferredInitializationError);
    expect(isDeferredInitializationError(crossRealmError)).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isDeferredInitializationError(new Error('boom'))).toBe(false);
  });

  it('returns false for a subclassed Error whose name does not match', () => {
    class SomeOtherError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'SomeOtherError';
      }
    }

    expect(isDeferredInitializationError(new SomeOtherError('boom'))).toBe(false);
  });
});
