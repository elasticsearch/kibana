/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

const RETRYABLE_ERROR_NAMES = new Set([
  'ConnectionError',
  'NoLivingConnectionsError',
  'TimeoutError',
  'RequestTimeout',
]);

const getStatusCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as { statusCode?: number; meta?: { statusCode?: number } };
  return candidate.statusCode ?? candidate.meta?.statusCode;
};

/** Returns true for transient Elasticsearch / network failures worth retrying. */
export const isRetryableChangeHistoryError = (error: unknown): boolean => {
  const statusCode = getStatusCode(error);

  if (statusCode != null) {
    if (RETRYABLE_STATUS_CODES.has(statusCode) || statusCode >= 500) {
      return true;
    }

    if (statusCode >= 400 && statusCode < 500) {
      return false;
    }
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const name = (error as { name?: string }).name;
  return name != null && RETRYABLE_ERROR_NAMES.has(name);
};
