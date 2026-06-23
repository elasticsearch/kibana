/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IHttpFetchError } from '@kbn/core/public';

/**
 * Return a new Error whose `.message` is the server's `body.message` when
 * present, keeping the original stack. Falls back to the input error if no
 * body message is available.
 *
 * Use this before passing an HTTP error to `toasts.addError`: the core
 * ErrorToast modal renders its callout from `error.message`, so the useful
 * server message must live there to appear in "See the full error".
 */
export const enrichHttpErrorMessage = (error: Error): Error => {
  const httpError = error as IHttpFetchError<{ message?: string }>;
  if (!httpError.body?.message) {
    return error;
  }
  return Object.assign(new Error(httpError.body.message), { stack: error.stack });
};
