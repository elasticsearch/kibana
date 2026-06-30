/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryError } from '../types/change_history_error';
import { getChangeHistoryErrorMessage } from './get_change_history_error_message';
import { parseChangeHistoryError } from './parse_change_history_error';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const mapChangeHistoryRestoreError = (error: unknown): ChangeHistoryError => {
  if (isRecord(error) && 'body' in error) {
    const structured = parseChangeHistoryError(error.body);
    if (structured) {
      return structured;
    }
  }

  if (error instanceof Error) {
    const structured = parseChangeHistoryError((error as { body?: unknown }).body);
    if (structured) {
      return structured;
    }

    return {
      code: 'UNKNOWN',
      message: getChangeHistoryErrorMessage(error) ?? error.message,
    };
  }

  return {
    code: 'UNKNOWN',
    message: String(error),
  };
};
