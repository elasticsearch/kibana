/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryError, ChangeHistoryErrorCode } from '../types/change_history_error';

const CHANGE_HISTORY_ERROR_CODES = new Set<ChangeHistoryErrorCode>([
  'FORBIDDEN',
  'NOT_FOUND',
  'HISTORY_DISABLED',
  'RESTORE_CONFLICT',
  'RESTORE_VALIDATION',
  'NETWORK',
  'UNKNOWN',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseChangeHistoryError = (body: unknown): ChangeHistoryError | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }

  const { code, message, details } = body;

  if (typeof message !== 'string' || message.length === 0) {
    return undefined;
  }

  if (typeof code === 'string' && CHANGE_HISTORY_ERROR_CODES.has(code as ChangeHistoryErrorCode)) {
    return {
      code: code as ChangeHistoryErrorCode,
      message,
      ...(isRecord(details) ? { details } : {}),
    };
  }

  return {
    code: 'UNKNOWN',
    message,
    ...(isRecord(details) ? { details } : {}),
  };
};
