/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryErrorCode } from '../types/change_history_error';

export const CHANGE_HISTORY_ERROR_CODES = new Set<ChangeHistoryErrorCode>([
  'FORBIDDEN',
  'NOT_FOUND',
  'HISTORY_DISABLED',
  'RESTORE_CONFLICT',
  'RESTORE_VALIDATION',
  'NETWORK',
  'UNKNOWN',
]);

export const isChangeHistoryErrorCode = (code: string): code is ChangeHistoryErrorCode =>
  CHANGE_HISTORY_ERROR_CODES.has(code as ChangeHistoryErrorCode);
