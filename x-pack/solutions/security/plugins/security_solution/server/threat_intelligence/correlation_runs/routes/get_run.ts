/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  CORRELATION_RUN_BY_ID_API_PATH,
  CORRELATION_RUN_STALE_MS,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
} from '../../../../common/threat_intelligence/hub';
import { resolveCurrentSpaceId } from '../../lib/space_filter';
import { createRunDataClient } from '../run_data_client';
import type { RouteRegistrationDeps } from '../../routes';

export const registerGetCorrelationRunRoute = ({
  router,
  logger,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .get({
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
          },
        },
      },
      async (context, request, response) => {
        const { runId } = request.params as { runId: string };
        const core = await context.core;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        const esClient = core.elasticsearch.client.asCurrentUser;

        const runDataClient = createRunDataClient({ esClient, logger, spaceId });

        try {
          const run = await runDataClient.getRun(runId);

          if (!run) {
            return response.notFound({
              body: { message: `Correlation run '${runId}' not found` },
            });
          }

          // Stale-run guard: a run stuck in 'running' with no stage progress
          // for more than CORRELATION_RUN_STALE_MS is reported as failed without
          // mutating ES — prevents the UI from hanging on a crashed background job.
          if (run.status === 'running') {
            const ageMs = Date.now() - new Date(run.updatedAt).getTime();
            if (ageMs > CORRELATION_RUN_STALE_MS) {
              return response.ok({
                body: {
                  ...run,
                  status: 'failed' as const,
                  error: 'Run timed out: no progress update in the last 5 minutes',
                },
              });
            }
          }

          return response.ok({ body: run });
        } catch (e) {
          logger.error(`[CorrelationRuns] Failed to get run '${runId}': ${e}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to retrieve correlation run' },
          });
        }
      }
    );
};
