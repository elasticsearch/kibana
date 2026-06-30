/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import type { Logger, StartServicesAccessor } from '@kbn/core/server';
import {
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MAX_THRESHOLD,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MIN_THRESHOLD,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_ENABLED,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_CONNECTOR_ID,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_CREATE_CONVERSATION,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_ENABLED,
} from '@kbn/management-settings-ids';
import {
  ALERT_VALIDATION_WORKFLOW_API_VERSION,
  ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE,
  AlertValidationWorkflowSettings,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG_DEFAULT,
} from '@kbn/workflows/common/alert_validation_workflow';
import type { SecuritySolutionPluginRouter } from '../types';
import type { StartPlugins } from '../plugin';
import {
  getSecurityAlertValidationWorkflowIdForSpace,
  initSecurityManagedWorkflowsClient,
  installSecurityAlertValidationWorkflow,
  type SecurityAlertValidationWorkflowSettings,
} from './managed_workflows';

export { ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE };

const AlertValidationWorkflowSettingsWithConnectorRequestBody =
  AlertValidationWorkflowSettings.extend({
    connectorId: z.string().optional(),
    workflowEnabled: z.boolean().optional(),
    createConversation: z.boolean().optional(),
  }).refine(
    ({ autoCloseConfidenceScoreMinThreshold, autoCloseConfidenceScoreMaxThreshold }) =>
      autoCloseConfidenceScoreMinThreshold < autoCloseConfidenceScoreMaxThreshold,
    {
      message: 'Minimum confidence score must be lower than maximum confidence score',
      path: ['autoCloseConfidenceScoreMaxThreshold'],
    }
  );

type AlertValidationWorkflowSettingsWithConnectorRequestBodyType = z.infer<
  typeof AlertValidationWorkflowSettingsWithConnectorRequestBody
>;

const toWorkflowSettings = ({
  autoCloseEnabled,
  autoCloseConfidenceScoreMinThreshold,
  autoCloseConfidenceScoreMaxThreshold,
  connectorId,
  workflowEnabled,
  createConversation,
}: AlertValidationWorkflowSettingsWithConnectorRequestBodyType): SecurityAlertValidationWorkflowSettings => ({
  autoCloseEnabled,
  autoCloseConfidenceScoreMinThreshold,
  autoCloseConfidenceScoreMaxThreshold,
  connectorId: connectorId ?? '',
  workflowEnabled: workflowEnabled ?? true,
  createConversation: createConversation ?? true,
});

export const registerAlertValidationWorkflowSettingsRoutes = (
  router: SecuritySolutionPluginRouter,
  getStartServices: StartServicesAccessor<StartPlugins>,
  logger: Logger
): void => {
  router.versioned
    .get({
      path: ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['manage_advanced_settings'],
        },
      },
    })
    .addVersion(
      {
        version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
        validate: false,
      },
      async (context, request, response) => {
        const [coreStart] = await getStartServices();
        const uiSettingsClient = coreStart.uiSettings.asScopedToClient(
          coreStart.savedObjects.getScopedClient(request)
        );

        const settings = {
          workflowEnabled: await uiSettingsClient.get<boolean>(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_ENABLED
          ),
          autoCloseEnabled: await uiSettingsClient.get<boolean>(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_ENABLED
          ),
          autoCloseConfidenceScoreMinThreshold: await uiSettingsClient.get<number>(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MIN_THRESHOLD
          ),
          autoCloseConfidenceScoreMaxThreshold: await uiSettingsClient.get<number>(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MAX_THRESHOLD
          ),
          connectorId: await uiSettingsClient.get<string>(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_CONNECTOR_ID
          ),
          createConversation: await uiSettingsClient.get<boolean>(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_CREATE_CONVERSATION
          ),
        };

        const spaceId = (await context.securitySolution).getSpaceId();

        return response.ok({
          body: {
            settings,
            workflowId: getSecurityAlertValidationWorkflowIdForSpace(spaceId),
          },
        });
      }
    );

  router.versioned
    .put({
      path: ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['manage_advanced_settings'],
        },
      },
    })
    .addVersion(
      {
        version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
        validate: {
          request: {
            body: buildRouteValidationWithZod(
              AlertValidationWorkflowSettingsWithConnectorRequestBody
            ),
          },
        },
      },
      async (context, request, response) => {
        const [coreStart, pluginsStart] = await getStartServices();
        const isEnabled = await coreStart.featureFlags.getBooleanValue(
          MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG,
          MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG_DEFAULT
        );

        if (!isEnabled) {
          return response.notFound();
        }

        const { workflowsExtensions } = pluginsStart;
        if (!workflowsExtensions) {
          return response.customError({
            statusCode: 503,
            body: {
              message: 'Managed workflows are unavailable',
            },
          });
        }

        try {
          const settings = toWorkflowSettings(request.body);
          const uiSettingsClient = coreStart.uiSettings.asScopedToClient(
            coreStart.savedObjects.getScopedClient(request)
          );
          await uiSettingsClient.set(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_ENABLED,
            settings.workflowEnabled
          );
          await uiSettingsClient.set(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_ENABLED,
            settings.autoCloseEnabled
          );
          await uiSettingsClient.set(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MIN_THRESHOLD,
            settings.autoCloseConfidenceScoreMinThreshold
          );
          await uiSettingsClient.set(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MAX_THRESHOLD,
            settings.autoCloseConfidenceScoreMaxThreshold
          );
          await uiSettingsClient.set(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_CONNECTOR_ID,
            settings.connectorId
          );
          await uiSettingsClient.set(
            SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_CREATE_CONVERSATION,
            settings.createConversation
          );

          const managedWorkflowsClient = await initSecurityManagedWorkflowsClient(
            workflowsExtensions
          );
          const spaceId = (await context.securitySolution).getSpaceId();
          await installSecurityAlertValidationWorkflow({
            managedWorkflowsClient,
            spaceId,
            settings,
          });

          return response.ok({
            body: {
              settings,
              installed: true,
              workflowId: getSecurityAlertValidationWorkflowIdForSpace(spaceId),
            },
          });
        } catch (error) {
          logger.warn('Failed to save alert analysis workflow settings', { error });
          return response.customError({
            statusCode: 500,
            body: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
    );
};
