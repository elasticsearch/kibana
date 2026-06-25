/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  KibanaResponseFactory,
  CustomHttpResponseOptions,
  HttpResponsePayload,
  ResponseError,
} from '@kbn/core/server';
import type { ErrorCause } from '@elastic/elasticsearch/lib/api/types';

/**
 * The HTTP error status codes that Automatic Import routes are allowed to return.
 * Keeping this as a closed union (rather than `number`) means callers get a compile
 * error if they use an unsupported status code, and the message map below stays
 * exhaustive.
 */
export type AutomaticImportHttpErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 500;

const STATUS_CODE_TO_ERROR_MESSAGE: Record<AutomaticImportHttpErrorStatusCode, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Error',
};

export class AutomaticImportResponseFactory {
  constructor(private response: KibanaResponseFactory) {}

  error<T extends HttpResponsePayload | ResponseError>({
    statusCode,
    body,
    headers,
  }: Omit<CustomHttpResponseOptions<T>, 'statusCode'> & {
    statusCode: AutomaticImportHttpErrorStatusCode;
  }) {
    const contentType: CustomHttpResponseOptions<T>['headers'] = {
      'content-type': 'application/json',
    };
    const defaultedHeaders: CustomHttpResponseOptions<T>['headers'] = {
      ...contentType,
      ...(headers ?? {}),
    };

    const message =
      body instanceof Error ? body.message : body ?? STATUS_CODE_TO_ERROR_MESSAGE[statusCode];

    return this.response.custom({
      headers: defaultedHeaders,
      statusCode,
      body: Buffer.from(
        JSON.stringify({
          message,
          status_code: statusCode,
        })
      ),
    });
  }
}

export const buildAutomaticImportResponse = (response: KibanaResponseFactory) =>
  new AutomaticImportResponseFactory(response);

interface EsErrorDetails {
  body?: { error?: ErrorCause };
  meta?: {
    body?: { error?: ErrorCause };
  };
}

/**
 * Returns the structured Elasticsearch error from a client error, if present.
 * The body can be exposed either directly (`body`) or via the diagnostic metadata
 * (`meta.body`) depending on how the error was raised/wrapped, so both are checked.
 */
const getEsError = (err: unknown): ErrorCause | undefined => {
  if (!(err instanceof Error)) {
    return undefined;
  }
  const esError = err as Error & EsErrorDetails;
  return esError.meta?.body?.error ?? esError.body?.error;
};

/**
 * Returns the Elasticsearch error `type` (e.g. `index_not_found_exception`,
 * `security_exception`) when the given value is an Elasticsearch client error.
 */
export const getEsErrorType = (err: unknown): string | undefined => getEsError(err)?.type;

/**
 * Detects whether an error represents an Elasticsearch authorization failure.
 */
export const isSecurityExceptionError = (err: unknown): boolean => {
  if (!(err instanceof Error)) {
    return false;
  }
  return (
    getEsErrorType(err) === 'security_exception' ||
    err.message.includes('security_exception') ||
    err.message.includes('is unauthorized for user')
  );
};
