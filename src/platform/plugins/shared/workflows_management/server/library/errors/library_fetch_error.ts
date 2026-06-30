/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Reason the fetcher failed to produce a usable payload from the upstream
 * CDN. Carried on `LibraryFetchError.reason` so callers (cache, route
 * handlers, tests) can branch without string-matching the message.
 */
export type LibraryFetchErrorReason =
  | 'http-error' // upstream returned a non-2xx response we did not (or no longer) retry
  | 'connection' // network failure / timeout / DNS / etc.
  | 'malformed' // upstream payload could not be parsed (JSON / YAML / schema)
  | 'unavailable'; // no successful fetch has happened yet (cache miss + upstream down)

export class LibraryFetchError extends Error {
  constructor(
    message: string,
    public readonly reason: LibraryFetchErrorReason,
    public readonly url?: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'LibraryFetchError';
  }
}
