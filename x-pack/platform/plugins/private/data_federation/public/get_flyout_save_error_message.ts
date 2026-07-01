/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { isHttpFetchError } from '@kbn/core-http-browser';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const messageFromBody = (body: unknown): string | undefined => {
  if (typeof body === 'string' && body.trim()) {
    return body;
  }
  if (!isRecord(body)) {
    return undefined;
  }
  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message;
  }
  if (isRecord(body.error) && typeof body.error.reason === 'string' && body.error.reason.trim()) {
    return body.error.reason;
  }
  if (typeof body.reason === 'string' && body.reason.trim()) {
    return body.reason;
  }
  return undefined;
};

export const getFlyoutSaveErrorMessage = (error: unknown): string => {
  if (isHttpFetchError(error)) {
    const fromBody = messageFromBody(error.body);
    if (fromBody) {
      return fromBody;
    }
    if (error.message.trim()) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  const fromUnknown = messageFromBody(error);
  if (fromUnknown) {
    return fromUnknown;
  }
  return i18n.translate('xpack.dataFederation.errors.unknown', {
    defaultMessage: 'Unknown error',
  });
};
