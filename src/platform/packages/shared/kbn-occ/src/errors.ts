/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { OCC_CONFLICT_STATUS_CODE } from './constants';

export class OccConflictError extends Error {
  readonly statusCode = OCC_CONFLICT_STATUS_CODE;

  constructor(message = 'Version conflict while writing document') {
    super(message);
    this.name = 'OccConflictError';
  }
}

export const isOccConflictError = (error: unknown): error is OccConflictError =>
  error instanceof OccConflictError;

/**
 * True when an error looks like an Elasticsearch write conflict (HTTP 409),
 * including raw client errors before they are wrapped as {@link OccConflictError}.
 */
export const isElasticsearchWriteConflict = (error: unknown): boolean => {
  if (isOccConflictError(error)) {
    return true;
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { statusCode?: number; meta?: { statusCode?: number } };
  return (
    candidate.statusCode === OCC_CONFLICT_STATUS_CODE ||
    candidate.meta?.statusCode === OCC_CONFLICT_STATUS_CODE
  );
};
