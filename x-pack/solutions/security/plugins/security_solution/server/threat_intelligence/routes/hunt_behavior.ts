/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  HUNT_BEHAVIOR_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  buildFindingCardUiHints,
  withUiHints,
} from '../../../common/threat_intelligence/hub';
import { huntBehavior } from '../services';
import { resolveScopedModel } from './lib/scoped_model';
import type { RouteRegistrationDeps } from '.';

const huntBehaviorBodySchema = schema.object({
  text: schema.string({ minLength: 1 }),
  report_id: schema.maybe(schema.string({ minLength: 1 })),
  llm_confidence_threshold: schema.maybe(schema.number({ min: 0, max: 1 })),
});

// Same ceiling as `extract_iocs` — workflow 2 forwards full report bodies.
const HUNT_BEHAVIOR_MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Public route for the `hunt_behavior` domain action.
 *
 * Resolves a `ScopedModel` from the optional inference plugin (mirroring
 * `nl_to_esql_route.ts`) and delegates to the shared `huntBehavior`
 * service. Returns 503 when no GenAI connector is configured so the agent
 * can fall back to IOC matching.
 */
export const registerHuntBehaviorRoute = ({
  router,
  logger,
  getInference,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: HUNT_BEHAVIOR_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.read],
        },
      },
      options: {
        body: {
          accepts: ['application/json'],
          maxBytes: HUNT_BEHAVIOR_MAX_BODY_BYTES,
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: huntBehaviorBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;

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
          const result = await huntBehavior(modelOutcome.model, logger, {
            text: request.body.text,
            report_id: request.body.report_id,
            llm_confidence_threshold: request.body.llm_confidence_threshold,
          });
          const uiHints = buildFindingCardUiHints(result.attachment_hints);
          return response.ok({
            body: withUiHints({ body: result, uiHints }),
          });
        } catch (err) {
          logger.warn(`hunt_behavior failed: ${(err as Error).message}`);
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
