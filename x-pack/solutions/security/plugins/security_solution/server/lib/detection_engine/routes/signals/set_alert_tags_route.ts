/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import {
  ALERTS_API_ALL,
  ALERTS_API_UPDATE_DEPRECATED_PRIVILEGE,
} from '@kbn/security-solution-features/constants';
import { SetAlertTagsRequestBody } from '../../../../../common/api/detection_engine/alert_tags';
import type { SecuritySolutionPluginRouter } from '../../../../types';
import {
  DEFAULT_ALERTS_INDEX,
  DETECTION_ENGINE_ALERT_TAGS_URL,
} from '../../../../../common/constants';
import { buildSiemResponse } from '../utils';
import { validateAlertTagsArrays } from '../common/validators/validate_alert_arrays';
import { updateAlertsTags } from '../common/operations/update_alerts_tags';
import { withSiemErrorHandling } from '../with_siem_error_handling';

export const setAlertTagsRoute = (router: SecuritySolutionPluginRouter) => {
  router.versioned
    .post({
      path: DETECTION_ENGINE_ALERT_TAGS_URL,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [
            { anyRequired: [ALERTS_API_ALL, ALERTS_API_UPDATE_DEPRECATED_PRIVILEGE] },
          ],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            body: buildRouteValidationWithZod(SetAlertTagsRequestBody),
          },
        },
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);
        const { ids, tags } = request.body;

        const validationErrors = validateAlertTagsArrays(tags, ids);
        if (validationErrors.length) {
          return siemResponse.error({ statusCode: 400, body: validationErrors });
        }

        const securitySolution = await context.securitySolution;
        if (securitySolution?.getAppClient() == null) {
          return siemResponse.error({ statusCode: 404 });
        }

        const spaceId = securitySolution.getSpaceId() ?? 'default';
        const index = `${DEFAULT_ALERTS_INDEX}-${spaceId}`;

        return withSiemErrorHandling(response, () =>
          updateAlertsTags({ context, index, ids, tags })
        );
      }
    );
};
