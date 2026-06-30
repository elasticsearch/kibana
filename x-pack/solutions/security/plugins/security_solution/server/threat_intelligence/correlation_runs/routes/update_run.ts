/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  CORRELATION_RUN_BY_ID_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
} from '../../../../common/threat_intelligence/hub';
import { resolveCurrentSpaceId } from '../../lib/space_filter';
import { createRunDataClient } from '../run_data_client';
import type { RouteRegistrationDeps } from '../../routes';

export const registerUpdateCorrelationRunRoute = ({
  router,
  logger,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .patch({
      path: CORRELATION_RUN_BY_ID_API_PATH,
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
        validate: {
          request: {
            params: schema.object({ runId: schema.string({ minLength: 1 }) }),
            body: schema.object({
              title: schema.string({ minLength: 1, maxLength: 200 }),
            }),
          },
        },
      },
      async (context, request, response) => {
        const { runId } = request.params as { runId: string };
        const { title } = request.body as { title: string };

        const core = await context.core;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        const esClient = core.elasticsearch.client.asCurrentUser;

        const runDataClient = createRunDataClient({ esClient, logger, spaceId });

        try {
          const existing = await runDataClient.getRun(runId);
          if (!existing) {
            return response.notFound({
              body: { message: `Correlation run '${runId}' not found` },
            });
          }

          await runDataClient.updateRun(runId, {
            title,
            updatedAt: new Date().toISOString(),
          });

          return response.ok({ body: { runId, title } });
        } catch (e) {
          logger.error(`[CorrelationRuns] Failed to update run title '${runId}': ${e}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to update correlation run title' },
          });
        }
      }
    );
};
