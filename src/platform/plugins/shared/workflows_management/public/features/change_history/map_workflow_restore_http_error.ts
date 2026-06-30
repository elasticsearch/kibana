/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ChangeHistoryErrorCode } from '@kbn/change-history-ui';
import {
  getChangeHistoryErrorCodeFromBody,
  isChangeHistoryErrorCode,
} from '@kbn/change-history-ui';
import { isHttpFetchError } from '@kbn/core-http-browser';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getMessage = (error: unknown): string => {
  if (isHttpFetchError(error)) {
    const bodyMessage = isRecord(error.body) ? error.body.message : undefined;
    if (typeof bodyMessage === 'string' && bodyMessage.length > 0) {
      return bodyMessage;
    }

    return error.message;
  }

  if (isHttpLikeError(error)) {
    const bodyMessage = isRecord(error.body) ? error.body.message : undefined;
    if (typeof bodyMessage === 'string' && bodyMessage.length > 0) {
      return bodyMessage;
    }

    if (typeof error.message === 'string' && error.message.length > 0) {
      return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const mapStatusToCode = (
  status: number | undefined,
  body?: Record<string, unknown>
): ChangeHistoryErrorCode | undefined => {
  switch (status) {
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'RESTORE_CONFLICT';
    case 400:
      if (body && Array.isArray(body.validationErrors)) {
        return 'RESTORE_VALIDATION';
      }
      return undefined;
    default:
      return undefined;
  }
};

const isHttpLikeError = (
  error: unknown
): error is { response?: { status?: number }; body?: unknown; message?: string } =>
  isRecord(error) && ('response' in error || 'body' in error);

const getHttpStatus = (error: unknown): number | undefined => {
  if (isHttpFetchError(error)) {
    return error.response?.status;
  }

  if (isHttpLikeError(error)) {
    return error.response?.status;
  }

  return undefined;
};

const getHttpBody = (error: unknown): Record<string, unknown> | undefined => {
  if (isHttpFetchError(error)) {
    return isRecord(error.body) ? error.body : undefined;
  }

  if (isHttpLikeError(error) && isRecord(error.body)) {
    return error.body;
  }

  return undefined;
};

export const mapWorkflowRestoreHttpError = (error: unknown): Error => {
  if (!isHttpFetchError(error) && !isHttpLikeError(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const message = getMessage(error);
  const structuredBody = getHttpBody(error);
  const structuredCode = getChangeHistoryErrorCodeFromBody(structuredBody);
  const code =
    structuredCode && isChangeHistoryErrorCode(structuredCode)
      ? structuredCode
      : mapStatusToCode(getHttpStatus(error), structuredBody) ?? 'UNKNOWN';

  const mappedError = new Error(message);
  Object.assign(mappedError, { body: { code, message } });

  return mappedError;
};
