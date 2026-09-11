/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse } from '@kbn/core/server';
import { transformError } from '@kbn/securitysolution-es-utils';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import {
  CUSTOM_HIGHLIGHTED_FIELDS_API_EDIT,
  ENABLE_DISABLE_RULES_API_PRIVILEGE,
  EXCEPTIONS_API_ALL,
  INVESTIGATION_GUIDE_API_EDIT,
  RULES_API_ALL,
} from '@kbn/security-solution-features/constants';
import { validateRuleResponseActions } from '../../../../../../endpoint/services';
import type { PatchRuleResponse } from '../../../../../../../common/api/detection_engine/rule_management';
import {
  UnresolvedRulePatchProps,
  validatePatchRuleRequestBody,
} from '../../../../../../../common/api/detection_engine/rule_management';
import { DETECTION_ENGINE_RULES_URL } from '../../../../../../../common/constants';
import type { SecuritySolutionPluginRouter } from '../../../../../../types';
import { buildSiemResponse } from '../../../../routes/utils';
import { readRules } from '../../../logic/detection_rules_client/read_rules';
import { checkDefaultRuleExceptionListReferences } from '../../../logic/exceptions/check_for_default_rule_exception_list';
import { validateRuleDefaultExceptionList } from '../../../logic/exceptions/validate_rule_default_exception_list';
import { getIdError } from '../../../utils/utils';

export const patchRuleRoute = (router: SecuritySolutionPluginRouter) => {
  router.versioned
    .patch({
      access: 'public',
      path: DETECTION_ENGINE_RULES_URL,
      security: {
        authz: {
          requiredPrivileges: [
            {
              anyRequired: [
                RULES_API_ALL,
                EXCEPTIONS_API_ALL,
                CUSTOM_HIGHLIGHTED_FIELDS_API_EDIT,
                INVESTIGATION_GUIDE_API_EDIT,
                ENABLE_DISABLE_RULES_API_PRIVILEGE,
              ],
            },
          ],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            // Only the type-independent props are validated here: `type` is optional in patch
            // bodies, so the type-specific union cannot be resolved until the existing rule is
            // fetched. Type-specific fields are preserved and validated further down the stack,
            // once the rule type is known.
            body: buildRouteValidationWithZod(UnresolvedRulePatchProps),
          },
        },
      },
      async (context, request, response): Promise<IKibanaResponse<PatchRuleResponse>> => {
        const siemResponse = buildSiemResponse(response);
        const validationErrors = validatePatchRuleRequestBody(request.body);
        if (validationErrors.length) {
          return siemResponse.error({ statusCode: 400, body: validationErrors });
        }
        try {
          const params = request.body;
          const securitySolutionCtx = await context.securitySolution;

          const rulesClient = await (await context.alerting).getRulesClient();
          const detectionRulesClient = securitySolutionCtx.getDetectionRulesClient();

          const existingRule = await readRules({
            rulesClient,
            ruleId: params.rule_id,
            id: params.id,
          });

          if (!existingRule) {
            const error = getIdError({ id: params.id, ruleId: params.rule_id });
            return siemResponse.error({
              body: error.message,
              statusCode: error.statusCode,
            });
          }

          await validateRuleResponseActions({
            endpointAuthz: await securitySolutionCtx.getEndpointAuthz(),
            endpointService: securitySolutionCtx.getEndpointService(),
            rulePayload: request.body,
            spaceId: securitySolutionCtx.getSpaceId(),
            existingRule,
            checkOsqueryResponseActionAuthz:
              securitySolutionCtx.getCheckOsqueryResponseActionAuthz(),
          });

          checkDefaultRuleExceptionListReferences({ exceptionLists: params.exceptions_list });
          await validateRuleDefaultExceptionList({
            exceptionsList: params.exceptions_list,
            rulesClient,
            ruleRuleId: params.rule_id,
            ruleId: params.id,
          });

          const patchedRule = await detectionRulesClient.patchRule({
            rulePatch: params,
          });

          return response.ok({
            body: patchedRule,
          });
        } catch (err) {
          const error = transformError(err);
          return siemResponse.error({
            body: error.message,
            statusCode: error.statusCode,
          });
        }
      }
    );
};
