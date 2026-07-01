/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import type { CloudSetup, CloudStart } from '@kbn/cloud-plugin/server';
import type { KibanaRequest } from '@kbn/core/server';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { UsageApiSetup } from '@kbn/usage-api-plugin/server';
import type { BulkScheduleWorkflowResult, WorkflowExecutionEngineModel } from '@kbn/workflows';
import type {
  WorkflowsExtensionsServerPluginSetup,
  WorkflowsExtensionsServerPluginStart,
} from '@kbn/workflows-extensions/server';
import type {
  SearchTriggerEventLogParams,
  SearchTriggerEventLogResult,
} from './trigger_events/event_logs/trigger_event_log_query';
import type { EmitEvent } from './trigger_events/trigger_event_handler';
import type { IWorkflowEventLoggerService } from './workflow_event_logger';

export interface ExecuteWorkflowResponse {
  workflowExecutionId: string;
}

export interface ExecuteWorkflowStepResponse {
  workflowExecutionId: string;
}

/** Engine contract for `resumeWorkflowExecution` (same shape as `@kbn/workflows` `ResumeWorkflowExecutionResponseDto`). */
export interface ResumeWorkflowExecutionResponse {
  resumedBy: string;
}

export interface WorkflowsExecutionEnginePluginSetup {
  // No setup contract exposed yet. Extend this interface when other plugins need to configure the engine during setup.
  [key: string]: unknown;
}

export interface TriggerEventsContract {
  emitEvent: EmitEvent;
  isEnabled: boolean;
  isLogEventsEnabled: boolean;
  maxEventChainDepth: number;
  searchTriggerEventLog: (
    params: SearchTriggerEventLogParams
  ) => Promise<SearchTriggerEventLogResult>;
}

export interface WorkflowsExecutionEnginePluginStart {
  executeWorkflow: ExecuteWorkflow;
  executeWorkflowStep: ExecuteWorkflowStep;
  cancelWorkflowExecution: CancelWorkflowExecution;
  cancelAllActiveWorkflowExecutions: CancelAllActiveWorkflowExecutions;
  resumeWorkflowExecution: ResumeWorkflowExecution;
  workflowEventLoggerService: IWorkflowEventLoggerService;
  scheduleWorkflow: ScheduleWorkflow;
  bulkScheduleWorkflow: BulkScheduleWorkflow;
  triggerEvents: TriggerEventsContract;
}

export interface WorkflowsExecutionEnginePluginSetupDeps {
  taskManager: TaskManagerSetupContract;
  cloud: CloudSetup;
  usageApi?: UsageApiSetup;
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup;
}

export interface WorkflowsExecutionEnginePluginStartDeps {
  taskManager: TaskManagerStartContract;
  actions: ActionsPluginStartContract;
  cloud: CloudStart;
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
  licensing: LicensingPluginStart;
  spaces?: SpacesPluginStart;
}

export type ExecuteWorkflow = (
  workflow: WorkflowExecutionEngineModel,
  context: Record<string, unknown>,
  request: KibanaRequest
) => Promise<ExecuteWorkflowResponse>;

export type ExecuteWorkflowStep = (
  workflow: WorkflowExecutionEngineModel,
  stepId: string,
  executionContext: Record<string, unknown> | undefined,
  contextOverride: Record<string, unknown>,
  request: KibanaRequest
) => Promise<ExecuteWorkflowStepResponse>;

export type CancelWorkflowExecution = (
  workflowExecutionId: string,
  spaceId: string,
  schedulingRequest?: KibanaRequest
) => Promise<void>;

export type CancelAllActiveWorkflowExecutions = (params: {
  spaceId: string;
  workflowId: string;
}) => Promise<void>;

export type ResumeWorkflowExecution = (
  executionId: string,
  spaceId: string,
  input: Record<string, unknown>,
  request?: KibanaRequest,
  options?: {
    resumedBy?: string;
  }
) => Promise<ResumeWorkflowExecutionResponse>;

export type InternalResumeWorkflowExecution = (
  executionId: string,
  spaceId: string,
  context: Record<string, unknown> | undefined,
  request?: KibanaRequest
) => Promise<void>;

export type ScheduleWorkflow = (
  workflow: WorkflowExecutionEngineModel,
  context: Record<string, unknown>,
  request: KibanaRequest
) => Promise<ExecuteWorkflowResponse>;

export type BulkScheduleWorkflow = (
  items: Array<{ workflow: WorkflowExecutionEngineModel; context: Record<string, unknown> }>,
  request: KibanaRequest
) => Promise<BulkScheduleWorkflowResult>;
