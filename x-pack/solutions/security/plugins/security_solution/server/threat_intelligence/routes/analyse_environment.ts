/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  ANALYSE_ENVIRONMENT_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
} from '../../../common/threat_intelligence/hub';
import { analyseEnvironment } from '../services';
import type { RouteRegistrationDeps } from '.';

const analyseEnvironmentBodySchema = schema.object({
  lookback_days: schema.maybe(schema.number({ min: 1, max: 90 })),
  index_patterns: schema.maybe(schema.arrayOf(schema.string({ minLength: 1 }))),
});

/**
 * Public route for the `analyse_environment` domain action — coarse
 * customer profile (active integration data streams + OS family mix +
 * cloud-provider mix).
 */
export const registerAnalyseEnvironmentRoute = ({
  router,
  logger,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: ANALYSE_ENVIRONMENT_API_PATH,
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
        validate: { request: { body: analyseEnvironmentBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        try {
          const result = await analyseEnvironment(esClient, logger, {
            lookback_days: request.body.lookback_days,
            index_patterns: request.body.index_patterns,
          });
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`analyse_environment failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: {
              message: `Failed to profile environment: ${(err as Error).message}`,
            },
          });
        }
      }
    );
};
