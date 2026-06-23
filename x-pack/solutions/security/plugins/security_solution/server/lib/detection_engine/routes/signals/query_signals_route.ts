/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { ALERTS_API_READ } from '@kbn/security-solution-features/constants';

import { SearchAlertsRequestBody } from '../../../../../common/api/detection_engine/signals';
import type { SecuritySolutionPluginRouter } from '../../../../types';
import { DETECTION_ENGINE_QUERY_SIGNALS_URL } from '../../../../../common/constants';
import { buildSiemResponse } from '../utils';
import { searchAlerts } from '../common/operations/search_alerts';
import { validateSearchAlertsParams } from '../common/validators/validate_search_alerts_params';
import { withSiemErrorHandling } from '../with_siem_error_handling';

export const querySignalsRoute = (
  router: SecuritySolutionPluginRouter,
  ruleDataClient: IRuleDataClient | null
) => {
  router.versioned
    .post({
      path: DETECTION_ENGINE_QUERY_SIGNALS_URL,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [ALERTS_API_READ],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            body: buildRouteValidationWithZod(SearchAlertsRequestBody),
          },
        },
      },
      async (context, request, response) => {
        const params = request.body;

        const validationError = validateSearchAlertsParams(params);
        if (validationError) {
          return buildSiemResponse(response).error({ statusCode: 400, body: validationError });
        }

        const spaceId = (await context.securitySolution).getSpaceId();
        const index = ruleDataClient?.indexNameWithNamespace(spaceId);

        return withSiemErrorHandling(response, () => searchAlerts({ context, index, params }));
      }
    );
};
