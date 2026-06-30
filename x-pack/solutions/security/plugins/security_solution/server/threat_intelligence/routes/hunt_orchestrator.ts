/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  HUNT_ORCHESTRATED_API_PATH,
  HUNT_TIER2_WHEN_OPTIONS,
  IOC_TYPES,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  type HuntTier2When,
} from '../../../common/threat_intelligence/hub';
import { huntOrchestrated, type HuntIoc } from '../services';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import { resolveScopedModel } from './lib/scoped_model';
import type { RouteRegistrationDeps } from '.';

const huntOrchestratedBodySchema = schema.object({
  report_id: schema.maybe(schema.string({ minLength: 1 })),
  text: schema.maybe(schema.string({ minLength: 1 })),
  iocs: schema.maybe(
    schema.arrayOf(
      schema.object({
        type: schema.string({
          validate: (value) =>
            (IOC_TYPES as readonly string[]).includes(value)
              ? undefined
              : `must be one of: ${IOC_TYPES.join(', ')}`,
        }),
        value: schema.string({ minLength: 1 }),
      })
    )
  ),
  techniques: schema.maybe(schema.arrayOf(schema.string({ minLength: 1 }))),
  time_range: schema.maybe(
    schema.object({
      from: schema.string(),
      to: schema.string(),
    })
  ),
  size: schema.maybe(schema.number({ min: 1, max: 100 })),
  max_assets: schema.maybe(schema.number({ min: 1, max: 500 })),
  llm_confidence_threshold: schema.maybe(schema.number({ min: 0, max: 1 })),
  tier2_when: schema.maybe(
    schema.string({
      validate: (value) =>
        (HUNT_TIER2_WHEN_OPTIONS as readonly string[]).includes(value)
          ? undefined
          : `must be one of: ${HUNT_TIER2_WHEN_OPTIONS.join(', ')}`,
    })
  ),
  max_tier2_sample_events: schema.maybe(schema.number({ min: 0, max: 25 })),
});

/**
 * Public route for the `hunt_orchestrated` domain action — the
 * tradecraft-style Tier 1 → Tier 2 chain in a single call. Workflows
 * (digest delivery, hit provenance backfill, future advisory synthesis)
 * use this so they get Tier 2 corroboration without encoding the
 * chaining themselves; the granular routes remain available for
 * power-user and LLM-driven control flows.
 *
 * Resolves a `ScopedModel` the same way `hunt_behavior` does. Unlike
 * `hunt_behavior`, the absence of an inference plugin / GenAI connector
 * is NOT a 503 — Tier 1 still runs and the response carries an explicit
 * `tier2_skipped_reason: 'no_inference'`. This degraded-but-useful
 * shape is what the digest workflow expects: it should produce an
 * IOC-only digest when GenAI is unavailable, not fail the whole run.
 */
export const registerHuntOrchestratedRoute = ({
  router,
  logger,
  getInference,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: HUNT_ORCHESTRATED_API_PATH,
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
        validate: { request: { body: huntOrchestratedBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);

        // `resolveScopedModel` returns a structured failure rather than
        // throwing when GenAI is unavailable; the orchestrator handles
        // the `undefined` model by skipping Tier 2 with an explicit
        // reason, so we pass `undefined` through instead of bouncing
        // the request.
        const modelOutcome = await resolveScopedModel({
          inference: getInference(),
          request,
          uiSettingsClient: core.uiSettings.client,
          logger,
        });
        const model = modelOutcome.ok ? modelOutcome.model : undefined;

        try {
          const result = await huntOrchestrated(esClient, model, logger, {
            report_id: request.body.report_id,
            text: request.body.text,
            iocs: request.body.iocs as HuntIoc[] | undefined,
            techniques: request.body.techniques,
            time_range: request.body.time_range,
            size: request.body.size,
            max_assets: request.body.max_assets,
            llm_confidence_threshold: request.body.llm_confidence_threshold,
            tier2_when: request.body.tier2_when as HuntTier2When | undefined,
            max_tier2_sample_events: request.body.max_tier2_sample_events,
            spaceId,
          });
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`hunt_orchestrated failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: {
              message:
                `Failed to run orchestrated hunt: ${(err as Error).message}. ` +
                `If the error mentions inference, the cluster may be missing a default ` +
                `GenAI connector — Tier 2 will still degrade gracefully when one is configured.`,
            },
          });
        }
      }
    );
};
