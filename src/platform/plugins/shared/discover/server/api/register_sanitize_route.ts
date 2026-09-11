/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { MAX_ID_LENGTH } from '@kbn/as-code-shared-schemas';
import { logRequest } from '@kbn/as-code-utils';
import { schema } from '@kbn/config-schema';
import type { VersionedRouter } from '@kbn/core-http-server';
import type { Logger, RequestHandlerContext } from '@kbn/core/server';
import { SCHEMA_DISCOVER_SESSION_LATEST } from '@kbn/saved-search-plugin/server';
import { MAX_DISCOVER_SESSION_TAGS } from '@kbn/discover-session-constants';
import {
  DISCOVER_SESSION_API_VERSION,
  DISCOVER_SESSION_INTERNAL_API_BASE_PATH,
} from '../../common/constants';
import { discoverSessionSanitizeResponseSchema } from './schema';
import { sanitizeDiscoverSession } from './session_sanitize';

export const registerSanitizeRoute = (
  router: VersionedRouter<RequestHandlerContext>,
  logger: Logger
) => {
  router
    .post({
      path: `${DISCOVER_SESSION_INTERNAL_API_BASE_PATH}/_sanitize`,
      summary: 'Sanitize a Discover session',
      access: 'internal',
      security: {
        authz: {
          enabled: false,
          reason: 'This route only transforms request data and does not access protected resources',
        },
      },
    })
    .addVersion(
      {
        version: DISCOVER_SESSION_API_VERSION,
        validate: {
          request: {
            body: schema.object({
              attributes: SCHEMA_DISCOVER_SESSION_LATEST,
              tags: schema.maybe(
                schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), {
                  maxSize: MAX_DISCOVER_SESSION_TAGS,
                })
              ),
            }),
          },
          response: {
            200: {
              body: () => discoverSessionSanitizeResponseSchema,
              description: 'Success',
            },
            400: { description: 'Invalid request' },
            500: { description: 'Internal server error' },
          },
        },
      },
      async (_context, request, response) => {
        try {
          return response.ok({ body: sanitizeDiscoverSession(request.body) });
        } catch (error) {
          const message = error.stack ?? error.message;
          logRequest(logger, request, 'error', message);
          throw error;
        }
      }
    );
};
