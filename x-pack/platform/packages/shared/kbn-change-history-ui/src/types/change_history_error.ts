/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type ChangeHistoryErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'HISTORY_DISABLED'
  | 'RESTORE_CONFLICT'
  | 'RESTORE_VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

export interface ChangeHistoryError {
  code: ChangeHistoryErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
