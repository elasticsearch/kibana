/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Boom, isBoom } from '@hapi/boom';
import type { SavedObjectError } from '@kbn/core-saved-objects-common';
import type { DecoratedError } from '@kbn/core-saved-objects-server';
import type { Logger } from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import type { CaseErrorResponse, SOWithErrors } from './types';

export interface HTTPError extends Error {
  statusCode: number;
}

/**
 * Helper class for wrapping errors while preserving the original thrown error.
 */
export class CaseError extends Error {
  public readonly wrappedError?: Error;
  constructor(message?: string, originalError?: Error) {
    super(message);
    this.name = this.constructor.name; // for stack traces
    if (isCaseError(originalError)) {
      this.wrappedError = originalError.wrappedError;
    } else {
      this.wrappedError = originalError;
    }
  }

  /**
   * This function creates a boom representation of the error. If the wrapped error is a boom we'll grab the statusCode
   * and data from that.
   */
  public boomify(): Boom<unknown> {
    const message = this.wrappedError?.message ?? this.message;
    let statusCode = 500;
    let data: unknown | undefined;

    if (isBoom(this.wrappedError)) {
      data = this.wrappedError?.data;
      statusCode = this.wrappedError?.output?.statusCode ?? 500;
    }

    return new Boom(message, {
      data,
      statusCode,
    });
  }
}

/**
 * Type guard for determining if an error is a CaseError
 */
export function isCaseError(error: unknown): error is CaseError {
  return error instanceof CaseError;
}

/**
 * Type guard for determining if an error is an HTTPError
 */
export function isHTTPError(error: unknown): error is HTTPError {
  return (error as HTTPError)?.statusCode != null;
}

/**
 * Create a CaseError that wraps the original thrown error. This also logs the message that will be placed in the CaseError
 * if the logger was defined.
 */
export function createCaseError({
  message,
  error,
  logger,
}: {
  message?: string;
  error?: Error;
  logger?: Logger;
}) {
  const logMessage: string | undefined = message ?? error?.toString();
  if (logMessage !== undefined) {
    logger?.error(logMessage);
  }

  return new CaseError(message, error);
}

export const isSOError = <T>(so: { error?: unknown }): so is SOWithErrors<T> =>
  isSavedObjectErrorResult(so as { error?: SavedObjectError });

export const isSODecoratedError = (
  error: SavedObjectError | DecoratedError
): error is DecoratedError => Boolean((error as DecoratedError).isBoom);

export const createCaseErrorFromSOError = (
  error: SavedObjectError | DecoratedError,
  message: string
) => {
  if (isSODecoratedError(error)) {
    return createCaseError({
      message: `${message}: ${error.output.payload.error}`,
      error: new Boom(error.message, {
        statusCode: error.output.statusCode,
        message: error.output.payload.message,
      }),
    });
  }

  return createCaseError({
    message: `${message}: ${error.error}`,
    error: new Boom(error.message, {
      statusCode: error.statusCode,
      message: error.message,
    }),
  });
};

export const generateCaseErrorResponse = (
  error: SavedObjectError | DecoratedError
): CaseErrorResponse => {
  if (isSODecoratedError(error)) {
    return {
      error: error.output.payload.error,
      message: error.output.payload.message,
      status: error.output.statusCode,
    };
  }

  return {
    error: error.error,
    message: error.message,
    status: error.statusCode,
  };
};
