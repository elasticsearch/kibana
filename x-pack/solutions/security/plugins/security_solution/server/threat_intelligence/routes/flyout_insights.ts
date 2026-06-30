/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  FLYOUT_INSIGHTS_API_PATH,
  INDICATOR_REFERENCE_PREFIX,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
} from '../../../common/threat_intelligence/hub';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import { flyoutInsights, parseReportIdFromIndicatorReference } from '../services/flyout_insights';
import type { RouteRegistrationDeps } from '.';

const flyoutInsightsBodySchema = schema.object({
  alert_id: schema.string({ minLength: 1 }),
  rule_type: schema.maybe(schema.string()),
  indicator_reference: schema.maybe(schema.string()),
  technique_ids: schema.maybe(schema.arrayOf(schema.string({ minLength: 1 }))),
  max_reports: schema.maybe(schema.number({ min: 1, max: 25 })),
  require_environment_hits: schema.maybe(schema.boolean()),
});

/**
 * Public route for alert flyout threat-report provenance (RFC 0002 P0).
 */
export const registerFlyoutInsightsRoute = ({
  router,
  logger,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: FLYOUT_INSIGHTS_API_PATH,
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
        validate: { request: { body: flyoutInsightsBodySchema } },
      },
      async (context, request, response) => {
        const indicatorReference = request.body.indicator_reference;
        if (
          indicatorReference != null &&
          indicatorReference.length > 0 &&
          parseReportIdFromIndicatorReference(indicatorReference) === undefined
        ) {
          return response.badRequest({
            body: {
              message: `indicator_reference must start with "${INDICATOR_REFERENCE_PREFIX}" when set`,
            },
          });
        }

        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);

        try {
          const result = await flyoutInsights(esClient, spaceId, {
            alert_id: request.body.alert_id,
            rule_type: request.body.rule_type,
            indicator_reference: request.body.indicator_reference,
            technique_ids: request.body.technique_ids,
            max_reports: request.body.max_reports,
            require_environment_hits: request.body.require_environment_hits,
          });
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`flyout_insights failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: {
              message: `Failed to load flyout threat intelligence insights: ${
                (err as Error).message
              }`,
            },
          });
        }
      }
    );
};
