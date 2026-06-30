/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  SEARCH_BY_DIAMOND_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
} from '../../../common/threat_intelligence/hub';
import { searchByDiamond } from '../services';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import type { RouteRegistrationDeps } from '.';

const diamondVertexQueriesSchema = schema.object({
  adversary: schema.maybe(schema.string({ minLength: 1 })),
  capability: schema.maybe(schema.string({ minLength: 1 })),
  infrastructure: schema.maybe(schema.string({ minLength: 1 })),
  victim: schema.maybe(schema.string({ minLength: 1 })),
});

const searchByDiamondBodySchema = schema.object(
  {
    vertex_queries: schema.maybe(diamondVertexQueriesSchema),
    source_report_id: schema.maybe(schema.string({ minLength: 1 })),
    size: schema.maybe(schema.number({ min: 1, max: 50 })),
  },
  {
    validate: (body) => {
      if (!body.vertex_queries && !body.source_report_id) {
        return 'Either vertex_queries or source_report_id is required';
      }
      if (body.vertex_queries && body.source_report_id) {
        return 'vertex_queries and source_report_id are mutually exclusive';
      }
    },
  }
);

/**
 * Public route for the `search_by_diamond` correlation action.
 *
 * Gated on the `.correlate` privilege — the same tier as `search_by_anchors`.
 *
 * Two input modes:
 *   1. { vertex_queries } — caller supplies per-vertex free-text queries.
 *   2. { source_report_id } — service fetches the report's diamond vertex
 *      summaries and uses them as the per-vertex queries (diamond-to-diamond).
 *
 * Returns a ranked hit list and a per-vertex score matrix so the caller can
 * show *which* Diamond Model axes drove the correlation.
 */
export const registerSearchByDiamondRoute = ({
  router,
  logger,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: SEARCH_BY_DIAMOND_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.correlate],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: searchByDiamondBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);

        try {
          const result = await searchByDiamond(
            core.elasticsearch.client.asCurrentUser,
            logger,
            spaceId,
            {
              vertex_queries: request.body.vertex_queries,
              source_report_id: request.body.source_report_id,
              size: request.body.size,
            }
          );
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`search_by_diamond failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Diamond search failed: ${(err as Error).message}` },
          });
        }
      }
    );
};
