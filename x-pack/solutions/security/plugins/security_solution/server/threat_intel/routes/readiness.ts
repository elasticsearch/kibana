/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { READINESS_API_PATH } from '../../../common/threat_intel';
import { getThreatIntelReadiness } from '../services/readiness';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import { THREAT_INTEL_READ_AUTHZ } from './lib/authz';
import type { RouteRegistrationDeps } from '.';

/**
 * GET `/internal/threat_intel/readiness` — pipeline readiness for hunt consumers.
 * Does not call `rejectUntilBootstrapped`; it reports bootstrap status instead.
 */
export const registerReadinessRoute = ({
  router,
  logger,
  getSpacesService,
  getBootstrapReady,
  getInference,
  getSearchInferenceEndpoints,
}: RouteRegistrationDeps): void => {
  router.versioned
    .get({
      path: READINESS_API_PATH,
      access: 'internal',
      security: { authz: THREAT_INTEL_READ_AUTHZ },
    })
    .addVersion(
      {
        version: '1',
        validate: false,
      },
      async (context, request, response) => {
        const core = await context.core;
        // Internal user: plugin-owned hidden indices; feature privileges do not
        // grant Elasticsearch privileges on them. Access is gated by route authz
        // and narrowed by the explicit space filter below.
        const esClient = core.elasticsearch.client.asInternalUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);

        try {
          const result = await getThreatIntelReadiness({
            esClient,
            spaceId,
            logger,
            getBootstrapReady,
            request,
            getInference,
            getSearchInferenceEndpoints,
          });
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`threat_intel readiness failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: {
              message: `Failed to compute threat intel readiness: ${(err as Error).message}`,
            },
          });
        }
      }
    );
};
