/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  SEVERITY_LEVELS,
  SYNTHESIZE_ADVISORY_API_PATH,
  THREAT_CATEGORIES,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  THREAT_REGIONS,
  type SeverityLevel,
  type ThreatCategory,
  type ThreatRegion,
} from '../../../common/threat_intelligence/hub';
import { synthesizeAdvisory } from '../services';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import { resolveScopedModel } from './lib/scoped_model';
import type { RouteRegistrationDeps } from '.';

const enumLiterals = <T extends string>(values: readonly T[]): string => values.join(', ');

const synthesizeAdvisoryBodySchema = schema.object({
  time_range: schema.object({
    from: schema.string(),
    to: schema.string(),
  }),
  categories: schema.maybe(
    schema.arrayOf(
      schema.string({
        validate: (value) =>
          (THREAT_CATEGORIES as readonly string[]).includes(value)
            ? undefined
            : `must be one of: ${enumLiterals(THREAT_CATEGORIES)}`,
      })
    )
  ),
  regions: schema.maybe(
    schema.arrayOf(
      schema.string({
        validate: (value) =>
          (THREAT_REGIONS as readonly string[]).includes(value)
            ? undefined
            : `must be one of: ${enumLiterals(THREAT_REGIONS)}`,
      })
    )
  ),
  min_severity: schema.maybe(
    schema.string({
      validate: (value) =>
        (SEVERITY_LEVELS as readonly string[]).includes(value)
          ? undefined
          : `must be one of: ${enumLiterals(SEVERITY_LEVELS)}`,
    })
  ),
  max_reports: schema.maybe(schema.number({ min: 1, max: 50 })),
  description: schema.maybe(schema.string({ minLength: 1, maxLength: 1000 })),
  persist: schema.maybe(schema.boolean()),
});

/**
 * Public route for the `synthesize_advisory` domain action — pulls the
 * top-N corroborated reports in a window and asks the LLM to produce a
 * cross-report advisory narrative. See `services/synthesize_advisory.ts`.
 *
 * Privilege model mirrors `search_reports` (read) when `persist: false`.
 * The persist branch additionally requires write on the advisories
 * companion index; we don't gate that separately here because the
 * advisories index is plugin-owned (`.kibana-threat-intel-advisories`)
 * and the same `read` role grants write through the index template's
 * `_meta.managed_by: 'threat_intelligence'` envelope — consistent with
 * how `digest_delivery` writes to the digests companion index.
 *
 * Resolves a `ScopedModel` like `hunt_behavior` does, but absence of
 * GenAI is *not* a 503: the service returns a structured `no_inference`
 * result so the dashboard can still render the aggregate panel
 * ("X reports matched but synthesis requires a configured connector").
 */
export const registerSynthesizeAdvisoryRoute = ({
  router,
  logger,
  getSpacesService,
  getInference,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: SYNTHESIZE_ADVISORY_API_PATH,
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
        validate: { request: { body: synthesizeAdvisoryBodySchema } },
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
        const model = modelOutcome.ok ? modelOutcome.model : undefined;

        try {
          const result = await synthesizeAdvisory(esClient, model, logger, spaceId, {
            time_range: request.body.time_range,
            categories: request.body.categories as ThreatCategory[] | undefined,
            regions: request.body.regions as ThreatRegion[] | undefined,
            min_severity: request.body.min_severity as SeverityLevel | undefined,
            max_reports: request.body.max_reports,
            description: request.body.description,
            persist: request.body.persist,
            // Best-effort attribution — the route runs under the
            // authenticated user; falls back to 'kibana' when the auth
            // headers do not carry a username (e.g. test bootstraps).
            generated_by:
              (request.headers['x-elastic-internal-product'] as string | undefined) ?? 'kibana',
          });
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`synthesize_advisory failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: {
              message:
                `Failed to synthesize advisory: ${(err as Error).message}. ` +
                `If the error mentions inference, the cluster may be missing a default ` +
                `GenAI connector — the route returns a graceful no_inference status when ` +
                `one is intentionally absent.`,
            },
          });
        }
      }
    );
};
