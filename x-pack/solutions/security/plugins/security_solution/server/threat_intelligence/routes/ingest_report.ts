/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  INGEST_REPORT_API_PATH,
  SEVERITY_LEVELS,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  type SeverityLevel,
} from '../../../common/threat_intelligence/hub';
import { ingestReport } from '../services';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import type { RouteRegistrationDeps } from '.';

const ingestReportBodySchema = schema.object({
  title: schema.string({ minLength: 1 }),
  body_text: schema.string({ minLength: 1 }),
  source_name: schema.string({ minLength: 1 }),
  source_url: schema.maybe(schema.uri()),
  severity: schema.maybe(
    schema.string({
      validate: (value) =>
        (SEVERITY_LEVELS as readonly string[]).includes(value)
          ? undefined
          : `must be one of: ${SEVERITY_LEVELS.join(', ')}`,
    })
  ),
  language: schema.maybe(schema.string()),
});

/**
 * Public route for the `ingest_report` domain action — the canonical
 * execution surface for analyst-paste / ad-hoc URL ingestion. Gated on
 * the `writeSubscriptions` privilege tier (analyst-paste requires the
 * "write" tier of the threat-intelligence feature).
 */
export const registerIngestReportRoute = ({
  router,
  logger,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: INGEST_REPORT_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.writeSubscriptions],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: ingestReportBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        try {
          const result = await ingestReport(esClient, logger, spaceId, {
            title: request.body.title,
            body_text: request.body.body_text,
            source_name: request.body.source_name,
            source_url: request.body.source_url,
            severity: request.body.severity as SeverityLevel | undefined,
            language: request.body.language,
          });
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`ingest_report failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to ingest report: ${(err as Error).message}` },
          });
        }
      }
    );
};
