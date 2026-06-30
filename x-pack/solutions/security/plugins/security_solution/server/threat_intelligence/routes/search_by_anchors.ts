/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  SEARCH_BY_ANCHORS_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
} from '../../../common/threat_intelligence/hub';
import { searchByAnchors } from '../services';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import type { RouteRegistrationDeps } from '.';

const anchorIocSchema = schema.object({
  type: schema.string({ minLength: 1 }),
  value: schema.string({ minLength: 1 }),
});

const anchorSetSchema = schema.object({
  iocs: schema.maybe(schema.arrayOf(anchorIocSchema)),
  ioc_set_hash: schema.maybe(schema.nullable(schema.string({ minLength: 1 }))),
  actors: schema.maybe(schema.arrayOf(schema.string({ minLength: 1 }))),
  technique_ids: schema.maybe(schema.arrayOf(schema.string({ minLength: 1 }))),
});

const searchByAnchorsBodySchema = schema.object(
  {
    anchors: schema.maybe(anchorSetSchema),
    source_report_id: schema.maybe(schema.string({ minLength: 1 })),
    size: schema.maybe(schema.number({ min: 1, max: 50 })),
  },
  {
    validate: (body) => {
      if (!body.anchors && !body.source_report_id) {
        return 'Either anchors or source_report_id is required';
      }
      if (body.anchors && body.source_report_id) {
        return 'anchors and source_report_id are mutually exclusive';
      }
    },
  }
);

/**
 * Public route for the `search_by_anchors` correlation action.
 *
 * Gated on the `.correlate` privilege — a super-set of `read` that is
 * independently assignable on the Threat Intelligence sub-feature.
 *
 * Returns discriminating-anchor matches with a per-hit breakdown showing
 * exactly which hash IOCs, ioc_set_hash, actors, network IOCs, and
 * techniques matched so the analyst can assess WHY two reports correlate.
 */
export const registerSearchByAnchorsRoute = ({
  router,
  logger,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: SEARCH_BY_ANCHORS_API_PATH,
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
        validate: { request: { body: searchByAnchorsBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);

        try {
          const result = await searchByAnchors(
            core.elasticsearch.client.asCurrentUser,
            logger,
            spaceId,
            {
              anchors: request.body.anchors,
              source_report_id: request.body.source_report_id,
              size: request.body.size,
            }
          );
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`search_by_anchors failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Anchor search failed: ${(err as Error).message}` },
          });
        }
      }
    );
};
