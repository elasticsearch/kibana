/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { ALERTS_API_READ } from '@kbn/security-solution-features/constants';

import { SearchAttacksRequestBody } from '../../../../../common/api/detection_engine/attacks';
import { DETECTION_ENGINE_ATTACKS_SEARCH_URL } from '../../../../../common/constants';
import type { SecuritySolutionPluginRouter } from '../../../../types';
import { buildSiemResponse } from '../utils';
import { searchAlerts } from '../common/operations/search_alerts';
import { validateSearchAlertsParams } from '../common/validators/validate_search_alerts_params';
import { getAttackAlertsIndex } from '../common/index_patterns/get_attack_alerts_index';
import { withSiemErrorHandling } from '../with_siem_error_handling';

export const searchAttacksRoute = (router: SecuritySolutionPluginRouter) => {
  router.versioned
    .post({
      path: DETECTION_ENGINE_ATTACKS_SEARCH_URL,
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
            body: buildRouteValidationWithZod(SearchAttacksRequestBody),
          },
        },
      },
      async (context, request, response) => {
        const params = request.body;

        const validationError = validateSearchAlertsParams(params);
        if (validationError) {
          return buildSiemResponse(response).error({ statusCode: 400, body: validationError });
        }

        const index = await getAttackAlertsIndex({ context });

        return withSiemErrorHandling(response, () => searchAlerts({ context, index, params }));
      }
    );
};
