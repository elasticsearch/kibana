/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  ENRICH_TAXONOMY_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  DIAMOND_GATE_CONNECTOR_SETTING_KEY,
} from '../../../common/threat_intelligence/hub';
import { enrichTaxonomy } from '../services';
import { resolveScopedModel } from './lib/scoped_model';
import type { RouteRegistrationDeps } from '.';

const enrichTaxonomyBodySchema = schema.object({
  text: schema.string({ minLength: 1 }),
  report_id: schema.maybe(schema.string({ minLength: 1 })),
  title: schema.maybe(schema.string()),
});

const ENRICH_TAXONOMY_MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Route for the `enrich_taxonomy` stage of `nl_extraction_behavioral`.
 *
 * Reads `DIAMOND_GATE_CONNECTOR_SETTING_KEY` so operators can pin the taxonomy
 * gate to a cheap model (Haiku/Sonnet) independently of the heavy
 * `extract_diamond` connector. When the setting is blank the route falls
 * through to the space-wide `genAi:defaultAIConnector`.
 *
 * Returns five fields: categories / regions / relevance /
 * detection_actionability / diamond_suitable. The workflow step reads them
 * as `steps.enrich_taxonomy.output.{field}`.
 */
export const registerEnrichTaxonomyRoute = ({
  router,
  logger,
  getInference,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: ENRICH_TAXONOMY_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.read],
        },
      },
      options: {
        body: {
          accepts: ['application/json'],
          maxBytes: ENRICH_TAXONOMY_MAX_BODY_BYTES,
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: enrichTaxonomyBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;

        let connectorIdOverride: string | undefined;
        try {
          const setting = await core.uiSettings.client.get<string>(
            DIAMOND_GATE_CONNECTOR_SETTING_KEY
          );
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
          const result = await enrichTaxonomy(modelOutcome.model, logger, {
            text: request.body.text,
            report_id: request.body.report_id,
            title: request.body.title,
          });
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`enrich_taxonomy failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: {
              message:
                `Taxonomy enrichment failed: ${(err as Error).message}. ` +
                `Verify a default GenAI connector is configured.`,
            },
          });
        }
      }
    );
};
