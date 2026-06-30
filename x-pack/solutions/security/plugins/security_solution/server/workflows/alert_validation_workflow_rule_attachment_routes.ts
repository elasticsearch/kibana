/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import type { StartServicesAccessor } from '@kbn/core/server';
import { RULES_API_ALL, RULES_API_READ } from '@kbn/security-solution-features/constants';
import { transformError } from '@kbn/securitysolution-es-utils';
import {
  ALERT_VALIDATION_WORKFLOW_API_VERSION,
  ALERT_VALIDATION_WORKFLOW_RULE_SELECTION_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULE_UPDATE_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULES_ROUTE,
  AlertValidationWorkflowRuleAttachmentListRequestQuery,
  AlertValidationWorkflowRuleAttachmentSelectionRequestBody,
  AlertValidationWorkflowRuleAttachmentStatsRequestBody,
  AlertValidationWorkflowRuleAttachmentUpdateRequestBody,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG_DEFAULT,
  type AlertValidationWorkflowRuleAttachmentListRequestQuery as AlertValidationWorkflowRuleAttachmentListRequestQueryType,
  type AlertValidationWorkflowRuleAttachmentSelectionRequestBody as AlertValidationWorkflowRuleAttachmentSelectionRequestBodyType,
  type AlertValidationWorkflowRuleAttachmentStatsRequestBody as AlertValidationWorkflowRuleAttachmentStatsRequestBodyType,
  type AlertValidationWorkflowRuleAttachmentUpdateRequestBody as AlertValidationWorkflowRuleAttachmentUpdateRequestBodyType,
} from '@kbn/workflows/common/alert_validation_workflow';
import type { StartPlugins } from '../plugin';
import type { SecuritySolutionPluginRouter, SecuritySolutionRequestHandlerContext } from '../types';
import { buildSiemResponse } from '../lib/detection_engine/routes/utils';
import { createPrebuiltRuleAssetsClient } from '../lib/detection_engine/prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_client';
import { getSecurityAlertValidationWorkflowIdForSpace } from './managed_workflows';
import { createAlertValidationWorkflowRuleAttachmentService } from './alert_validation_workflow_rule_attachments';

export {
  ALERT_VALIDATION_WORKFLOW_RULE_SELECTION_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULE_UPDATE_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULES_ROUTE,
};

const isAlertValidationWorkflowEnabled = async (
  getStartServices: StartServicesAccessor<StartPlugins>
): Promise<boolean> => {
  const [coreStart] = await getStartServices();

  return coreStart.featureFlags.getBooleanValue(
    MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG,
    MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG_DEFAULT
  );
};

const createReadService = async (context: SecuritySolutionRequestHandlerContext) => {
  const ctx = await context.resolve(['securitySolution', 'alerting']);
  const rulesClient = await ctx.alerting.getRulesClient();
  const spaceId = ctx.securitySolution.getSpaceId();

  return createAlertValidationWorkflowRuleAttachmentService({
    rulesClient,
    workflowId: getSecurityAlertValidationWorkflowIdForSpace(spaceId),
  });
};

const createWriteService = async (context: SecuritySolutionRequestHandlerContext) => {
  const ctx = await context.resolve(['core', 'securitySolution', 'alerting', 'actions']);
  const rulesClient = await ctx.alerting.getRulesClient();
  const actionsClient = ctx.actions.getActionsClient();
  const detectionRulesClient = ctx.securitySolution.getDetectionRulesClient();
  const spaceId = ctx.securitySolution.getSpaceId();

  return createAlertValidationWorkflowRuleAttachmentService({
    rulesClient,
    workflowId: getSecurityAlertValidationWorkflowIdForSpace(spaceId),
    bulkEditDependencies: {
      actionsClient,
      prebuiltRuleAssetClient: createPrebuiltRuleAssetsClient(ctx.core.savedObjects.client),
      mlAuthz: ctx.securitySolution.getMlAuthz(),
      rulesAuthz: ctx.securitySolution.getRulesAuthz(),
      ruleCustomizationStatus: detectionRulesClient.getRuleCustomizationStatus(),
    },
  });
};

export const registerAlertValidationWorkflowRuleAttachmentRoutes = (
  router: SecuritySolutionPluginRouter,
  getStartServices: StartServicesAccessor<StartPlugins>
): void => {
  router.versioned
    .get({
      path: ALERT_VALIDATION_WORKFLOW_RULES_ROUTE,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: [RULES_API_READ],
        },
      },
    })
    .addVersion(
      {
        version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
        validate: {
          request: {
            query: buildRouteValidationWithZod(
              AlertValidationWorkflowRuleAttachmentListRequestQuery
            ),
          },
        },
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);

        try {
          if (!(await isAlertValidationWorkflowEnabled(getStartServices))) {
            return response.notFound();
          }

          const {
            search,
            page,
            per_page: perPage,
          } = request.query as AlertValidationWorkflowRuleAttachmentListRequestQueryType;
          const service = await createReadService(context);
          const body = await service.getRuleAttachments({ search, page, perPage });

          return response.ok({ body });
        } catch (err) {
          const error = transformError(err);
          return siemResponse.error({
            body: error.message,
            statusCode: error.statusCode,
          });
        }
      }
    );

  router.versioned
    .post({
      path: ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: [RULES_API_READ],
        },
      },
    })
    .addVersion(
      {
        version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
        validate: {
          request: {
            body: buildRouteValidationWithZod(
              AlertValidationWorkflowRuleAttachmentStatsRequestBody
            ),
          },
        },
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);

        try {
          if (!(await isAlertValidationWorkflowEnabled(getStartServices))) {
            return response.notFound();
          }

          const { search } =
            request.body as AlertValidationWorkflowRuleAttachmentStatsRequestBodyType;
          const service = await createReadService(context);
          const body = await service.getRuleAttachmentStats({ search });

          return response.ok({ body });
        } catch (err) {
          const error = transformError(err);
          return siemResponse.error({
            body: error.message,
            statusCode: error.statusCode,
          });
        }
      }
    );

  router.versioned
    .post({
      path: ALERT_VALIDATION_WORKFLOW_RULE_SELECTION_ROUTE,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: [RULES_API_READ],
        },
      },
    })
    .addVersion(
      {
        version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
        validate: {
          request: {
            body: buildRouteValidationWithZod(
              AlertValidationWorkflowRuleAttachmentSelectionRequestBody
            ),
          },
        },
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);

        try {
          if (!(await isAlertValidationWorkflowEnabled(getStartServices))) {
            return response.notFound();
          }

          const { search } =
            request.body as AlertValidationWorkflowRuleAttachmentSelectionRequestBodyType;
          const service = await createReadService(context);
          const body = await service.getRuleAttachmentSelection({ search });

          return response.ok({ body });
        } catch (err) {
          const error = transformError(err);
          return siemResponse.error({
            body: error.message,
            statusCode: error.statusCode,
          });
        }
      }
    );

  router.versioned
    .post({
      path: ALERT_VALIDATION_WORKFLOW_RULE_UPDATE_ROUTE,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: [RULES_API_ALL],
        },
      },
    })
    .addVersion(
      {
        version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
        validate: {
          request: {
            body: buildRouteValidationWithZod(
              AlertValidationWorkflowRuleAttachmentUpdateRequestBody
            ),
          },
        },
      },
      async (context, request, response) => {
        const siemResponse = buildSiemResponse(response);

        try {
          if (!(await isAlertValidationWorkflowEnabled(getStartServices))) {
            return response.notFound();
          }

          const { attachRuleIds, detachRuleIds, dryRun } =
            request.body as AlertValidationWorkflowRuleAttachmentUpdateRequestBodyType;
          const service = await createWriteService(context);
          const body = await service.updateRuleAttachments({
            attachRuleIds,
            detachRuleIds,
            dryRun,
          });

          return response.ok({ body });
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
