/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaResponseFactory } from '@kbn/core/server';

import {
  LibraryDisabledError,
  LibraryFetchError,
  LibraryNotFoundError,
} from '../../../library/errors';

/**
 * Maps library-layer errors to HTTP responses. Kept separate from the
 * existing `handleRouteError` in `api/routes/utils/route_error_handlers.ts`
 * because library errors are a distinct family (no overlap in classes) and
 * the mapping decisions are local (e.g. `LibraryFetchError(reason='unavailable')`
 * → 503 with a tech-preview-friendly message).
 */
export function mapLibraryError(response: KibanaResponseFactory, error: unknown) {
  if (error instanceof LibraryDisabledError) {
    return response.customError({
      statusCode: error.statusCode,
      body: { message: error.message },
    });
  }

  if (error instanceof LibraryNotFoundError) {
    return response.notFound({ body: { message: error.message } });
  }

  if (error instanceof LibraryFetchError) {
    // 'unavailable' and 'connection' both mean "upstream not reachable / not
    // ready"; surface as 503 so callers can retry.
    // 'http-error' and 'malformed' mean the upstream gave us something
    // unusable — surface as 503 as well for tech preview (single retry-able
    // status). Promote to 502 later if/when consumers care to distinguish.
    return response.customError({
      statusCode: 503,
      body: { message: error.message },
    });
  }

  return response.customError({
    statusCode: 500,
    body: {
      message: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
    },
  });
}
