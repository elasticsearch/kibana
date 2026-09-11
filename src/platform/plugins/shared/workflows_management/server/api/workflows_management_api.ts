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

import { WORKFLOW_KI_TYPE } from '@kbn/agent-builder-elastic-ai-index-ki-types';
import type {
  SmlIndexAction,
  SmlIndexAttachmentParams,
} from '@kbn/agent-builder-sml-plugin/server';
import type { AlertingApiRequestHandlerContext } from '@kbn/alerting-plugin/server';
import type { CustomRequestHandlerContext, KibanaRequest, Logger } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import {
  ExecutionStatus,
  getWorkflowJsonSchema,
  toWorkflowExecutionEngineModel,
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
import {
  WorkflowExecutionInvalidStatusError,
  WorkflowNotFoundError,
} from '@kbn/workflows/common/errors';
import type {
  ChildWorkflowExecutionItem,
  WorkflowPartialDetailDto,
  WorkflowSortField,
} from '@kbn/workflows/types/v1';
import type {
  ExecuteWorkflowResponse,
  WorkflowsExecutionEnginePluginStart,
} from '@kbn/workflows-execution-engine/server';
import { classifyWorkflowTriggerMatch } from '@kbn/workflows-execution-engine/server';
import type { LogSearchResult } from '@kbn/workflows-execution-engine/server/repositories/logs_repository';
import type {
  ExecutionLogsParams,
  StepLogsParams,
} from '@kbn/workflows-execution-engine/server/workflow_event_logger/types';
import type {
  ServerTriggerDefinition,
  WorkflowExecutionCapabilities,
} from '@kbn/workflows-extensions/server';
import {
  parseYamlToJSONWithoutValidation,
  WorkflowConflictError,
  WorkflowValidationError,
} from '@kbn/workflows-yaml';
import type { z } from '@kbn/zod/v4';
import {
  type ExternalResumeFormPageParams,
  type ExternalResumeViaGetParams,
  type ExternalResumeWorkflowExecutionWithInputParams,
  getExternalResumeFormPage,
  resumeWorkflowExecutionExternallyViaGet,
  resumeWorkflowExecutionExternallyWithInput,
} from './external_resume/external_resume_service';
import type { StepExecutionListResult } from './lib/search_step_executions';
import {
  getTriggerTypesFromDefinition,
  getTriggerTypesFromYaml,
  workflowYamlDeclaresEnabled,
} from './lib/workflow_prepare';
import { ManagedWorkflowDeleteForbiddenError } from './managed_workflow_delete_error';
import { ManagedWorkflowUpdateForbiddenError } from './managed_workflow_errors';
import { preprocessAlertInputs } from './routes/executions/utils/preprocess_alert_inputs';
import type { WorkflowManagementAuditLog } from './routes/utils/workflow_audit_logging';
import type {
  SearchExecutionsViewParams,
  SearchWorkflowExecutionsParams,
  WorkflowsService,
} from './workflows_management_service';
import { formatWorkflowDiagnostic } from '../../common/lib/format_workflow_diagnostic';
import type {
  RestoreWorkflowVersionResponseDto,
  WorkflowChangesHistoryResponse,
} from '../../common/lib/workflow_change_history/types';
import { updateWorkflowYamlFields } from '../../common/lib/yaml/update_workflow_yaml_fields';
import type { BulkCreateWorkflowsResult } from '../services/workflow_crud_service';
import type {
  ProcessedWaitForInputFacets,
  ProcessedWaitForInputFilters,
  WaitForInputListResult,
} from '../services/workflow_execution_query_service';

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
  visibilityContext?: string[];
  _full?: boolean;
  sortField?: WorkflowSortField;
  sortOrder?: 'asc' | 'desc';
}

export interface GetWorkflowAggsOptions {
  managedFilter?: GetWorkflowsParams['managedFilter'];
}

export interface ResolveWorkflowTriggerMatchesResult {
  matched: WorkflowDetailDto[];
  invalidConditionWorkflows: Array<{ id: string; name: string }>;
}

export interface ExecuteWorkflowSynchronouslyParams {
  workflowId: string;
  /**
   * Pre-fetched workflow DTO (e.g. from trigger resolution). When supplied, the ES re-fetch
   * inside `executeWorkflowSynchronously` is skipped — eliminates a redundant read on the
   * inference hot path. The DTO is still validated (enabled, valid, definition) before execution.
   */
  workflow?: WorkflowDetailDto;
  context: Record<string, unknown>;
  spaceId: string;
  request: KibanaRequest;
  capabilities?: WorkflowExecutionCapabilities;
  abortSignal?: AbortSignal;
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
  /**
   * When set, only step executions of this type, e.g. `ai.agent`. A step id can be shared by more
   * than one document — the engine's step-level timeout wrapper reuses it — so this narrows a
   * search to the one that carries the step's own result.
   */
  stepType?: string;
  /**
   * When set, restricts the search to step executions belonging to these workflow runs. An empty
   * array matches nothing. Keep it to a page of ids — it becomes a single ES `terms` clause.
   */
  workflowExecutionIds?: string[];
  includeInput?: boolean;
  includeOutput?: boolean;
  /**
   * When set, only these `_source` paths are returned, and `includeInput`/`includeOutput` are
   * ignored. For reading a few fields off runs whose `output` can be megabytes.
   */
  sourceIncludes?: string[];
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

export type AlertPreprocessingContext = Pick<
  CustomRequestHandlerContext<{ alerting: AlertingApiRequestHandlerContext }>,
  'core' | 'alerting'
>;

export interface RunWorkflowWithAlertPreprocessingParams {
  workflow: WorkflowExecutionEngineModel;
  spaceId: string;
  inputs: Record<string, unknown>;
  request: KibanaRequest;
  preprocessingContext: AlertPreprocessingContext;
  metadata?: Record<string, unknown>;
  /**
   * Fields to merge into `event` *after* alert preprocessing. Use this to inject
   * server-owned values (e.g. `caseIds`) that alert preprocessing would otherwise
   * overwrite, because `preprocessAlertInputs` replaces the whole `event` object with
   * the expanded alert-event shape.
   */
  eventOverrides?: Record<string, unknown>;
}

export interface RunWorkflowWithAlertPreprocessingResult {
  workflowExecutionId: string;
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
  private audit: WorkflowManagementAuditLog | null = null;

  constructor(
    private readonly workflowsService: WorkflowsService,
    public readonly isWorkflowsAvailable: boolean,
    private readonly logger: Logger
  ) {}

  public setAuditLog(audit: WorkflowManagementAuditLog): void {
    this.audit = audit;
  }

  private async getWorkflowsExecutionEngine(): Promise<WorkflowsExecutionEnginePluginStart> {
    return this.workflowsService.getWorkflowsExecutionEngine();
  }

  /**
   * Enforces trigger-declared exclusivity before a workflow becomes enabled.
   *
   * A trigger definition may declare `exclusivity: 'per-space'`, meaning at most
   * one *enabled* workflow per space may subscribe to it. The rule is entirely
   * registration-driven: this method never names a specific trigger, and a
   * trigger that does not declare exclusivity costs nothing (no search is issued).
   *
   * Best-effort: two concurrent enables can interleave between the search and the
   * write. There is no unique key in the workflow index to make this atomic; the
   * guard exists to return a clear 409 rather than silently nondeterministic dispatch.
   *
   * @param triggerTypes Trigger ids the workflow will subscribe to once written.
   * @param spaceId      Space the workflow is being written into.
   * @param excludeWorkflowId The workflow being updated, skipped as its own conflict.
   *   Omitted on create, where there is no self to skip yet.
   */
  private async assertExclusiveTriggersAvailable({
    triggerTypes,
    spaceId,
    excludeWorkflowId,
  }: {
    triggerTypes: string[];
    spaceId: string;
    excludeWorkflowId?: string;
  }): Promise<void> {
    if (triggerTypes.length === 0) {
      return;
    }

    const workflowsExtensions = await this.workflowsService.getWorkflowsExtensions();

    // Dedupe: a workflow may declare the same trigger twice (different conditions),
    // so one exclusive trigger costs at most one search. Sequential by design —
    // the common case is zero exclusive triggers and issues no search at all.
    for (const triggerId of new Set(triggerTypes)) {
      if (workflowsExtensions.getTriggerDefinition(triggerId)?.exclusivity === 'per-space') {
        // Already filtered to enabled: true and includes global (spaceId: '*') subscribers.
        const enabledSubscribers = await this.getWorkflowsSubscribedToTrigger(triggerId, spaceId);
        const conflict = enabledSubscribers.find((w) => w.id !== excludeWorkflowId);
        if (conflict) {
          throw new WorkflowConflictError(
            i18n.translate('workflowsManagement.exclusiveTriggerConflictError', {
              defaultMessage:
                'Cannot enable: workflow "{conflictingWorkflowName}" is already enabled for the {triggerId} trigger. Disable it first.',
              values: {
                conflictingWorkflowName: conflict.name ?? conflict.id,
                triggerId,
              },
            }),
            conflict.id
          );
        }
      }
    }
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
      attachmentType: WORKFLOW_KI_TYPE,
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

  public async resolveWorkflowTriggerMatches(
    triggerId: string,
    event: Record<string, unknown>,
    spaceId: string
  ): Promise<ResolveWorkflowTriggerMatchesResult> {
    const subscribed = await this.getWorkflowsSubscribedToTrigger(triggerId, spaceId);
    const matched: WorkflowDetailDto[] = [];
    const invalidConditionWorkflows: Array<{ id: string; name: string }> = [];

    subscribed.forEach((workflow) => {
      const outcome = classifyWorkflowTriggerMatch(workflow, triggerId, event);
      if (outcome === 'matched') {
        matched.push(workflow);
      } else if (outcome === 'kql_error') {
        invalidConditionWorkflows.push({
          id: workflow.id,
          name: workflow.name ?? workflow.definition?.name ?? workflow.id,
        });
      }
    });

    return { matched, invalidConditionWorkflows };
  }

  public async executeWorkflowSynchronously({
    workflowId,
    workflow: prefetchedWorkflow,
    context,
    spaceId,
    request,
    capabilities,
    abortSignal,
  }: ExecuteWorkflowSynchronouslyParams): Promise<ExecuteWorkflowResponse> {
    const model = prefetchedWorkflow
      ? this.validateAndBuildWorkflowModel(prefetchedWorkflow)
      : await this.getSavedWorkflowExecutionModel(workflowId, spaceId);
    const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
    return workflowsExecutionEngine.executeWorkflow(model, context, request, {
      executionMode: 'sync',
      capabilities,
      abortSignal,
    });
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

  public async findExistingWorkflowIds(ids: string[]): Promise<string[]> {
    return this.workflowsService.findExistingWorkflowIds(ids);
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
    request: KibanaRequest,
    options?: { originManagedWorkflowId?: string }
  ): Promise<WorkflowDetailDto> {
    // A workflow can be created already enabled when the YAML declares `enabled: true`,
    // so the exclusivity guard must run here, not only on the enable transition.
    if (workflowYamlDeclaresEnabled(workflow.yaml)) {
      await this.assertExclusiveTriggersAvailable({
        triggerTypes: getTriggerTypesFromYaml(workflow.yaml),
        spaceId,
      });
    }

    const result = await this.workflowsService.createWorkflow(workflow, spaceId, request, options);
    this.notifySml(result.id, 'create', request);
    return result;
  }

  public async bulkCreateWorkflows(
    workflows: CreateWorkflowCommand[],
    spaceId: string,
    request: KibanaRequest,
    options?: { overwrite?: boolean }
  ): Promise<BulkCreateWorkflowsResult> {
    const result = await this.workflowsService.bulkCreateWorkflows(
      workflows,
      spaceId,
      request,
      options
    );
    for (const created of result.created) {
      this.notifySml(created.id, 'create', request);
    }
    return result;
  }

  public async cloneWorkflow(
    workflow: WorkflowDetailDto,
    spaceId: string,
    request: KibanaRequest
  ): Promise<WorkflowDetailDto> {
    // Rewrite only the `name` field directly in the YAML text so that cloning
    // works even when the source workflow's YAML is schema-invalid. Strictly
    // parsing/validating here would reject invalid-but-editable workflows.
    const cloneName = `${workflow.name} ${i18n.translate('workflowsManagement.cloneSuffix', {
      defaultMessage: 'Copy',
    })}`;
    const clonedYaml = updateWorkflowYamlFields(workflow.yaml, { name: cloneName });

    // A clone inherits the source's `enabled` state from the YAML. If the source is
    // enabled for an exclusive trigger, a second enabled subscriber would form — block it.
    if (workflowYamlDeclaresEnabled(clonedYaml)) {
      await this.assertExclusiveTriggersAvailable({
        triggerTypes: getTriggerTypesFromYaml(clonedYaml),
        spaceId,
      });
    }

    // `updateWorkflowYamlFields` cannot inject a `name` key when the YAML root is not a
    // mapping (a scalar or sequence), so it returns the YAML unchanged in that case. Pass
    // `cloneName` as an explicit fallback so the clone is still named "<name> Copy" instead
    // of collapsing to "Untitled workflow".
    const result = await this.workflowsService.createWorkflow(
      { yaml: clonedYaml },
      spaceId,
      request,
      { nameFallback: cloneName }
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

    // Enforce trigger-declared exclusivity before any path that results in this
    // workflow becoming enabled. The condition covers three routes to enablement:
    //
    //   1. Field-only enable (`workflow.enabled === true`): trigger types unchanged,
    //      so use the existing definition.
    //   2. YAML update that declares top-level `enabled: true`: the YAML value wins
    //      over the `enabled` field (see workflow_crud_service.ts for the precedence
    //      rule), so check the NEW trigger types from the incoming YAML.
    //   3. YAML update that adds an exclusive trigger to an already-enabled workflow
    //      (`workflow.enabled` absent but new triggers in YAML): same as case 2.
    //
    // Known gap: restoreWorkflowVersion — the restored snapshot YAML is fetched
    // inside the crud service and is unavailable here. Track as a follow-up.
    if (workflow.yaml) {
      if (workflowYamlDeclaresEnabled(workflow.yaml) || workflow.enabled === true) {
        await this.assertExclusiveTriggersAvailable({
          triggerTypes: getTriggerTypesFromYaml(workflow.yaml),
          spaceId,
          excludeWorkflowId: id,
        });
      }
    } else if (workflow.enabled === true) {
      await this.assertExclusiveTriggersAvailable({
        triggerTypes: getTriggerTypesFromDefinition(originalWorkflow.definition),
        spaceId,
        excludeWorkflowId: id,
      });
    }

    const result = await this.workflowsService.updateWorkflow(id, workflow, spaceId, request);
    this.notifySml(id, 'update', request);
    return result;
  }

  public async restoreWorkflowVersion(
    id: string,
    eventId: string,
    spaceId: string,
    request: KibanaRequest
  ): Promise<RestoreWorkflowVersionResponseDto> {
    const originalWorkflow = await this.workflowsService.getWorkflow(id, spaceId);
    if (!originalWorkflow) {
      throw new WorkflowNotFoundError(id);
    }

    if (originalWorkflow.managed === true) {
      throw new ManagedWorkflowUpdateForbiddenError();
    }

    const result = await this.workflowsService.restoreWorkflowVersion(
      id,
      eventId,
      spaceId,
      request
    );
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

  public async disableAllWorkflows(
    spaceId?: string,
    request?: KibanaRequest
  ): Promise<{
    total: number;
    disabled: number;
    failures: Array<{ id: string; error: string }>;
  }> {
    return this.workflowsService.disableAllWorkflows(spaceId, request);
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

  /**
   * Preprocesses alert inputs and starts a workflow without waiting for its execution document.
   *
   * When `eventOverrides` is supplied, its keys are merged into `event` *after* preprocessing.
   * This is needed because `preprocessAlertInputs` replaces the whole `event` object with the
   * expanded alert-event shape, so any caller-owned event fields must be re-applied afterwards.
   */
  public async runWorkflowWithAlertPreprocessing({
    workflow,
    spaceId,
    inputs,
    request,
    preprocessingContext,
    metadata,
    eventOverrides,
  }: RunWorkflowWithAlertPreprocessingParams): Promise<RunWorkflowWithAlertPreprocessingResult> {
    const processedInputs = await preprocessAlertInputs(
      inputs,
      preprocessingContext,
      spaceId,
      this.logger
    );

    const finalInputs =
      eventOverrides != null
        ? {
            ...processedInputs,
            event: {
              ...(typeof processedInputs.event === 'object' &&
              processedInputs.event !== null &&
              !Array.isArray(processedInputs.event)
                ? (processedInputs.event as Record<string, unknown>)
                : {}),
              ...eventOverrides,
            },
          }
        : processedInputs;

    const workflowExecutionId = await this.runWorkflow(
      workflow,
      spaceId,
      finalInputs,
      request,
      undefined,
      metadata
    );

    return { workflowExecutionId };
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
      throw buildWorkflowValidationError(validation, params.yaml);
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

  /**
   * Validates an already-fetched workflow DTO and converts it to an execution model.
   * Used by `executeWorkflowSynchronously` when the caller passes a pre-fetched workflow,
   * and by `getSavedWorkflowExecutionModel` after the ES fetch.
   */
  private validateAndBuildWorkflowModel(workflow: WorkflowDetailDto): WorkflowExecutionEngineModel {
    if (!workflow.enabled) {
      throw new Error(`Workflow '${workflow.id}' is disabled and cannot be executed.`);
    }
    if (!workflow.valid) {
      throw new Error(`Workflow '${workflow.id}' has validation errors and cannot be executed.`);
    }
    if (!workflow.definition) {
      throw new Error(`Workflow '${workflow.id}' has no definition and cannot be executed.`);
    }
    return toWorkflowExecutionEngineModel(workflow);
  }

  private async getSavedWorkflowExecutionModel(
    workflowId: string,
    spaceId: string
  ): Promise<WorkflowExecutionEngineModel> {
    const workflow = await this.getWorkflow(workflowId, spaceId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }
    return this.validateAndBuildWorkflowModel(workflow);
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
      throw buildWorkflowValidationError(validation, resolvedYaml);
    }

    const workflowJson = transformWorkflowYamlJsontoEsWorkflow(validation.parsedWorkflow);
    const { event, ...manualInputs } = inputs;
    const context = {
      event,
      spaceId,
      inputs: manualInputs,
    };
    const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
    const executeResponse = await workflowsExecutionEngine.executeWorkflow(
      toWorkflowExecutionEngineModel(
        {
          id: resolvedWorkflowId,
          name: workflowJson.name,
          enabled: workflowJson.enabled,
          definition: workflowJson.definition,
          yaml: resolvedYaml,
          version: existingWorkflow?.version,
          managed: existingWorkflow?.managed,
          managedBy: existingWorkflow?.managedBy,
          originManagedWorkflowId: existingWorkflow?.originManagedWorkflowId,
          managedVersion: existingWorkflow?.managedVersion,
        },
        { isTestRun: true, isEphemeral: true }
      ),
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
      throw buildWorkflowValidationError(validation, workflowYaml);
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
  ): Promise<WorkflowExecutionListDto> {
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
    request: KibanaRequest,
    options?: { channel?: string }
  ): Promise<void> {
    const channel = options?.channel;
    try {
      const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
      await workflowsExecutionEngine.cancelWorkflowExecution(workflowExecutionId, spaceId, request);
      this.audit?.logExecutionCanceled(request, { executionId: workflowExecutionId, channel });
    } catch (error) {
      this.audit?.logExecutionCanceled(request, {
        executionId: workflowExecutionId,
        channel,
        error,
      });
      throw error;
    }
  }

  public async cancelAllActiveWorkflowExecutions(
    workflowId: string,
    spaceId: string,
    request: KibanaRequest,
    options?: { channel?: string }
  ): Promise<void> {
    const channel = options?.channel;
    const workflow = await this.getWorkflow(workflowId, spaceId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }
    try {
      const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
      await workflowsExecutionEngine.cancelAllActiveWorkflowExecutions({
        spaceId,
        workflowId,
        schedulingRequest: request,
        onCancelled: (executionId) => {
          this.audit?.logExecutionCanceled(request, { executionId, channel });
        },
      });
    } catch (error) {
      this.audit?.logExecutionCanceled(request, {
        workflowId,
        channel,
        error,
      });
      throw error;
    }
  }

  /**
   * Claims the waiting HITL step before scheduling the resume so every resume
   * channel shares the same audit stamp and first-writer-wins guard.
   */
  public async resumeWorkflowExecution(
    executionId: string,
    spaceId: string,
    input: Record<string, unknown>,
    request: KibanaRequest,
    options?: { channel?: string; stepExecutionId?: string }
  ): Promise<ResumeWorkflowExecutionResponseDto> {
    const channel = options?.channel;
    try {
      const stepExecutionId =
        options?.stepExecutionId ??
        (await this.workflowsService.getWaitingStepExecutionId(executionId, spaceId));

      if (!stepExecutionId) {
        throw new WorkflowExecutionInvalidStatusError(
          executionId,
          'waiting step not found',
          'waiting_for_input'
        );
      }

      const claimed = await this.workflowsService.markStepAsResponded(
        stepExecutionId,
        request,
        channel,
        spaceId
      );
      if (!claimed) {
        throw new WorkflowExecutionInvalidStatusError(
          executionId,
          'already responded to or no longer waiting for input',
          'waiting_for_input'
        );
      }

      const workflowsExecutionEngine = await this.getWorkflowsExecutionEngine();
      const result = await workflowsExecutionEngine.resumeWorkflowExecution(
        executionId,
        spaceId,
        input,
        request
      );
      this.audit?.logExecutionResumed(request, {
        executionId,
        resumedBy: result.resumedBy,
        channel,
      });
      return result;
    } catch (error) {
      this.audit?.logExecutionResumed(request, { executionId, channel, error });
      throw error;
    }
  }

  /** Cross-workflow listing of active `waitForInput` step executions. */
  public async listWaitingForInputSteps(
    spaceId: string,
    params: { page?: number; perPage?: number; includeReasoning?: boolean } = {}
  ): Promise<WaitForInputListResult> {
    return this.workflowsService.listWaitingForInputSteps(spaceId, params);
  }

  public async resumeWorkflowExecutionExternallyViaGet(
    params: ExternalResumeViaGetParams & { request: KibanaRequest }
  ): Promise<ResumeWorkflowExecutionResponseDto> {
    const { request, ...resumeParams } = params;
    try {
      const result = await resumeWorkflowExecutionExternallyViaGet(
        this.workflowsService,
        resumeParams
      );
      this.audit?.logExecutionResumed(request, {
        executionId: resumeParams.executionId,
        resumedBy: result.resumedBy,
        channel: 'external',
      });
      return result;
    } catch (error) {
      this.audit?.logExecutionResumed(request, {
        executionId: resumeParams.executionId,
        channel: 'external',
        error,
      });
      throw error;
    }
  }

  public async resumeWorkflowExecutionExternallyWithInput(
    params: ExternalResumeWorkflowExecutionWithInputParams & { request: KibanaRequest }
  ): Promise<ResumeWorkflowExecutionResponseDto> {
    const { request, ...resumeParams } = params;
    try {
      const result = await resumeWorkflowExecutionExternallyWithInput(
        this.workflowsService,
        resumeParams
      );
      this.audit?.logExecutionResumed(request, {
        executionId: resumeParams.executionId,
        resumedBy: result.resumedBy,
        channel: 'external',
      });
      return result;
    } catch (error) {
      this.audit?.logExecutionResumed(request, {
        executionId: resumeParams.executionId,
        channel: 'external',
        error,
      });
      throw error;
    }
  }

  public async getExternalResumeFormPage(params: ExternalResumeFormPageParams): Promise<string> {
    return getExternalResumeFormPage(this.workflowsService, params);
  }

  /** Cross-workflow listing of processed `waitForInput` step executions. */
  public async listProcessedWaitForInputSteps(
    spaceId: string,
    params: {
      page?: number;
      perPage?: number;
      includeReasoning?: boolean;
    } & ProcessedWaitForInputFilters = {}
  ): Promise<WaitForInputListResult> {
    return this.workflowsService.listProcessedWaitForInputSteps(spaceId, params);
  }

  /** Facet buckets for processed `waitForInput` step executions. */
  public async listProcessedWaitForInputFacets(
    spaceId: string,
    options: { maxBuckets?: number } = {}
  ): Promise<ProcessedWaitForInputFacets> {
    return this.workflowsService.listProcessedWaitForInputFacets(spaceId, options);
  }

  /** Claims a `waitForInput` step by writing server-derived HITL audit metadata. */
  public async markStepAsResponded(
    stepExecutionId: string,
    request: KibanaRequest,
    channel: string | undefined,
    spaceId: string
  ): Promise<boolean> {
    return this.workflowsService.markStepAsResponded(stepExecutionId, request, channel, spaceId);
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

/**
 * Builds a `WorkflowValidationError` from a failed validation result, formatting
 * each error diagnostic into a location-annotated message.
 *
 * When the workflow fails *schema* validation, `validation.parsedWorkflow` is
 * absent (nothing typed to resolve step names against), so we fall back to an
 * unvalidated raw-YAML parse purely to recover the step/branch `name`s. This is
 * best-effort: if even the raw parse fails, the formatter degrades to numbered
 * labels (`step #1 › step #2`).
 */
function buildWorkflowValidationError(
  validation: ValidateWorkflowResponseDto,
  yaml: string
): WorkflowValidationError {
  let stepsForNaming: Pick<WorkflowYaml, 'steps'> | undefined = validation.parsedWorkflow;
  if (!stepsForNaming) {
    const rawParse = parseYamlToJSONWithoutValidation(yaml);
    if (rawParse.success) {
      stepsForNaming = rawParse.json as Pick<WorkflowYaml, 'steps'>;
    }
  }

  const errorMessages = validation.diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => formatWorkflowDiagnostic(d, stepsForNaming));

  return new WorkflowValidationError('Workflow validation failed', errorMessages);
}
