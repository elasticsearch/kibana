/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  GENERALIZE_FROM_TELEMETRY_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  buildFindingCardUiHints,
  withUiHints,
} from '../../../common/threat_intelligence/hub';
import { generalizeFromTelemetry } from '../services';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import { resolveScopedModel } from './lib/scoped_model';
import type { RouteRegistrationDeps } from '.';

const alertSampleSchema = schema.object({
  alert_id: schema.string({ minLength: 1 }),
  rule_name: schema.maybe(schema.string()),
  technique_ids: schema.maybe(schema.arrayOf(schema.string())),
  summary: schema.string({ minLength: 1 }),
});

const generalizeFromTelemetryBodySchema = schema.object({
  question: schema.string({ minLength: 1 }),
  alerts: schema.arrayOf(alertSampleSchema, { minSize: 1, maxSize: 50 }),
  llm_confidence_threshold: schema.maybe(schema.number({ min: 0, max: 1 })),
  persist_synthetic_report: schema.maybe(schema.boolean()),
});

/**
 * Public route for the `generalize_from_telemetry` domain action
 * (Phase C — closes the brittle-alert → durable-behavioral-rule loop).
 *
 * Like `hunt_behavior`, requires a `ScopedModel` resolved via the
 * inference plugin. The synthetic report write is gated on the
 * `writeSubscriptions` privilege (it persists to the threat-reports data
 * stream) so this route requires the "write" tier of the threat-intel
 * feature.
 */
export const registerGeneralizeFromTelemetryRoute = ({
  router,
  logger,
  getSpacesService,
  getInference,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: GENERALIZE_FROM_TELEMETRY_API_PATH,
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
        validate: { request: { body: generalizeFromTelemetryBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);

        const modelOutcome = await resolveScopedModel({
          inference: getInference(),
          request,
          uiSettingsClient: core.uiSettings.client,
          logger,
        });
        if (!modelOutcome.ok) {
          return response.customError({
            statusCode: modelOutcome.reason === 'no_inference_plugin' ? 503 : 400,
            body: { message: modelOutcome.message },
          });
        }

        try {
          const result = await generalizeFromTelemetry(
            esClient,
            modelOutcome.model,
            logger,
            spaceId,
            {
              question: request.body.question,
              alerts: request.body.alerts,
              llm_confidence_threshold: request.body.llm_confidence_threshold,
              persist_synthetic_report: request.body.persist_synthetic_report,
            }
          );
          const uiHints = buildFindingCardUiHints(result.attachment_hints);
          return response.ok({
            body: withUiHints({ body: result, uiHints }),
          });
        } catch (err) {
          logger.warn(`generalize_from_telemetry failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: {
              message:
                `LLM extraction failed: ${(err as Error).message}. ` +
                `Verify a default GenAI connector is configured.`,
            },
          });
        }
      }
    );
};
