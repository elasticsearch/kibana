/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { ALERTS_API_READ } from '@kbn/security-solution-features/constants';

import { SearchUnifiedAlertsRequestBody } from '../../../../../common/api/detection_engine/unified_alerts';
import type { SecuritySolutionPluginRouter } from '../../../../types';
import { DETECTION_ENGINE_SEARCH_UNIFIED_ALERTS_URL } from '../../../../../common/constants';
import { buildSiemResponse } from '../utils';
import { searchAlerts } from '../common/operations/search_alerts';
import { validateSearchAlertsParams } from '../common/validators/validate_search_alerts_params';
import { getUnifiedAlertsIndex } from '../common/index_patterns/get_unified_alerts_index';
import { withSiemErrorHandling } from '../with_siem_error_handling';

export const searchUnifiedAlertsRoute = (
  router: SecuritySolutionPluginRouter,
  ruleDataClient: IRuleDataClient | null
) => {
  router.versioned
    .post({
      path: DETECTION_ENGINE_SEARCH_UNIFIED_ALERTS_URL,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: [ALERTS_API_READ],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: buildRouteValidationWithZod(SearchUnifiedAlertsRequestBody),
          },
        },
      },
      async (context, request, response) => {
        const params = request.body;

        const validationError = validateSearchAlertsParams(params);
        if (validationError) {
          return buildSiemResponse(response).error({ statusCode: 400, body: validationError });
        }

        const index = await getUnifiedAlertsIndex({ context, ruleDataClient });

        return withSiemErrorHandling(response, () => searchAlerts({ context, index, params }));
      }
    );
};
