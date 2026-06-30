/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  HUNT_FOR_THREAT_API_PATH,
  IOC_TYPES,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
} from '../../../common/threat_intelligence/hub';
import { huntForThreat, type HuntIoc } from '../services';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import type { RouteRegistrationDeps } from '.';

const huntForThreatBodySchema = schema.object({
  report_id: schema.maybe(schema.string({ minLength: 1 })),
  iocs: schema.maybe(
    schema.arrayOf(
      schema.object({
        type: schema.string({
          validate: (value) =>
            (IOC_TYPES as readonly string[]).includes(value)
              ? undefined
              : `must be one of: ${IOC_TYPES.join(', ')}`,
        }),
        value: schema.string({ minLength: 1 }),
      })
    )
  ),
  techniques: schema.maybe(schema.arrayOf(schema.string({ minLength: 1 }))),
  time_range: schema.maybe(
    schema.object({
      from: schema.string(),
      to: schema.string(),
    })
  ),
  size: schema.maybe(schema.number({ min: 1, max: 100 })),
  max_assets: schema.maybe(schema.number({ min: 1, max: 500 })),
});

/**
 * Public route for the `hunt_for_threat` domain action — active forward
 * hunt across the customer environment indices for a report's IOCs and
 * ATT&CK technique IDs. The Agent Builder tool wrapper delegates to this
 * service.
 */
export const registerHuntForThreatRoute = ({
  router,
  logger,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: HUNT_FOR_THREAT_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.read],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: huntForThreatBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        try {
          const result = await huntForThreat(esClient, logger, {
            report_id: request.body.report_id,
            iocs: request.body.iocs as HuntIoc[] | undefined,
            techniques: request.body.techniques,
            time_range: request.body.time_range,
            size: request.body.size,
            max_assets: request.body.max_assets,
            spaceId,
          });
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`hunt_for_threat failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: {
              message: `Failed to hunt threat across environment: ${(err as Error).message}`,
            },
          });
        }
      }
    );
};
