/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { AGENTIC_INVESTIGATIONS_API_VERSION } from '../../../common/constants';
import { PROPOSAL_CHARTS_SUMMARY_URL } from '../../../common/proposals/constants';
import { proposalChartsSummaryQuerySchema } from '../../../common/proposals/proposal';
import { PROPOSALS_API_PRIVILEGE_READ } from '../constants';
import type { RouteDependencies } from '../types';
import { handleRouteError } from './handle_route_error';
import { INTERNAL_ACCESS } from './shared';

export const registerProposalStatsRoute = ({
  router,
  logger,
  getProposalsService,
  getSpaceId,
}: RouteDependencies) => {
  router.versioned
    .get({
      path: PROPOSAL_CHARTS_SUMMARY_URL,
      access: INTERNAL_ACCESS,
      security: { authz: { requiredPrivileges: [PROPOSALS_API_PRIVILEGE_READ] } },
      summary: 'Get open-proposal counts bucketed over a sliding time window',
    })
    .addVersion(
      {
        version: AGENTIC_INVESTIGATIONS_API_VERSION,
        validate: {
          request: { query: buildRouteValidationWithZod(proposalChartsSummaryQuerySchema) },
        },
      },
      async (_context, request, response) => {
        try {
          const body = await getProposalsService().chartsSummary(
            request.query,
            getSpaceId(request)
          );
          return response.ok({ body });
        } catch (error) {
          return handleRouteError(error, response, logger);
        }
      }
    );
};
