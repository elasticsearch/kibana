/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  COVERAGE_GAP_API_PATH,
  SEVERITY_LEVELS,
  SOURCE_TYPES,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  type SeverityLevel,
  type SourceType,
} from '../../../common/threat_intelligence/hub';
import { buildCoverageGapUiHints, withUiHints } from '../../../common/threat_intelligence/hub';
import { coverageGap } from '../services';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import type { RouteRegistrationDeps } from '.';

const coverageGapBodySchema = schema.object({
  time_range: schema.object({
    from: schema.string(),
    to: schema.string(),
  }),
  tags: schema.maybe(schema.arrayOf(schema.string({ minLength: 1 }))),
  source_types: schema.maybe(
    schema.arrayOf(
      schema.string({
        validate: (value) =>
          (SOURCE_TYPES as readonly string[]).includes(value)
            ? undefined
            : `must be one of: ${SOURCE_TYPES.join(', ')}`,
      })
    )
  ),
  min_severity: schema.maybe(
    schema.string({
      validate: (value) =>
        (SEVERITY_LEVELS as readonly string[]).includes(value)
          ? undefined
          : `must be one of: ${SEVERITY_LEVELS.join(', ')}`,
    })
  ),
  max_techniques: schema.maybe(schema.number({ min: 1, max: 200 })),
});

/**
 * Public route for the `coverage_gap` domain action — joins in-the-wild
 * ATT&CK techniques in the threat-reports data stream against Detection
 * Engine rules (enabled and disabled) to recommend enable vs create.
 */
export const registerCoverageGapRoute = ({
  router,
  logger,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: COVERAGE_GAP_API_PATH,
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
        validate: { request: { body: coverageGapBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const savedObjectsClient = core.savedObjects.client;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        try {
          const result = await coverageGap(esClient, savedObjectsClient, logger, spaceId, {
            time_range: request.body.time_range,
            tags: request.body.tags,
            source_types: request.body.source_types as SourceType[] | undefined,
            min_severity: request.body.min_severity as SeverityLevel | undefined,
            max_techniques: request.body.max_techniques,
          });
          const uiHints = buildCoverageGapUiHints(result.attachment_hint);
          return response.ok({
            body: withUiHints({ body: result, uiHints }),
          });
        } catch (err) {
          logger.warn(`coverage_gap failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: {
              message: `Failed to compute coverage gap: ${(err as Error).message}`,
            },
          });
        }
      }
    );
};
