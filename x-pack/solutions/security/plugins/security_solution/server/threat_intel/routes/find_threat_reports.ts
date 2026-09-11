/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  FIND_THREAT_REPORTS_API_PATH,
  findThreatReportsQuerySchema,
  type ThreatReportSort,
} from '../../../common/threat_intel';
import { findThreatReports } from '../services/find_threat_reports';
import { InvalidCursorError } from '../lib/report_cursor';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import { THREAT_INTEL_READ_AUTHZ } from './lib/authz';
import { rejectUntilBootstrapped } from './lib/bootstrap_ready';
import type { RouteRegistrationDeps } from '.';

/**
 * GET `/internal/threat_intel/reports` — paginated threat report summaries
 * for the current space (+ global catalog), with opaque cursor pagination.
 */
export const registerFindThreatReportsRoute = ({
  router,
  logger,
  getSpacesService,
  getBootstrapReady,
}: RouteRegistrationDeps): void => {
  router.versioned
    .get({
      path: FIND_THREAT_REPORTS_API_PATH,
      access: 'internal',
      security: { authz: THREAT_INTEL_READ_AUTHZ },
    })
    .addVersion(
      {
        version: '1',
        validate: { request: { query: findThreatReportsQuerySchema } },
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

        try {
          const result = await findThreatReports(esClient, {
            spaceId,
            cursor: request.query.cursor,
            pageSize: request.query.pageSize,
            source: request.query.source,
            severity: request.query.severity,
            category: request.query.category,
            from: request.query.from,
            to: request.query.to,
            usableOnly: request.query.usableOnly,
            sort: request.query.sort as ThreatReportSort | undefined,
          });
          return response.ok({ body: result });
        } catch (err) {
          if (err instanceof InvalidCursorError) {
            return response.badRequest({
              body: { message: err.message },
            });
          }
          logger.warn(`find_threat_reports failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to find threat reports: ${(err as Error).message}` },
          });
        }
      }
    );
};
