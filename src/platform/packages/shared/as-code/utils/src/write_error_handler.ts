/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  IKibanaResponse,
  KibanaRequest,
  KibanaResponseFactory,
  Logger,
} from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { ValidationError } from '@kbn/config-schema';
import { logRequest } from './log_request';

export function writeErrorHandler(
  error: any,
  response: KibanaResponseFactory,
  logger: Logger,
  req: KibanaRequest
): IKibanaResponse {
  if (error.isBoom && error.output.statusCode === 403) {
    logRequest(logger, req, 'debug', error.message);
    return response.forbidden({ body: { message: error.message } });
  }

  if (error instanceof ValidationError) {
    logRequest(logger, req, 'warn', error.message);
    return response.badRequest({ body: { message: error.message } });
  }

  if (SavedObjectsErrorHelpers.isConflictError(error)) {
    logRequest(logger, req, 'debug', error.message);
    return response.conflict({ body: { message: error.message } });
  }

  const message = error.stack ?? error.message;
  logRequest(logger, req, 'error', message);
  // Throw so Kibana returns a 500 HTTP response on any uncaught errors.
  throw error;
}
