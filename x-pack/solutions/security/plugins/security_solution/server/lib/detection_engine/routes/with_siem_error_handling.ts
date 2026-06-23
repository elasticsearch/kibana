/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpResponsePayload, IKibanaResponse, KibanaResponseFactory } from '@kbn/core/server';
import { transformError } from '@kbn/securitysolution-es-utils';

import { buildSiemResponse } from './utils';

/**
 * Runs an Elasticsearch operation and maps its outcome to an HTTP response:
 * resolves to `response.ok({ body })` on success, or to the standard SIEM error
 * response (`{ message, status_code }`) produced by `transformError` on failure.
 *
 * Centralizes the `try/transformError/siemResponse.error` boilerplate so the
 * operations themselves stay free of HTTP concerns.
 */
export const withSiemErrorHandling = async <T extends HttpResponsePayload>(
  response: KibanaResponseFactory,
  operation: () => Promise<T>
): Promise<IKibanaResponse> => {
  try {
    const body = await operation();
    return response.ok({ body });
  } catch (err) {
    const error = transformError(err);
    return buildSiemResponse(response).error({
      body: error.message,
      statusCode: error.statusCode,
    });
  }
};
