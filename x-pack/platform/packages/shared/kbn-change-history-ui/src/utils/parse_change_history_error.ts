/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryError, ChangeHistoryErrorCode } from '../types/change_history_error';
import { isChangeHistoryErrorCode } from './change_history_error_codes';
import { getChangeHistoryErrorCodeFromBody } from './get_change_history_error_code';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseChangeHistoryError = (body: unknown): ChangeHistoryError | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }

  const { message, details } = body;
  const code = getChangeHistoryErrorCodeFromBody(body);

  if (typeof message !== 'string' || message.length === 0) {
    return undefined;
  }

  if (typeof code === 'string' && isChangeHistoryErrorCode(code)) {
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
