/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AlertingConnectorFeatureId, SecurityConnectorFeatureId } from '@kbn/actions-plugin/common';
import type {
  ActionType as ConnectorType,
  ActionTypeExecutorOptions as ConnectorTypeExecutorOptions,
  ActionTypeExecutorResult as ConnectorTypeExecutorResult,
} from '@kbn/actions-plugin/server/types';
import type { ConnectorAdapter } from '@kbn/alerting-plugin/server';
import type { KibanaRequest } from '@kbn/core/server';
import type { TriggerType, WorkflowExecutionEngineModel } from '@kbn/workflows';
import { toWorkflowExecutionEngineModel } from '@kbn/workflows';
import { validateWorkflowForExecution } from '@kbn/workflows/server';
import { z } from '@kbn/zod/v4';
import { api } from './api';
import { ExecutorParamsSchema, WorkflowsRuleActionParamsSchema } from './schema';
import {
  createExternalService,
  type ScheduleWorkflowServiceFunction,
  type WorkflowsServiceFunction,
} from './service';
import * as i18n from './translations';
import type {
  AlertStates,
  ExecutorParams,
  ExecutorSubActionRunParams,
  WorkflowsActionParamsType,
  WorkflowsExecutorResultData,
} from './types';
import { buildAlertEvent } from '../../../common/utils/build_alert_event';
import type { WorkflowsManagementApi } from '../../api/workflows_management_api';

const supportedSubActions: string[] = ['run'];
export type ActionParamsType = WorkflowsActionParamsType;
export const ConnectorTypeId = '.workflows';

export interface WorkflowsRuleActionParams {
  subAction: 'run';
  subActionParams: {
    workflowId: string;
    summaryMode?: boolean;
    alertStates?: AlertStates;
  };
  [key: string]: unknown;
}

// Interface for dependency injection, similar to GetCasesConnectorTypeArgs
export interface GetWorkflowsConnectorTypeArgs {
  getWorkflowsService?: (request: KibanaRequest) => Promise<WorkflowsServiceFunction>;
  getScheduleWorkflowService?: (request: KibanaRequest) => Promise<ScheduleWorkflowServiceFunction>;
}

// connector type definition
export function getConnectorType(
  workflowsManagementApi: WorkflowsManagementApi
): ConnectorType<
  Record<string, unknown>,
  Record<string, unknown>,
  ExecutorParams,
  WorkflowsExecutorResultData
> {
  const args = getWorkflowsConnectorTypeArgs(workflowsManagementApi);
  return {
    id: ConnectorTypeId,
    minimumLicenseRequired: 'gold',
    name: i18n.NAME,
    validate: {
      params: {
        schema: ExecutorParamsSchema,
      },
      config: {
        schema: z.object({}).strict(),
      },
      secrets: {
        schema: z.object({}).strict(),
      },
    },
    executor: (execOptions) => executor(execOptions, args),
    supportedFeatureIds: [AlertingConnectorFeatureId, SecurityConnectorFeatureId],
    isSystemActionType: true,
    allowMultipleSystemActions: true,
  };
}

function getWorkflowsConnectorTypeArgs(
  workflowsManagementApi: WorkflowsManagementApi
): GetWorkflowsConnectorTypeArgs {
  // Create workflows service function for the connector
  const getWorkflowsService = async (request: KibanaRequest) => {
    // Return a function that will be called by the connector
    return async (workflowId: string, spaceId: string, inputs: Record<string, unknown>) => {
      // Get the workflow and validate it is in a runnable state
      const workflow = await workflowsManagementApi.getWorkflow(workflowId, spaceId);
      validateWorkflowForExecution(workflow, workflowId);

      const workflowToRun: WorkflowExecutionEngineModel = toWorkflowExecutionEngineModel(workflow);

      // Run the workflow, @tb: maybe switch to scheduler?
      return workflowsManagementApi.runWorkflow(workflowToRun, spaceId, inputs, request);
    };
  };

  // Create workflows scheduling service function for per-alert execution
  const getScheduleWorkflowService = async (request: KibanaRequest) => {
    return async (
      workflowId: string,
      spaceId: string,
      inputs: Record<string, unknown>,
      triggeredBy: TriggerType
    ) => {
      if (!workflowsManagementApi) {
        throw new Error('Workflows management API not initialized');
      }

      // Get the workflow and validate it is in a runnable state
      const workflow = await workflowsManagementApi.getWorkflow(workflowId, spaceId);
      validateWorkflowForExecution(workflow, workflowId);

      const workflowToSchedule: WorkflowExecutionEngineModel =
        toWorkflowExecutionEngineModel(workflow);

      return workflowsManagementApi.scheduleWorkflow(
        workflowToSchedule,
        spaceId,
        inputs,
        request,
        triggeredBy
      );
    };
  };

  return {
    getWorkflowsService,
    getScheduleWorkflowService,
  };
}

// action executor
export async function executor(
  execOptions: ConnectorTypeExecutorOptions<
    Record<string, unknown>,
    Record<string, unknown>,
    WorkflowsActionParamsType
  >,
  deps?: GetWorkflowsConnectorTypeArgs
): Promise<ConnectorTypeExecutorResult<WorkflowsExecutorResultData>> {
  const { actionId, configurationUtilities, params, logger, connectorUsageCollector, request } =
    execOptions;

  const { subAction, subActionParams } = params;

  let data: WorkflowsExecutorResultData | undefined;

  // Get the workflows service function if available
  let workflowsServiceFunction: WorkflowsServiceFunction | undefined;
  if (deps?.getWorkflowsService && request) {
    try {
      workflowsServiceFunction = await deps.getWorkflowsService(request as KibanaRequest);
    } catch (error) {
      logger.error(`Failed to get workflows service: ${error.message}`);
    }
  }

  let scheduleWorkflowServiceFunction: ScheduleWorkflowServiceFunction | undefined;
  if (deps?.getScheduleWorkflowService && request) {
    try {
      scheduleWorkflowServiceFunction = await deps.getScheduleWorkflowService(
        request as KibanaRequest
      );
    } catch (error) {
      logger.error(`Failed to get schedule workflows service: ${error.message}`);
    }
  }

  const externalService = createExternalService(
    actionId,
    logger,
    configurationUtilities,
    connectorUsageCollector,
    request as KibanaRequest,
    workflowsServiceFunction,
    scheduleWorkflowServiceFunction
  );

  if (!api[subAction]) {
    const errorMessage = `[WorkflowsConnector][Action][ExternalService] Unsupported subAction type ${subAction}.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  if (!supportedSubActions.includes(subAction)) {
    const errorMessage = `[WorkflowsConnector][Action][ExternalService] subAction ${subAction} not implemented.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  if (subAction === 'run') {
    const runParams = subActionParams as ExecutorSubActionRunParams;
    data = await api.run({
      externalService,
      params: runParams,
      logger,
    });

    logger.debug(`response run workflow for workflow id: ${data.workflowRunId}`);
  }

  return { status: 'ok', data, actionId };
}

const DEFAULT_ALERT_STATES: AlertStates = {
  new: true,
  ongoing: false,
  recovered: false,
};

export function resolveAlertStates(alertStates?: Partial<AlertStates>): AlertStates {
  return {
    new: alertStates?.new ?? DEFAULT_ALERT_STATES.new,
    ongoing: alertStates?.ongoing ?? DEFAULT_ALERT_STATES.ongoing,
    recovered: alertStates?.recovered ?? DEFAULT_ALERT_STATES.recovered,
  };
}

// Connector adapter for system action
export function getWorkflowsConnectorAdapter(): ConnectorAdapter<
  WorkflowsRuleActionParams,
  ExecutorParams
> {
  return {
    connectorTypeId: ConnectorTypeId,
    ruleActionParamsSchema: WorkflowsRuleActionParamsSchema,
    buildActionParams: ({ alerts, rule, params, ruleUrl, spaceId }) => {
      try {
        const subActionParams = params?.subActionParams;
        if (!subActionParams) {
          throw new Error(`Missing subActionParams. Received: ${JSON.stringify(params)}`);
        }

        const { workflowId, summaryMode = true } = subActionParams;
        if (!workflowId) {
          throw new Error(
            `Missing required workflowId parameter. Received params: ${JSON.stringify(params)}`
          );
        }

        const resolvedStates = resolveAlertStates(subActionParams.alertStates);

        const emptyAlertGroup = {
          count: 0,
          data: [],
          alert_count: { active: 0, recovered: 0, ignored: 0 },
        };

        const filteredAlerts = {
          ...alerts,
          new: resolvedStates.new ? alerts.new : emptyAlertGroup,
          ongoing: resolvedStates.ongoing ? alerts.ongoing : emptyAlertGroup,
          recovered: resolvedStates.recovered ? alerts.recovered : emptyAlertGroup,
        };

        const alertEvent = buildAlertEvent({
          alerts: filteredAlerts,
          rule,
          ruleUrl,
          spaceId,
        });

        return {
          subAction: 'run' as const,
          subActionParams: {
            workflowId,
            inputs: { event: alertEvent },
            spaceId,
            summaryMode,
            alertStates: resolvedStates,
          },
        };
      } catch (error) {
        return {
          subAction: 'run' as const,
          subActionParams: {
            workflowId: params?.subActionParams?.workflowId || 'unknown',
            spaceId,
            summaryMode: params?.subActionParams?.summaryMode ?? true,
            alertStates: resolveAlertStates(params?.subActionParams?.alertStates),
          },
        };
      }
    },
  };
}
