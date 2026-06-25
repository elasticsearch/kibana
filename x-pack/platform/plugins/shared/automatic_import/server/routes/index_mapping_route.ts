/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { z } from '@kbn/zod/v4';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import type { AutomaticImportPluginRequestHandlerContext } from '../types';
import { buildAutomaticImportResponse, getEsErrorType, isSecurityExceptionError } from './utils';
import { withAvailability } from './with_availability';
import { AUTOMATIC_IMPORT_API_PRIVILEGES } from '../feature';

export const INDEX_MAPPINGS_PATH = '/api/automatic_import/index_mappings/{index_name}';

const GetIndexMappingsRequestParams = z.object({
  index_name: z.string().min(1).max(255),
});

/**
 * Extracts the mappings from an `indices.getMapping` response.
 *
 * Elasticsearch keys the response by the resolved index name. When the
 * request targets a data stream or an alias, that key is a backing/concrete index
 * (e.g. `.ds-<name>-<date>-000001`) rather than the requested name, so we can't
 * assume the response is keyed by `indexName`. Fall back to the first returned key.
 */
const extractMappings = (
  hit: Record<string, { mappings?: MappingTypeMapping }>,
  indexName: string
): MappingTypeMapping | undefined => {
  const key = hit[indexName] ? indexName : Object.keys(hit)[0];
  return key ? hit[key]?.mappings : undefined;
};

/**
 * Returns the mappings for an index, data stream or alias.
 *
 * Automatic Import uses this to validate that a user-selected source contains the
 * required `event.original` field. It intentionally resolves the mappings itself
 * (rather than relying on the Index Management mapping API).
 */
export const registerIndexMappingRoutes = (
  router: IRouter<AutomaticImportPluginRequestHandlerContext>,
  logger: Logger
) => {
  router.versioned
    .get({
      access: 'internal',
      path: INDEX_MAPPINGS_PATH,
      security: {
        authz: {
          requiredPrivileges: [`${AUTOMATIC_IMPORT_API_PRIVILEGES.READ}`],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(GetIndexMappingsRequestParams),
          },
        },
      },
      withAvailability(async (context, request, response) => {
        const { index_name: indexName } = request.params;
        const automaticImportResponse = buildAutomaticImportResponse(response);
        try {
          const { esClient } = await context.automaticImport;
          const hit = await esClient.indices.getMapping({
            index: indexName,
            expand_wildcards: 'none',
          });
          return response.ok({ body: { mappings: extractMappings(hit, indexName) } });
        } catch (err) {
          logger.error(`indexMappingRoute: Caught error for index "${indexName}": ${err}`);

          if (getEsErrorType(err) === 'index_not_found_exception') {
            return automaticImportResponse.error({
              statusCode: 404,
              body: `Index, data stream, or alias "${indexName}" was not found.`,
            });
          }

          if (isSecurityExceptionError(err)) {
            return automaticImportResponse.error({
              statusCode: 403,
              body: `Insufficient privileges to read the mappings of "${indexName}". This requires the "view_index_metadata" (or "manage") privilege on the index.`,
            });
          }

          return automaticImportResponse.error({
            statusCode: 500,
            body: `An error occurred while reading the mappings of "${indexName}".`,
          });
        }
      })
    );
};
