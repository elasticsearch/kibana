/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  EXTRACT_DIAMOND_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  DIAMOND_CONNECTOR_SETTING_KEY,
} from '../../../common/threat_intelligence/hub';
import { extractDiamond } from '../services';
import { resolveScopedModel } from './lib/scoped_model';
import type { RouteRegistrationDeps } from '.';

const extractDiamondBodySchema = schema.object({
  text: schema.string({ minLength: 1 }),
  report_id: schema.maybe(schema.string({ minLength: 1 })),
});

// Feeds the full report body in from the workflow — ceiling matches extract_iocs
// and hunt_behavior so oversized RSS/STIX bodies don't 413 before the route runs.
// The service truncates to DIAMOND_BODY_CHAR_LIMIT before the LLM call.
const EXTRACT_DIAMOND_MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Public route for the `extract_diamond` domain action.
 *
 * Performs a single heavy LLM call to extract all four Diamond Model vertices
 * (adversary / capability / infrastructure / victim) from a threat report. On
 * context-overflow or parse failure the service falls back to per-vertex calls
 * on the same model and stamps `extraction_mode: 'per_vertex_fallback'`.
 *
 * Invoked by `nl_extraction_behavioral` via `kibana.request` for threat-positive
 * reports (gated on `enrich_taxonomy`'s detection_actionability signal) and by
 * the `backfill_diamond_fields` Task Manager job. `.correlate` privilege is
 * deferred to Phase 2 — mirrors the `extract_iocs` / `hunt_behavior` pattern.
 */
export const registerExtractDiamondRoute = ({
  router,
  logger,
  getInference,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: EXTRACT_DIAMOND_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.read],
        },
      },
      options: {
        body: {
          accepts: ['application/json'],
          maxBytes: EXTRACT_DIAMOND_MAX_BODY_BYTES,
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: extractDiamondBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;

        let connectorIdOverride: string | undefined;
        try {
          const setting = await core.uiSettings.client.get<string>(DIAMOND_CONNECTOR_SETTING_KEY);
          if (setting) connectorIdOverride = setting;
        } catch {
          // Setting not registered in this context — fall through to default.
        }

        const modelOutcome = await resolveScopedModel({
          inference: getInference(),
          request,
          uiSettingsClient: core.uiSettings.client,
          connectorIdOverride,
          logger,
        });
        if (!modelOutcome.ok) {
          return response.customError({
            statusCode: modelOutcome.reason === 'no_inference_plugin' ? 503 : 400,
            body: { message: modelOutcome.message },
          });
        }

        try {
          const result = await extractDiamond(modelOutcome.model, logger, {
            text: request.body.text,
            report_id: request.body.report_id,
          });
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`extract_diamond failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: {
              message:
                `Diamond extraction failed: ${(err as Error).message}. ` +
                `Verify a default GenAI connector is configured.`,
            },
          });
        }
      }
    );
};
