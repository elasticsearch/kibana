/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parseChangeHistoryError } from './parse_change_history_error';

interface HttpErrorBody {
  message?: unknown;
}

const isHttpErrorBody = (body: unknown): body is HttpErrorBody =>
  typeof body === 'object' && body !== null && 'message' in body;

/**
 * Prefer structured {@link ChangeHistoryError} or API error payload over HttpFetchError.message.
 */
export const getChangeHistoryErrorMessage = (error: Error): string | undefined => {
  const body = (error as { body?: unknown }).body;
  const structured = parseChangeHistoryError(body);

  if (structured?.message) {
    return structured.message;
  }

  if (isHttpErrorBody(body) && typeof body.message === 'string' && body.message.length > 0) {
    return body.message;
  }

  return error.message.length > 0 ? error.message : undefined;
};
