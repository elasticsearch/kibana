/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  CORRELATE_THREAT_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
} from '../../../common/threat_intelligence/hub';
import { correlateThreat } from '../services/correlate_threat';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import type { RouteRegistrationDeps } from '.';

// Matches extract_diamond — raw_text can be a full report body.
const CORRELATE_THREAT_MAX_BODY_BYTES = 10 * 1024 * 1024;

const correlateThreatBodySchema = schema.object(
  {
    raw_text: schema.maybe(schema.string({ minLength: 1 })),
    report_id: schema.maybe(schema.string({ minLength: 1 })),
    /** Phase 4 (fetch_source) — stub 400 for now. */
    url: schema.maybe(schema.string({ minLength: 1 })),
    /** Phase 5 (Cases integration) — stub 400 for now. */
    case_id: schema.maybe(schema.string({ minLength: 1 })),
    depth: schema.maybe(
      schema.oneOf([
        schema.literal('extract'),
        schema.literal('knn'),
        schema.literal('triage'),
        schema.literal('full'),
      ])
    ),
  },
  {
    validate: (body) => {
      const provided = [body.raw_text, body.report_id, body.url, body.case_id].filter(Boolean);
      if (provided.length === 0) {
        return 'One of raw_text, report_id, url, or case_id is required';
      }
      if (provided.length > 1) {
        return 'Only one input mode may be specified per request';
      }
    },
  }
);

/**
 * Public route for the `correlate_threat` correlation pipeline.
 *
 * Gated on `.correlate` privilege — mirrors `search_by_anchors` registration.
 *
 * MVP input modes: `raw_text` and `report_id`.
 * Stubs: `url` (Phase 4) and `case_id` (Phase 5) return clean 400s.
 */
export const registerCorrelateThreatRoute = ({
  router,
  logger,
  getSpacesService,
  getInference,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: CORRELATE_THREAT_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.correlate],
        },
      },
      options: {
        body: {
          accepts: ['application/json'],
          maxBytes: CORRELATE_THREAT_MAX_BODY_BYTES,
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: correlateThreatBodySchema } },
      },
      async (context, request, response) => {
        const {
          url,
          case_id: caseId,
          raw_text: rawText,
          report_id: reportId,
          depth = 'full',
        } = request.body;

        if (url) {
          return response.badRequest({
            body: { message: 'url input mode is not yet supported (Phase 4 — fetch_source)' },
          });
        }
        if (caseId) {
          return response.badRequest({
            body: { message: 'case_id input mode is not yet supported (Phase 5 — Cases)' },
          });
        }

        const core = await context.core;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        const { client: uiSettingsClient } = core.uiSettings;
        const inference = getInference();

        const input = rawText
          ? ({ mode: 'raw_text', text: rawText } as const)
          : reportId
          ? ({ mode: 'report_id', report_id: reportId } as const)
          : null;

        if (!input) {
          // Schema validation guarantees one of the above is set — unreachable.
          return response.badRequest({ body: { message: 'No valid input mode resolved' } });
        }

        try {
          const depthResult = await correlateThreat({
            esClient: core.elasticsearch.client.asCurrentUser,
            inference,
            request,
            uiSettingsClient,
            logger,
            spaceId,
            input,
            depth,
          });

          return response.ok({ body: depthResult });
        } catch (err) {
          logger.warn(`correlate_threat failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Correlation failed: ${(err as Error).message}` },
          });
        }
      }
    );
};
