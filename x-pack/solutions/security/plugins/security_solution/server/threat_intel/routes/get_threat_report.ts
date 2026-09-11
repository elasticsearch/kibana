/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { GET_THREAT_REPORT_API_PATH } from '../../../common/threat_intel';
import { getThreatReport, ThreatReportNotFoundError } from '../services/get_threat_report';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import { THREAT_INTEL_READ_AUTHZ } from './lib/authz';
import { rejectUntilBootstrapped } from './lib/bootstrap_ready';
import type { RouteRegistrationDeps } from '.';

const reportIdParamsSchema = schema.object({
  reportId: schema.string({ minLength: 1, maxLength: 512 }),
});

/**
 * GET `/internal/threat_intel/reports/{reportId}` — full report document for
 * the current space (+ global). Cross-space ids return 404 without leaking
 * existence.
 */
export const registerGetThreatReportRoute = ({
  router,
  logger,
  getSpacesService,
  getBootstrapReady,
}: RouteRegistrationDeps): void => {
  router.versioned
    .get({
      path: GET_THREAT_REPORT_API_PATH,
      access: 'internal',
      security: { authz: THREAT_INTEL_READ_AUTHZ },
    })
    .addVersion(
      {
        version: '1',
        validate: { request: { params: reportIdParamsSchema } },
      },
      async (context, request, response) => {
        const notReady = await rejectUntilBootstrapped(getBootstrapReady, response);
        if (notReady) return notReady;

        const core = await context.core;
        // Internal user: plugin-owned hidden indices; feature privileges do not
        // grant Elasticsearch privileges on them. Access is gated by route authz
        // and narrowed by the explicit space filter below.
        const esClient = core.elasticsearch.client.asInternalUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        const { reportId } = request.params;

        try {
          const result = await getThreatReport(esClient, { spaceId, reportId });
          return response.ok({ body: result });
        } catch (err) {
          if (err instanceof ThreatReportNotFoundError) {
            return response.notFound({
              body: { message: err.message },
            });
          }
          logger.warn(`get_threat_report failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to get threat report: ${(err as Error).message}` },
          });
        }
      }
    );
};
