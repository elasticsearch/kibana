/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Describes whether a failed service account token exchange can be retried. */
export class ServiceAccountTokenExchangeError extends Error {
  constructor(cause: Error, public readonly retryable: boolean, public readonly retryAfterMs = 0) {
    super('Error occurred during service account token exchange.', { cause });
    this.name = 'ServiceAccountTokenExchangeError';
  }
}
