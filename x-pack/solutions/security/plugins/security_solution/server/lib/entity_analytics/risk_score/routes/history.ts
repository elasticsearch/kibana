/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, Logger } from '@kbn/core/server';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { APP_ID, API_VERSIONS } from '../../../../../common/constants';
import { RISK_SCORE_HISTORY_URL } from '../../../../../common/entity_analytics/risk_score/constants';
import type { RiskScoreHistoryResponse } from '../../../../../common/api/entity_analytics';
import { GetRiskScoreHistoryRequestQuery } from '../../../../../common/api/entity_analytics';
import type { EntityAnalyticsRoutesDeps } from '../../types';
import { withMinimumLicense } from '../../utils/with_minimum_license';

const DEFAULT_FROM = 'now-90d';
const DEFAULT_TO = 'now';
const DEFAULT_PAGE_SIZE = 100;

export const riskScoreHistoryRoute = (
  router: EntityAnalyticsRoutesDeps['router'],
  logger: Logger
) => {
  router.versioned
    .get({
      path: RISK_SCORE_HISTORY_URL,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: ['securitySolution', `${APP_ID}-entity-analytics`],
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            query: buildRouteValidationWithZod(GetRiskScoreHistoryRequestQuery),
          },
        },
      },
      withMinimumLicense(
        async (context, request, response): Promise<IKibanaResponse<RiskScoreHistoryResponse>> => {
          const siemResponse = buildSiemResponse(response);

          try {
            const {
              entity_type: entityType,
              entity_id: entityId,
              from,
              to,
              score_type: scoreType,
              page_size: pageSize,
            } = request.query;

            const riskScoreDataClient = (await context.securitySolution).getRiskScoreDataClient();

            const entries = await riskScoreDataClient.getRiskScoreHistory({
              entityType,
              entityId,
              range: { gte: from ?? DEFAULT_FROM, lte: to ?? DEFAULT_TO },
              scoreType,
              pageSize: pageSize ?? DEFAULT_PAGE_SIZE,
            });

            return response.ok({
              body: {
                entity_id: entityId,
                entity_type: entityType,
                entries,
              },
            });
          } catch (e) {
            const error = transformError(e);

            return siemResponse.error({
              statusCode: error.statusCode,
              body: { message: error.message, full_error: JSON.stringify(e) },
              bypassErrorFormat: true,
            });
          }
        },
        'platinum'
      )
    );
};
