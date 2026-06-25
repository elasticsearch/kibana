/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
// TODO: remove eslint exceptions once we have a better way to handle this
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { estypes } from '@elastic/elasticsearch';
import type {
  SmlIndexAction,
  SmlIndexAttachmentParams,
} from '@kbn/agent-context-layer-plugin/server';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import {
  ExecutionStatus,
  getWorkflowJsonSchema,
  pickManagedWorkflowFields,
  transformWorkflowYamlJsontoEsWorkflow,
} from '@kbn/workflows';
import type {
  BulkScheduleWorkflowResult,
  CreateWorkflowCommand,
  EsWorkflow,
  EsWorkflowStepExecution,
  GetAvailableConnectorsResponse,
  ResumeWorkflowExecutionResponseDto,
  UpdatedWorkflowResponseDto,
  ValidateWorkflowResponseDto,
  WorkflowDetailDto,
  WorkflowExecutionDto,
  WorkflowExecutionEngineModel,
  WorkflowExecutionEventDispatchMetadata,
  WorkflowExecutionListDto,
  WorkflowListDto,
  WorkflowYaml,
} from '@kbn/workflows';
import { WORKFLOW_SML_TYPE } from '@kbn/workflows/common/constants';
import { WorkflowNotFoundError } from '@kbn/workflows/common/errors';
import type {
  ChildWorkflowExecutionItem,
  WorkflowPartialDetailDto,
  WorkflowSortField,
} from '@kbn/workflows/types/v1';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server';
import type { LogSearchResult } from '@kbn/workflows-execution-engine/server/repositories/logs_repository';
import type {
  ExecutionLogsParams,
  StepLogsParams,
} from '@kbn/workflows-execution-engine/server/workflow_event_logger/types';
import type { ServerTriggerDefinition } from '@kbn/workflows-extensions/server';
import {
  parseWorkflowYamlToJSON,
  stringifyWorkflowDefinition,
  WorkflowValidationError,
} from '@kbn/workflows-yaml';
import type { z } from '@kbn/zod/v4';
import type { StepExecutionListResult } from './lib/search_step_executions';
import { ManagedWorkflowDeleteForbiddenError } from './managed_workflow_delete_error';
import { ManagedWorkflowUpdateForbiddenError } from './managed_workflow_errors';
import type {
  SearchExecutionsViewParams,
  SearchWorkflowExecutionsParams,
  WorkflowsService,
} from './workflows_management_service';
import { connectorParamsSchemaResolver } from '../../common/lib/connector_params_schema_resolver';
import type { WorkflowChangesHistoryResponse } from '../../common/lib/workflow_change_history/types';

export type SmlIndexAttachmentFn = (params: SmlIndexAttachmentParams) => Promise<void>;

const isEnablementOnlyUpdate = (workflow: Partial<EsWorkflow>): boolean => {
  const fields = Object.keys(workflow);
  return fields.length === 1 && fields[0] === 'enabled';
};

export interface GetWorkflowsParams {
  triggerType?: 'schedule' | 'event' | 'manual';
  size: number;
  page: number;
  createdBy?: string[];
  enabled?: boolean[];
  tags?: string[];
  query?: string;
  managedFilter?: 'all' | 'managed' | 'unmanaged';
  _full?: boolean;
  sortField?: WorkflowSortField;
  sortOrder?: 'asc' | 'desc';
}

export interface GetWorkflowAggsOptions {
  managedFilter?: GetWorkflowsParams['managedFilter'];
}

export interface DeleteWorkflowsResponse {
  total: number;
  deleted: number;
  failures: Array<{
    id: string;
    error: string;
  }>;
  /**
   * Workflow ids successfully soft-deleted in Elasticsearch. Used server-side for audit logging;
   * bulk delete route omits this field from the HTTP JSON body so the public API shape is unchanged.
   */
  successfulIds?: string[];
}

export interface GetWorkflowExecutionLogsParams {
  executionId: string;
  stepExecutionId?: string;
  size?: number;
  page?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface WorkflowExecutionLogEntry {
  id: string;
  timestamp: string;
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  message: string;
  stepId?: string;
  stepName?: string;
  connectorType?: string;
  duration?: number;
  additionalData?: Record<string, any>;
}

export interface WorkflowExecutionLogsDto {
  logs: WorkflowExecutionLogEntry[];
  total: number;
  size: number;
  page: number;
}

export interface GetStepExecutionParams {
  executionId: string;
  id: string;
}

export interface SearchStepExecutionsParams {
  workflowId: string;
  stepId?: string;
  includeInput?: boolean;
  includeOutput?: boolean;
  page?: number;
  size?: number;
  /** Datemath lower bound for filtering by startedAt. */
  startedAfter?: string;
  /** Datemath upper bound for filtering by startedAt. */
  startedBefore?: string;
}

export interface GetAvailableConnectorsParams {
  spaceId: string;
  request: KibanaRequest;
}

export interface TestWorkflowParams {
  workflowId?: string;
  workflowYaml?: string;
  inputs: Record<string, any>;
  spaceId: string;
  request: KibanaRequest;
}

export interface BulkScheduleWorkflowItem {
  workflow: WorkflowExecutionEngineModel;
  spaceId: string;
  inputs: Record<string, unknown>;
  triggeredBy: string;
  metadata?: WorkflowExecutionEventDispatchMetadata;
}

const DEFAULT_EXECUTE_WORKFLOW_COMPLETION_TIMEOUT_SEC = 120;
const INITIAL_EXECUTE_WORKFLOW_WAIT_MS = 1_000;
const EXECUTE_WORKFLOW_CHECK_INTERVAL_MS = 2_500;

const executeWorkflowFinalStatuses = [
  ExecutionStatus.COMPLETED,
  ExecutionStatus.FAILED,
  ExecutionStatus.WAITING_FOR_INPUT,
];

export interface ExecuteWorkflowBaseParams {
  request: KibanaRequest;
  spaceId: string;
  inputs?: Record<string, unknown>;
  waitForCompletion?: boolean;
  completionTimeoutSec?: number;
  triggeredBy?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecuteSavedWorkflowParams extends ExecuteWorkflowBaseParams {
  /** Saved workflow ID. The workflow is fetched, validated, and checked for enabled state. */
  workflowId: string;
  yaml?: never;
  name?: never;
  isTestRun?: never;
}

export interface ExecuteInlineWorkflowParams extends ExecuteWorkflowBaseParams {
  /**
   * Optional synthetic workflow ID used on the execution document, telemetry, and result
   * correlation. It does not trigger a saved-workflow lookup; inline executions are
   * always marked ephemeral by the management API.
   */
  workflowId?: string;
  /** Workflow YAML to validate, parse, execute, and persist on the execution document. */
  yaml: string;
  name?: string;
  /** Authoring/test-run semantics are independent from whether the workflow is ephemeral. */
  isTestRun?: boolean;
}

export type ExecuteWorkflowParams = ExecuteSavedWorkflowParams | ExecuteInlineWorkflowParams;

export interface ExecuteWorkflowResult {
  workflowExecutionId: string;
  execution?: WorkflowExecutionDto;
  timedOut?: boolean;
}

const isExecuteInlineWorkflowParams = (
  params: ExecuteWorkflowParams
): params is ExecuteInlineWorkflowParams => params.yaml !== undefined;

export class WorkflowsManagementApi {
  private smlIndexAttachment: SmlIndexAttachmentFn | null = null;
  private smlLogger: Logger | null = null;

  constructor(
    private readonly workflowsService: WorkflowsService,
    public readonly isWorkflowsAvailable: boolean
  ) {}

  private async getWorkflowsExecutionEngine(): Promise<WorkflowsExecutionEnginePluginStart> {
    return this.workflowsService.getWorkflowsExecutionEngine();
  }

  public setSmlIndexAttachment(fn: SmlIndexAttachmentFn, logger: Logger): void {
    this.smlIndexAttachment = fn;
    this.smlLogger = logger;
  }

  private notifySml(originId: string, action: SmlIndexAction, request: KibanaRequest): void {
    if (!this.smlIndexAttachment) {
      return;
    }
    this.smlIndexAttachment({
      request,
      originId,
      attachmentType: WORKFLOW_SML_TYPE,
      action,
    }).catch((error) => {
      this.smlLogger?.warn(
        `Failed to ${action} SML index for workflow '${originId}': ${(error as Error).message}`
      );
    });
  }

  public async getWorkflows(
    params: GetWorkflowsParams,
    spaceId: string,
    options?: { includeExecutionHistory?: boolean; includeManagedExecutionHistory?: boolean }
  ): Promise<WorkflowListDto> {
    return this.workflowsService.getWorkflows(params, spaceId, options);
  }

  /**
   * Returns all enabled workflows in the space that are subscribed to the given trigger type.
   * Used by the event-driven handler to resolve which workflows to run when an event is emitted.
   */
  public async getWorkflowsSubscribedToTrigger(
    triggerId: string,
    spaceId: string
  ): Promise<WorkflowDetailDto[]> {
    return this.workflowsService.getWorkflowsSubscribedToTrigger(triggerId, spaceId);
  }

  public async getWorkflow(id: string, spaceId: string): Promise<WorkflowDetailDto | null> {
    return this.workflowsService.getWorkflow(id, spaceId);
  }

  public async getHistoryForWorkflow(
    id: string,
    spaceId: string,
    options?: { page?: number; perPage?: number }
  ): Promise<WorkflowChangesHistoryResponse> {
    return this.workflowsService.getHistoryForWorkflow(id, spaceId, options);
  }

  public async getWorkflowsByIds(ids: string[], spaceId: string): Promise<WorkflowDetailDto[]> {
    return this.workflowsService.getWorkflowsByIds(ids, spaceId);
  }

  public async getWorkflowsSourceByIds(
    ids: string[],
    spaceId: string,
    source?: string[]
  ): Promise<WorkflowPartialDetailDto[]> {
    return this.workflowsService.getWorkflowsSourceByIds(ids, spaceId, source);
  }

  public async createWorkflow(
    workflow: CreateWorkflowCommand,
    spaceId: string,
    request: KibanaRequest
  ): Promise<WorkflowDetailDto> {
    const result = await this.workflowsService.createWorkflow(workflow, spaceId, request);
    this.notifySml(result.id, 'create', request);
    return result;
  }

  public async bulkCreateWorkflows(
    workflows: CreateWorkflowCommand[],
    spaceId: string,
    request: KibanaRequest,
    options?: { overwrite?: boolean }
  ): Promise<{
    created: WorkflowDetailDto[];
    failed: Array<{ index: number; id: string; error: string }>;
  }> {
    const result = await this.workflowsService.bulkCreateWorkflows(
      workflows,
      spaceId,
      request,
      options
    );
    for (const created of result.created) {
      this.notifySml(created.id, options?.overwrite ? 'update' : 'create', request);
    }
    return result;
  }

  public async cloneWorkflow(
    workflow: WorkflowDetailDto,
    spaceId: string,
    request: KibanaRequest
  ): Promise<WorkflowDetailDto> {
    // Parse and update the YAML to change the name
    const zodSchema = await this.workflowsService.getWorkflowZodSchema(
      { loose: false },
      spaceId,
      request
    );
    const parsedYaml = parseWorkflowYamlToJSON(workflow.yaml, zodSchema, {
      connectorParamsSchemaResolver,
    });
    if (parsedYaml.error) {
      throw parsedYaml.error;
    }

    const updatedYaml = {
      ...parsedYaml.data,
      name: `${workflow.name} ${i18n.translate('workflowsManagement.cloneSuffix', {
        defaultMessage: 'Copy',
      })}`,
    };

    // Convert back to YAML string using proper YAML stringification
    const clonedYaml = stringifyWorkflowDefinition(updatedYaml as unknown as WorkflowYaml);
    const result = await this.workflowsService.createWorkflow(
      { yaml: clonedYaml },
      spaceId,
      request
    );
    this.notifySml(result.id, 'create', request);
    return result;
  }

  public async updateWorkflow(
    id: string,
    workflow: Partial<EsWorkflow>,
    spaceId: string,
    request: KibanaRequest,
    options?: { allowManagedWorkflowMutation?: boolean }
  ): Promise<UpdatedWorkflowResponseDto> {
    const originalWorkflow = await this.workflowsService.getWorkflow(id, spaceId);
    if (!originalWorkflow) {
      throw new WorkflowNotFoundError(id);
    }

    if (
      originalWorkflow.managed === true &&
      !isEnablementOnlyUpdate(workflow) &&
      options?.allowManagedWorkflowMutation !== true
    ) {
      throw new ManagedWorkflowUpdateForbiddenError();
    }
    const result = await this.workflowsService.updateWorkflow(id, workflow, spaceId, request);
    this.notifySml(id, 'update', request);
    return result;
  }

  public async deleteWorkflows(
    workflowIds: string[],
    spaceId: string,
    request: KibanaRequest,
    options?: { force?: boolean }
  ): Promise<DeleteWorkflowsResponse> {
    const workflows = await this.workflowsService.getWorkflowsByIds(workflowIds, spaceId);
    if (workflows.some(({ managed }) => managed === true)) {
      throw new ManagedWorkflowDeleteForbiddenError();
    }

    const result = await this.workflowsService.deleteWorkflows(workflowIds, spaceId, options);
    if (result.successfulIds) {
      for (const id of result.successfulIds) {
        this.notifySml(id, 'delete', request);
      }
    }
    return result;
  }

  public async disableAllWorkflows(spaceId?: string): Promise<{
    total: number;
    disabled: number;
    failures: Array<{ id: string; error: string }>;
  }> {
    return this.workflowsService.disableAllWorkflows(spaceId);
  }

  public async runWorkflow(
    workflow: WorkflowExecutionEngineModel,
    spaceId: string,
    inputs: Record<string, any>,
    request: KibanaRequest,
    triggeredBy?: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const { event, ...manualInputs } = inputs;
    const context: Record<string, unknown> = {
      event,
      spaceId,
      inputs: manualInputs,
      triggeredBy,
    };
    if (metadata) {
      context.metadata = metadata;
    }
    const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
    const executeResponse = await workflowsExecutionEngine.executeWorkflow(
      workflow,
      context,
      request
    );
    return executeResponse.workflowExecutionId;
  }

  public async executeWorkflow(params: ExecuteWorkflowParams): Promise<ExecuteWorkflowResult> {
    const {
      spaceId,
      request,
      inputs = {},
      waitForCompletion = true,
      completionTimeoutSec = DEFAULT_EXECUTE_WORKFLOW_COMPLETION_TIMEOUT_SEC,
      triggeredBy,
      metadata,
    } = params;

    const workflow = isExecuteInlineWorkflowParams(params)
      ? await this.createEphemeralWorkflowExecutionModel(params)
      : await this.getSavedWorkflowExecutionModel(params.workflowId, spaceId);

    const workflowExecutionId = await this.runWorkflow(
      workflow,
      spaceId,
      inputs,
      request,
      triggeredBy,
      metadata
    );

    const { execution, timedOut } = await this.waitForWorkflowExecution({
      workflowExecutionId,
      spaceId,
      waitForCompletion,
      completionTimeoutSec,
    });

    return {
      workflowExecutionId,
      ...(execution ? { execution } : {}),
      ...(timedOut ? { timedOut } : {}),
    };
  }

  private async createEphemeralWorkflowExecutionModel(
    params: ExecuteInlineWorkflowParams
  ): Promise<WorkflowExecutionEngineModel> {
    const validation = await this.workflowsService.validateWorkflow(
      params.yaml,
      params.spaceId,
      params.request
    );
    if (!validation.valid || !validation.parsedWorkflow) {
      const errorMessages = validation.diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => d.message);
      throw new WorkflowValidationError('Workflow validation failed', errorMessages);
    }

    const workflowJson = transformWorkflowYamlJsontoEsWorkflow(validation.parsedWorkflow);

    return {
      id: params.workflowId ?? 'ephemeral-workflow',
      name: params.name ?? workflowJson.name,
      enabled: workflowJson.enabled,
      definition: workflowJson.definition,
      yaml: params.yaml,
      isTestRun: params.isTestRun,
      isEphemeral: true,
    };
  }

  private async getSavedWorkflowExecutionModel(
    workflowId: string,
    spaceId: string
  ): Promise<WorkflowExecutionEngineModel> {
    const workflow = await this.getWorkflow(workflowId, spaceId);

    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }
    if (!workflow.enabled) {
      throw new Error(`Workflow '${workflowId}' is disabled and cannot be executed.`);
    }
    if (!workflow.valid) {
      throw new Error(`Workflow '${workflowId}' has validation errors and cannot be executed.`);
    }
    if (!workflow.definition) {
      throw new Error(`Workflow '${workflowId}' has no definition and cannot be executed.`);
    }

    return {
      id: workflow.id,
      name: workflow.name,
      enabled: workflow.enabled,
      definition: workflow.definition,
      yaml: workflow.yaml,
    };
  }

  private async waitForWorkflowExecution({
    workflowExecutionId,
    spaceId,
    waitForCompletion,
    completionTimeoutSec,
  }: {
    workflowExecutionId: string;
    spaceId: string;
    waitForCompletion: boolean;
    completionTimeoutSec: number;
  }): Promise<{ execution?: WorkflowExecutionDto; timedOut?: boolean }> {
    const waitLimit = Date.now() + completionTimeoutSec * 1000;
    await waitMs(INITIAL_EXECUTE_WORKFLOW_WAIT_MS);

    let execution: WorkflowExecutionDto | null | undefined;
    do {
      try {
        execution = await this.getWorkflowExecution(workflowExecutionId, spaceId, {
          includeOutput: true,
        });

        const shouldReturn = waitForCompletion
          ? execution && executeWorkflowFinalStatuses.includes(execution.status)
          : execution;

        if (shouldReturn && execution) {
          return { execution };
        }
      } catch (e) {
        // Keep polling until timeout; execution documents can lag immediately after scheduling.
      }

      await waitMs(EXECUTE_WORKFLOW_CHECK_INTERVAL_MS);
    } while (Date.now() < waitLimit);

    return {
      ...(execution ? { execution } : {}),
      timedOut: true,
    };
  }

  public async scheduleWorkflow(
    workflow: WorkflowExecutionEngineModel,
    spaceId: string,
    inputs: Record<string, any>,
    request: KibanaRequest,
    triggeredBy: string,
    metadata?: WorkflowExecutionEventDispatchMetadata
  ): Promise<string> {
    const { event, ...manualInputs } = inputs;
    const context: Record<string, unknown> = {
      event,
      spaceId,
      inputs: manualInputs,
      triggeredBy,
    };
    if (metadata) {
      context.metadata = metadata;
    }
    const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
    const scheduleResponse = await workflowsExecutionEngine.scheduleWorkflow(
      workflow,
      context,
      request
    );
    return scheduleResponse.workflowExecutionId;
  }

  public async bulkScheduleWorkflow(
    items: BulkScheduleWorkflowItem[],
    request: KibanaRequest
  ): Promise<BulkScheduleWorkflowResult> {
    const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();

    const engineItems = items.map((item) => {
      const { event, ...manualInputs } = item.inputs;
      const context: Record<string, unknown> = {
        event,
        spaceId: item.spaceId,
        inputs: manualInputs,
        triggeredBy: item.triggeredBy,
      };
      if (item.metadata) {
        context.metadata = item.metadata;
      }
      return { workflow: item.workflow, context };
    });

    return workflowsExecutionEngine.bulkScheduleWorkflow(engineItems, request);
  }

  public async testWorkflow({
    workflowId,
    workflowYaml,
    inputs,
    spaceId,
    request,
  }: TestWorkflowParams): Promise<string> {
    let resolvedYaml = workflowYaml;
    let resolvedWorkflowId = workflowId;
    let existingWorkflow: WorkflowDetailDto | null = null;

    if (workflowId && !workflowYaml) {
      existingWorkflow = await this.workflowsService.getWorkflow(workflowId, spaceId);
      if (!existingWorkflow) {
        throw new WorkflowNotFoundError(workflowId);
      }
      resolvedYaml = existingWorkflow.yaml;
    } else if (workflowId) {
      existingWorkflow = await this.workflowsService.getWorkflow(workflowId, spaceId);
    }

    if (!resolvedWorkflowId) {
      resolvedWorkflowId = 'test-workflow';
    }

    if (!resolvedYaml) {
      throw new Error('Either workflowId or workflowYaml must be provided');
    }

    const validation = await this.workflowsService.validateWorkflow(resolvedYaml, spaceId, request);
    if (!validation.valid || !validation.parsedWorkflow) {
      const errorMessages = validation.diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => d.message);
      throw new WorkflowValidationError('Workflow validation failed', errorMessages);
    }

    const workflowJson = transformWorkflowYamlJsontoEsWorkflow(validation.parsedWorkflow);
    const { event, ...manualInputs } = inputs;
    const context = {
      event,
      spaceId,
      inputs: manualInputs,
    };
    const managedVersion =
      existingWorkflow &&
      'managedVersion' in existingWorkflow &&
      typeof existingWorkflow.managedVersion === 'number'
        ? existingWorkflow.managedVersion
        : null;
    const managedWorkflowFields = pickManagedWorkflowFields(
      existingWorkflow
        ? {
            managed: existingWorkflow.managed,
            managedBy: existingWorkflow.managedBy,
            originManagedWorkflowId: existingWorkflow.originManagedWorkflowId,
            managedVersion,
          }
        : null
    );
    const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
    const executeResponse = await workflowsExecutionEngine.executeWorkflow(
      {
        id: resolvedWorkflowId,
        name: workflowJson.name,
        enabled: workflowJson.enabled,
        definition: workflowJson.definition,
        yaml: resolvedYaml,
        isTestRun: true,
        isEphemeral: true,
        ...managedWorkflowFields,
      },
      context,
      request
    );
    return executeResponse.workflowExecutionId;
  }

  public async testStep(
    workflowYaml: string,
    stepId: string,
    workflowId: string | undefined,
    executionContext: Record<string, unknown> | undefined,
    contextOverride: Record<string, any>,
    spaceId: string,
    request: KibanaRequest
  ): Promise<string> {
    const validation = await this.workflowsService.validateWorkflow(workflowYaml, spaceId, request);
    if (!validation.valid || !validation.parsedWorkflow) {
      const errorMessages = validation.diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => d.message);
      throw new WorkflowValidationError('Workflow validation failed', errorMessages);
    }

    const workflowToCreate = transformWorkflowYamlJsontoEsWorkflow(validation.parsedWorkflow);
    const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
    const executeResponse = await workflowsExecutionEngine.executeWorkflowStep(
      {
        id: workflowId ?? 'test-workflow',
        name: workflowToCreate.name,
        enabled: workflowToCreate.enabled,
        definition: workflowToCreate.definition,
        yaml: workflowYaml,
        isTestRun: true,
        isEphemeral: true,
        spaceId,
      },
      stepId,
      executionContext,
      contextOverride,
      request
    );
    return executeResponse.workflowExecutionId;
  }

  public async getWorkflowExecutions(
    params: SearchWorkflowExecutionsParams,
    spaceId: string
  ): Promise<WorkflowExecutionListDto> {
    return this.workflowsService.getWorkflowExecutions(params, spaceId);
  }

  public async searchExecutionsView(
    params: SearchExecutionsViewParams,
    spaceId: string
  ): Promise<estypes.SearchResponse<unknown>> {
    return this.workflowsService.searchExecutionsView(params, spaceId);
  }

  public async getWorkflowExecution(
    workflowExecutionId: string,
    spaceId: string,
    options?: { includeInput?: boolean; includeOutput?: boolean }
  ): Promise<WorkflowExecutionDto | null> {
    return this.workflowsService.getWorkflowExecution(workflowExecutionId, spaceId, options);
  }

  public async getChildWorkflowExecutions(
    parentExecutionId: string,
    spaceId: string
  ): Promise<ChildWorkflowExecutionItem[]> {
    return this.workflowsService.getChildWorkflowExecutions(parentExecutionId, spaceId);
  }

  public async getWorkflowExecutionLogs(params: {
    executionId: string;
    spaceId: string;
    size: number;
    page: number;
    stepExecutionId?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<WorkflowExecutionLogsDto> {
    let result: LogSearchResult;

    if (this.isStepExecution(params)) {
      result = await this.workflowsService.getStepLogs(params);
    } else {
      result = await this.workflowsService.getExecutionLogs(params);
    }

    // Transform the logs to match our API format
    return {
      logs: result.logs
        .filter((log) => log) // Filter out undefined/null logs
        .map((log) => ({
          id:
            // TODO: log.id not defined in the doc, do we store it somewhere?
            // @ts-expect-error - log.id is not defined in the type
            log.id ||
            `${log['@timestamp']}-${log.workflow?.execution_id}-${
              log.workflow?.step_id || 'workflow'
            }`,
          timestamp: log['@timestamp'],
          level: log.level,
          message: log.message,
          stepId: log.workflow?.step_id,
          stepName: log.workflow?.step_name,
          connectorType: log.workflow?.step_type,
          duration: log.event?.duration,
          additionalData: {
            workflowId: log.workflow?.id,
            workflowName: log.workflow?.name,
            executionId: log.workflow?.execution_id,
            event: log.event,
            tags: log.tags,
            error: log.error,
          },
        })),
      total: result.total,
      size: params.size,
      page: params.page,
    };
  }

  public async getStepExecution(
    params: GetStepExecutionParams,
    spaceId: string
  ): Promise<EsWorkflowStepExecution | null> {
    return this.workflowsService.getStepExecution(params, spaceId);
  }

  public async searchStepExecutions(
    params: SearchStepExecutionsParams,
    spaceId: string
  ): Promise<StepExecutionListResult> {
    return this.workflowsService.searchStepExecutions(params, spaceId);
  }

  public async cancelWorkflowExecution(
    workflowExecutionId: string,
    spaceId: string,
    request?: KibanaRequest
  ): Promise<void> {
    const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
    return workflowsExecutionEngine.cancelWorkflowExecution(workflowExecutionId, spaceId, request);
  }

  public async cancelAllActiveWorkflowExecutions(
    workflowId: string,
    spaceId: string
  ): Promise<void> {
    const workflow = await this.getWorkflow(workflowId, spaceId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }
    const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
    return workflowsExecutionEngine.cancelAllActiveWorkflowExecutions({ spaceId, workflowId });
  }

  public async resumeWorkflowExecution(
    executionId: string,
    spaceId: string,
    input: Record<string, unknown>,
    request: KibanaRequest
  ): Promise<ResumeWorkflowExecutionResponseDto> {
    const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
    return workflowsExecutionEngine.resumeWorkflowExecution(executionId, spaceId, input, request);
  }

  /**
   * Cross-workflow listing of step executions currently blocked on
   * `waitForInput`. Consumed by the Inbox plugin's workflows provider.
   */
  public async listWaitingForInputSteps(
    spaceId: string,
    params: { page?: number; perPage?: number } = {}
  ): Promise<{ results: EsWorkflowStepExecution[]; total: number }> {
    return this.workflowsService.listWaitingForInputSteps(spaceId, params);
  }

  public async getWorkflowStats(
    spaceId: string,
    options?: { includeExecutionStats?: boolean; includeManagedExecutionStats?: boolean }
  ) {
    return this.workflowsService.getWorkflowStats(spaceId, options);
  }

  public async getWorkflowAggs(
    fields: string[] = [],
    spaceId: string,
    options?: GetWorkflowAggsOptions
  ) {
    return options
      ? this.workflowsService.getWorkflowAggs(fields, spaceId, options)
      : this.workflowsService.getWorkflowAggs(fields, spaceId);
  }

  public async getAvailableConnectors(
    spaceId: string,
    request: KibanaRequest
  ): Promise<GetAvailableConnectorsResponse> {
    return this.workflowsService.getAvailableConnectors(spaceId, request);
  }

  public async getRegisteredTriggers(): Promise<ServerTriggerDefinition[]> {
    return this.workflowsService.getRegisteredCustomTriggerDefinitions();
  }

  public async getWorkflowJsonSchema(
    { loose }: { loose: boolean },
    spaceId: string,
    request: KibanaRequest
  ): Promise<z.core.JSONSchema.JSONSchema | null> {
    const zodSchema = await this.workflowsService.getWorkflowZodSchema(
      { loose: false },
      spaceId,
      request
    );
    return getWorkflowJsonSchema(zodSchema);
  }

  public async validateWorkflow(
    yaml: string,
    spaceId: string,
    request: KibanaRequest
  ): Promise<ValidateWorkflowResponseDto> {
    return this.workflowsService.validateWorkflow(yaml, spaceId, request);
  }

  private isStepExecution(params: StepLogsParams | ExecutionLogsParams): params is StepLogsParams {
    return 'stepExecutionId' in params && params.stepExecutionId != null;
  }
}

const waitMs = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs));
