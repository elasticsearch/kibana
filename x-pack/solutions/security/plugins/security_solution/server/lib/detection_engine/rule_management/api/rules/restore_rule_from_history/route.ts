/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse } from '@kbn/core/server';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { RULES_API_ALL } from '@kbn/security-solution-features/constants';
import {
  RULE_RESTORE_FROM_HISTORY_URL,
  RestoreRuleFromHistoryRequestBody,
  RestoreRuleFromHistoryRequestParams,
} from '../../../../../../../common/api/detection_engine/rule_management';
import type { RestoreRuleFromHistoryResponse } from '../../../../../../../common/api/detection_engine/rule_management';
import type { SecuritySolutionPluginRouter } from '../../../../../../types';
import { buildSiemResponse } from '../../../../routes/utils';
import { RuleConcurrencyError } from '../../../logic/detection_rules_client/utils';

export const restoreRuleFromHistoryRoute = (router: SecuritySolutionPluginRouter) => {
  router.versioned
    .post({
      access: 'internal',
      path: RULE_RESTORE_FROM_HISTORY_URL,
      security: {
        authz: {
          requiredPrivileges: [RULES_API_ALL],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(RestoreRuleFromHistoryRequestParams),
            body: buildRouteValidationWithZod(RestoreRuleFromHistoryRequestBody),
          },
        },
      },
      async (
        context,
        request,
        response
      ): Promise<IKibanaResponse<RestoreRuleFromHistoryResponse>> => {
        const siemResponse = buildSiemResponse(response);

        try {
          const { ruleId, changeId } = request.params;
          const { revision } = request.body;

          const ctx = await context.resolve(['securitySolution']);
          const detectionRulesClient = ctx.securitySolution.getDetectionRulesClient();

          const result = await detectionRulesClient.restoreRuleFromHistory({
            ruleId,
            changeId,
            currentRuleRevision: revision,
          });

          return response.ok({ body: result });
        } catch (err) {
          if (err instanceof RuleConcurrencyError) {
            return response.conflict({
              body: { message: err.message, attributes: { revision: err.currentRevision } },
            });
          }

          const error = transformError(err);
          return siemResponse.error({
            body: error.message,
            statusCode: error.statusCode,
          });
        }
      }
    );
};
