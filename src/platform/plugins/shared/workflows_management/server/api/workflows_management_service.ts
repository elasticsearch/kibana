/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ActionsClient, IUnsecuredActionsClient } from '@kbn/actions-plugin/server';
import type {
  CoreSetup,
  CoreStart,
  ElasticsearchClient,
  KibanaRequest,
  Logger,
} from '@kbn/core/server';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type {
  CreateWorkflowCommand,
  EsWorkflow,
  EsWorkflowStepExecution,
  ExecutionStatus,
  ExecutionType,
  UpdatedWorkflowResponseDto,
  ValidateWorkflowResponseDto,
  WorkflowAggsDto,
  WorkflowDetailDto,
  WorkflowExecutionCollapseField,
  WorkflowExecutionDto,
  WorkflowExecutionHistoryModel,
  WorkflowExecutionListDto,
  WorkflowExecutionSortField,
  WorkflowExecutionSortOrder,
  WorkflowListDto,
  WorkflowStatsDto,
} from '@kbn/workflows';
import type { ManagedWorkflowId } from '@kbn/workflows/managed';
import type {
  ExecuteManagedWorkflowOptions,
  GetManagedWorkflowStatusOptions,
  ManagedWorkflowInstanceState,
  ManagedWorkflowOperationOptions,
  ManagedWorkflowServiceInstallOptions,
  ManagedWorkflowStatusReport,
} from '@kbn/workflows/server/types';
import type {
  ChildWorkflowExecutionItem,
  GetAvailableConnectorsResponse,
  WorkflowPartialDetailDto,
} from '@kbn/workflows/types/v1';
import type {
  LogSearchResult,
  WorkflowExecutionsDataClient,
  WorkflowsExecutionEnginePluginStart,
} from '@kbn/workflows-execution-engine/server';
import type {
  ExecutionLogsParams,
  StepLogsParams,
} from '@kbn/workflows-execution-engine/server/workflow_event_logger/types';
import type {
  ServerTriggerDefinition,
  WorkflowsExtensionsServerPluginStart,
} from '@kbn/workflows-extensions/server';
import type { z } from '@kbn/zod/v4';

import type { StepExecutionListResult } from './lib/search_step_executions';

import { WorkflowManagementAuditLog } from './routes/utils/workflow_audit_logging';
import type {
  DeleteWorkflowsResponse,
  GetStepExecutionParams,
  GetWorkflowAggsOptions,
  GetWorkflowsParams,
  SearchStepExecutionsParams,
} from './workflows_management_api';

import type { ValidateWorkflowRequestOptions } from '../../common/lib/validate_workflow_yaml';
import type {
  RestoreWorkflowVersionResponseDto,
  WorkflowChangesHistoryResponse,
} from '../../common/lib/workflow_change_history/types';
import { getAuthenticatedUser } from '../lib/get_user';
import { getHistoryForWorkflow } from '../lib/get_workflow_change_history';
import {
  type ManagedInstallReadinessResult,
  waitForManagedWorkflowInstallReadiness,
} from '../lib/wait_for_managed_workflow_install_readiness';
import { ManagedWorkflowsService } from '../services/managed_workflows_service';
import { WorkflowChangeHistoryService } from '../services/workflow_change_history_service';
import {
  type BulkCreateWorkflowsResult,
  WorkflowCrudService,
} from '../services/workflow_crud_service';
import type {
  ProcessedWaitForInputFacets,
  ProcessedWaitForInputFilters,
  WaitForInputListResult,
} from '../services/workflow_execution_query_service';
import { WorkflowExecutionQueryService } from '../services/workflow_execution_query_service';
import { WorkflowSearchService } from '../services/workflow_search_service';
import { WorkflowValidationService } from '../services/workflow_validation_service';
import {
  createStorage,
  type WorkflowProperties,
  type WorkflowStorage,
} from '../storage/workflow_storage';
import { WorkflowTaskScheduler } from '../tasks/workflow_task_scheduler';
import type { WorkflowsServerPluginSetupDeps, WorkflowsServerPluginStartDeps } from '../types';

export interface SearchExecutionsViewParams {
  query?: estypes.QueryDslQueryContainer;
  statuses?: ExecutionStatus[];
  executionTypes?: ExecutionType[];
  executedBy?: string[];
  concurrencyGroupKey?: string;
  startedAfter?: string;
  startedBefore?: string;
  finishedAfter?: string;
  finishedBefore?: string;
  collapse?: WorkflowExecutionCollapseField;
  sortField?: string;
  sortOrder?: WorkflowExecutionSortOrder;
  page?: number;
  size?: number;
  trackTotalHits?: boolean;
  includeManagedExecutions?: boolean;
}

export interface SearchWorkflowExecutionsParams {
  workflowId?: string;
  statuses?: ExecutionStatus[];
  executionTypes?: ExecutionType[];
  executedBy?: string[];
  concurrencyGroupKey?: string;
  omitStepRuns?: boolean;
  finishedAfter?: string;
  finishedBefore?: string;
  collapse?: WorkflowExecutionCollapseField;
  sortField?: WorkflowExecutionSortField;
  sortOrder?: WorkflowExecutionSortOrder;
  page?: number;
  size?: number;
  /** Datemath lower bound for filtering by startedAt. */
  startedAfter?: string;
  /** Datemath upper bound for filtering by startedAt. */
  startedBefore?: string;
}

export class WorkflowsService {
  // The following attributes require `ensureInitialized` to be called before use
  private coreStart!: CoreStart;
  private pluginsStart!: WorkflowsServerPluginStartDeps;
  private workflowsExecutionEngine!: WorkflowsExecutionEnginePluginStart;
  private workflowsExtensions!: WorkflowsExtensionsServerPluginStart;
  private workflowStorage!: WorkflowStorage;
  private taskScheduler!: WorkflowTaskScheduler;
  private esClient!: ElasticsearchClient;
  private workflowExecutionsDataClient!: WorkflowExecutionsDataClient;
  private validationService!: WorkflowValidationService;
  private executionQueryService!: WorkflowExecutionQueryService;
  private searchService!: WorkflowSearchService;
  private crudService!: WorkflowCrudService;
  private managedWorkflowsService!: ManagedWorkflowsService;
  private readonly changeHistoryService: WorkflowChangeHistoryService;
  private getActionsClient!: () => Promise<IUnsecuredActionsClient>;
  private getActionsClientWithRequest!: (
    request: KibanaRequest
  ) => Promise<PublicMethodsOf<ActionsClient>>;

  private readonly initPromise: Promise<void>;
  /** One-shot stop signal; replaced on start so abort can fire again next lifecycle. */
  private stopController = new AbortController();

  constructor(
    public readonly core: CoreSetup<WorkflowsServerPluginStartDeps>,
    public readonly plugins: WorkflowsServerPluginSetupDeps,
    private readonly logger: Logger,
    public readonly kibanaVersion: string
  ) {
    this.changeHistoryService = new WorkflowChangeHistoryService(logger, kibanaVersion);
    this.initPromise = this.initialize(core);
  }

  public setStopping(stopping: boolean): void {
    if (stopping) {
      this.stopController.abort();
      return;
    }
    this.stopController = new AbortController();
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Waits until Elasticsearch is available (and pingable) or Kibana is stopping.
   * Never throws for expected teardown / ES unavailability.
   */
  private async ensureManagedInstallReady(
    operation: string
  ): Promise<ManagedInstallReadinessResult> {
    const readiness = await waitForManagedWorkflowInstallReadiness({
      core$: this.core.status.core$,
      esClient: { ping: () => this.esClient.ping() },
      signal: this.stopController.signal,
      operation,
      logger: this.logger,
    });

    if (!readiness.ready) {
      this.logger.warn(`Workflows Management: skipping managed ${operation} (${readiness.reason})`);
    }

    return readiness;
  }

  private async initializeChangeHistoryService(coreStart: CoreStart): Promise<void> {
    if (coreStart.security) {
      await this.changeHistoryService.initialize({
        elasticsearchClient: coreStart.elasticsearch.client.asInternalUser,
        authService: coreStart.security.authc,
      });
      return;
    }

    this.logger.warn('Workflows Management: workflow change history is not initialized');
  }

  private async initialize(core: CoreSetup<WorkflowsServerPluginStartDeps>) {
    const [coreStart, pluginsStart] = await core.getStartServices();
    this.coreStart = coreStart;
    this.pluginsStart = pluginsStart;
    this.esClient = coreStart.elasticsearch.client.asInternalUser;
    this.taskScheduler = new WorkflowTaskScheduler(this.logger, pluginsStart.taskManager);

    this.workflowStorage = createStorage({
      logger: this.logger,
      esClient: this.esClient,
    });

    this.workflowsExecutionEngine = pluginsStart.workflowsExecutionEngine;
    this.workflowsExtensions = pluginsStart.workflowsExtensions;

    this.getActionsClient = async () => pluginsStart.actions.getUnsecuredActionsClient();
    this.getActionsClientWithRequest = (request: KibanaRequest) =>
      pluginsStart.actions.getActionsClientWithRequest(request);

    this.validationService = new WorkflowValidationService({
      workflowsExtensions: this.workflowsExtensions,
      getActionsClient: this.getActionsClient,
      getActionsClientWithRequest: this.getActionsClientWithRequest,
    });

    const { workflowExecutionsDataClient, stepExecutionsDataClient } =
      this.workflowsExecutionEngine.__internalStorage;
    this.workflowExecutionsDataClient = workflowExecutionsDataClient;

    this.executionQueryService = new WorkflowExecutionQueryService({
      logger: this.logger,
      esClient: this.esClient,
      workflowExecutionsDataClient: this.workflowExecutionsDataClient,
      stepExecutionsDataClient,
      workflowEventLoggerService: this.workflowsExecutionEngine.workflowEventLoggerService,
    });

    this.searchService = new WorkflowSearchService({
      logger: this.logger,
      workflowStorage: this.workflowStorage,
      esClient: this.esClient,
      workflowExecutionsDataClient: this.workflowExecutionsDataClient,
    });

    await this.initializeChangeHistoryService(coreStart);

    this.crudService = new WorkflowCrudService({
      logger: this.logger,
      workflowStorage: this.workflowStorage,
      getSecurity: () => this.coreStart.security,
      workflowsExtensions: this.workflowsExtensions,
      getTaskScheduler: () => this.taskScheduler,
      executionQueryService: this.executionQueryService,
      validationService: this.validationService,
      getCoreStart: () => this.coreStart,
      changeHistoryService: this.changeHistoryService,
      workflowExecutionsDataClient: this.workflowExecutionsDataClient,
      stepExecutionsDataClient,
    });

    this.managedWorkflowsService = new ManagedWorkflowsService({
      crudService: this.crudService,
      workflowsExecutionEngine: this.workflowsExecutionEngine,
      logger: this.logger,
      isStopping: () => this.stopController.signal.aborted,
      audit: new WorkflowManagementAuditLog({ service: this }),
    });
  }

  public async getWorkflowsExecutionEngine(): Promise<WorkflowsExecutionEnginePluginStart> {
    await this.ensureInitialized();
    return this.workflowsExecutionEngine;
  }

  public async getWorkflowsExtensions(): Promise<WorkflowsExtensionsServerPluginStart> {
    await this.ensureInitialized();
    return this.workflowsExtensions;
  }

  public async getCoreStart(): Promise<CoreStart> {
    await this.ensureInitialized();
    return this.coreStart;
  }

  public async getPluginsStart(): Promise<WorkflowsServerPluginStartDeps> {
    await this.ensureInitialized();
    return this.pluginsStart;
  }

  public async getWorkflow(
    id: string,
    spaceId: string,
    options?: { includeDeleted?: boolean }
  ): Promise<WorkflowDetailDto | null> {
    await this.ensureInitialized();
    return this.crudService.getWorkflow(id, spaceId, options);
  }

  public async getHistoryForWorkflow(
    id: string,
    spaceId: string,
    options?: { page?: number; perPage?: number }
  ): Promise<WorkflowChangesHistoryResponse> {
    await this.ensureInitialized();
    return getHistoryForWorkflow(
      {
        changeHistoryService: this.changeHistoryService,
        userProfileService: this.coreStart.userProfile,
        getWorkflowSource: (workflowId, sid) =>
          this.crudService.getWorkflowDocumentSource(workflowId, sid, {
            includeGlobal: true,
            includeDeleted: true,
          }),
      },
      { workflowId: id, spaceId, ...options }
    );
  }

  public async getWorkflowsByIds(
    ids: string[],
    spaceId: string,
    options?: { includeDeleted?: boolean }
  ): Promise<WorkflowDetailDto[]> {
    await this.ensureInitialized();
    return this.crudService.getWorkflowsByIds(ids, spaceId, options);
  }

  public async findExistingWorkflowIds(ids: string[]): Promise<string[]> {
    await this.ensureInitialized();
    return this.crudService.findExistingWorkflowIds(ids);
  }

  public async getWorkflowsSourceByIds(
    ids: string[],
    spaceId: string,
    source?: string[],
    options?: { includeDeleted?: boolean }
  ): Promise<WorkflowPartialDetailDto[]> {
    await this.ensureInitialized();
    return this.crudService.getWorkflowsSourceByIds(ids, spaceId, source, options);
  }

  public async getInstalledManagedWorkflowState(
    id: string,
    spaceId: string,
    pluginId: string
  ): Promise<ManagedWorkflowInstanceState | null> {
    await this.ensureInitialized();
    const source = await this.crudService.getWorkflowDocumentSource(id, spaceId);
    if (!source?.managed || source.managedBy !== pluginId) {
      return null;
    }
    return this.toManagedWorkflowInstanceState(id, source);
  }

  public async listInstalledManagedWorkflowStates(
    pluginId: string
  ): Promise<ManagedWorkflowInstanceState[]> {
    await this.ensureInitialized();
    const documents = await this.crudService.getManagedWorkflowDocumentsAllSpaces({ pluginId });
    return documents.map(({ id, source }) => this.toManagedWorkflowInstanceState(id, source));
  }

  private toManagedWorkflowInstanceState(
    id: string,
    source: WorkflowProperties
  ): ManagedWorkflowInstanceState {
    return {
      workflowId: id,
      spaceId: source.spaceId,
      definitionId: source.originManagedWorkflowId ?? null,
      templateValues: source.managedTemplateValues ?? null,
      documentVersion: source.version ?? null,
    };
  }

  public async createWorkflow(
    workflow: CreateWorkflowCommand,
    spaceId: string,
    request: KibanaRequest,
    options?: { nameFallback?: string }
  ): Promise<WorkflowDetailDto> {
    await this.ensureInitialized();
    return this.crudService.createWorkflow(workflow, spaceId, request, options);
  }

  public async bulkCreateWorkflows(
    workflows: CreateWorkflowCommand[],
    spaceId: string,
    request: KibanaRequest,
    options?: { overwrite?: boolean }
  ): Promise<BulkCreateWorkflowsResult> {
    await this.ensureInitialized();
    return this.crudService.bulkCreateWorkflows(workflows, spaceId, request, options);
  }

  public async updateWorkflow(
    id: string,
    workflow: Partial<EsWorkflow>,
    spaceId: string,
    request: KibanaRequest
  ): Promise<UpdatedWorkflowResponseDto> {
    await this.ensureInitialized();
    return this.crudService.updateWorkflow(id, workflow, spaceId, request);
  }

  public async restoreWorkflowVersion(
    workflowId: string,
    eventId: string,
    spaceId: string,
    request: KibanaRequest
  ): Promise<RestoreWorkflowVersionResponseDto> {
    await this.ensureInitialized();
    return this.crudService.restoreWorkflowVersion(workflowId, eventId, spaceId, request);
  }

  public async deleteWorkflows(
    ids: string[],
    spaceId: string,
    options?: { force?: boolean }
  ): Promise<DeleteWorkflowsResponse> {
    await this.ensureInitialized();
    return this.crudService.deleteWorkflows(ids, spaceId, options);
  }

  /**
   * Disables all enabled workflows. When `spaceId` is set, only workflows in that
   * space; otherwise across all spaces. Delegated to {@link WorkflowCrudService},
   * which sets `enabled: false`, patches YAML accordingly, and unschedules any
   * scheduled tasks.
   * Used when a user opts out of workflows by toggling the per-space UI setting
   * off, or when availability (license / config) requires a global bulk disable.
   */
  public async disableAllWorkflows(
    spaceId?: string,
    request?: KibanaRequest
  ): Promise<{
    total: number;
    disabled: number;
    failures: Array<{ id: string; error: string }>;
  }> {
    await this.ensureInitialized();
    return this.crudService.disableAllWorkflows(spaceId, request);
  }

  public async getWorkflowsSubscribedToTrigger(
    triggerId: string,
    spaceId: string
  ): Promise<WorkflowDetailDto[]> {
    await this.ensureInitialized();
    return this.searchService.getWorkflowsSubscribedToTrigger(triggerId, spaceId);
  }

  public async getWorkflows(
    params: GetWorkflowsParams,
    spaceId: string,
    options?: { includeExecutionHistory?: boolean; includeManagedExecutionHistory?: boolean }
  ): Promise<WorkflowListDto> {
    await this.ensureInitialized();
    return this.searchService.getWorkflows(params, spaceId, options);
  }

  public async getWorkflowStats(
    spaceId: string,
    options?: { includeExecutionStats?: boolean; includeManagedExecutionStats?: boolean }
  ): Promise<WorkflowStatsDto> {
    await this.ensureInitialized();
    return this.searchService.getWorkflowStats(spaceId, options);
  }

  public async getWorkflowAggs(
    fields: string[],
    spaceId: string,
    options?: GetWorkflowAggsOptions
  ): Promise<WorkflowAggsDto> {
    await this.ensureInitialized();
    return options
      ? this.searchService.getWorkflowAggs(fields, spaceId, options)
      : this.searchService.getWorkflowAggs(fields, spaceId);
  }

  public async getWorkflowExecution(
    executionId: string,
    spaceId: string,
    options?: { includeInput?: boolean; includeOutput?: boolean }
  ): Promise<WorkflowExecutionDto | null> {
    await this.ensureInitialized();
    return this.executionQueryService.getWorkflowExecution(executionId, spaceId, options);
  }

  public async getChildWorkflowExecutions(
    parentExecutionId: string,
    spaceId: string
  ): Promise<ChildWorkflowExecutionItem[]> {
    await this.ensureInitialized();
    return this.executionQueryService.getChildWorkflowExecutions(parentExecutionId, spaceId);
  }

  public async getWorkflowExecutions(
    params: SearchWorkflowExecutionsParams,
    spaceId: string
  ): Promise<WorkflowExecutionListDto> {
    await this.ensureInitialized();
    return this.executionQueryService.getWorkflowExecutions(params, spaceId);
  }

  public async searchExecutionsView(
    params: SearchExecutionsViewParams,
    spaceId: string
  ): Promise<WorkflowExecutionListDto> {
    await this.ensureInitialized();
    return this.executionQueryService.searchExecutionsView(params, spaceId);
  }

  public async listWaitingForInputSteps(
    spaceId: string,
    pagination: { page?: number; perPage?: number; includeReasoning?: boolean } = {}
  ): Promise<WaitForInputListResult> {
    await this.ensureInitialized();
    return this.executionQueryService.listWaitingForInputSteps(spaceId, pagination);
  }

  public async listProcessedWaitForInputSteps(
    spaceId: string,
    options: {
      page?: number;
      perPage?: number;
      includeReasoning?: boolean;
    } & ProcessedWaitForInputFilters = {}
  ): Promise<WaitForInputListResult> {
    await this.ensureInitialized();
    return this.executionQueryService.listProcessedWaitForInputSteps(spaceId, options);
  }

  /** Facet buckets for processed wait-for-input rows. */
  public async listProcessedWaitForInputFacets(
    spaceId: string,
    options: { maxBuckets?: number } = {}
  ): Promise<ProcessedWaitForInputFacets> {
    await this.ensureInitialized();
    return this.executionQueryService.listProcessedWaitForInputFacets(spaceId, options);
  }

  public async markStepAsResponded(
    stepExecutionId: string,
    request: KibanaRequest,
    channel: string | undefined,
    spaceId: string
  ): Promise<boolean> {
    await this.ensureInitialized();
    // Resolve responder identity server-side so callers cannot spoof audit metadata.
    const respondedBy = getAuthenticatedUser(request, this.coreStart?.security);
    return this.executionQueryService.markStepAsResponded(
      stepExecutionId,
      { respondedBy, respondedAt: new Date().toISOString(), channel },
      spaceId
    );
  }

  public async claimHitlStepForExternalResume(
    stepExecutionId: string,
    respondedBy: string,
    spaceId: string
  ): Promise<boolean> {
    await this.ensureInitialized();
    return this.executionQueryService.markStepAsResponded(
      stepExecutionId,
      { respondedBy, respondedAt: new Date().toISOString(), channel: 'external' },
      spaceId
    );
  }

  public async getWaitingStepExecutionId(
    executionId: string,
    spaceId: string
  ): Promise<string | null> {
    await this.ensureInitialized();
    return this.executionQueryService.getWaitingStepExecutionId(executionId, spaceId);
  }

  public async getWorkflowExecutionHistory(
    executionId: string,
    spaceId: string
  ): Promise<WorkflowExecutionHistoryModel[]> {
    await this.ensureInitialized();
    return this.executionQueryService.getWorkflowExecutionHistory(executionId, spaceId);
  }

  public async getStepExecutions(params: GetStepExecutionParams, spaceId: string) {
    await this.ensureInitialized();
    return this.executionQueryService.getStepExecutions(params, spaceId);
  }

  public async searchStepExecutions(
    params: SearchStepExecutionsParams,
    spaceId: string
  ): Promise<StepExecutionListResult> {
    await this.ensureInitialized();
    return this.executionQueryService.searchStepExecutions(params, spaceId);
  }

  public async getExecutionLogs(params: ExecutionLogsParams): Promise<LogSearchResult> {
    await this.ensureInitialized();
    return this.executionQueryService.getExecutionLogs(params);
  }

  public async getStepLogs(params: StepLogsParams): Promise<LogSearchResult> {
    await this.ensureInitialized();
    return this.executionQueryService.getStepLogs(params);
  }

  public async getStepExecution(
    params: GetStepExecutionParams,
    spaceId: string
  ): Promise<EsWorkflowStepExecution | null> {
    await this.ensureInitialized();
    return this.executionQueryService.getStepExecution(params, spaceId);
  }

  public async getAvailableConnectors(
    spaceId: string,
    request: KibanaRequest
  ): Promise<GetAvailableConnectorsResponse> {
    await this.ensureInitialized();
    return this.validationService.getAvailableConnectors(spaceId, request);
  }

  public async getRegisteredCustomTriggerDefinitions(): Promise<ServerTriggerDefinition[]> {
    await this.ensureInitialized();
    return this.validationService.getRegisteredCustomTriggerDefinitions();
  }

  public async validateWorkflow(
    yaml: string,
    spaceId: string,
    request: KibanaRequest,
    options?: ValidateWorkflowRequestOptions
  ): Promise<ValidateWorkflowResponseDto> {
    await this.ensureInitialized();
    return this.validationService.validateWorkflow(yaml, spaceId, request, options);
  }

  public async getWorkflowZodSchema(
    options: { loose?: false },
    spaceId: string,
    request: KibanaRequest
  ): Promise<z.ZodType> {
    await this.ensureInitialized();
    return this.validationService.getWorkflowZodSchema(options, spaceId, request);
  }

  /**
   * Install or update a managed workflow after ES readiness gating.
   * Best-effort: may no-op when Kibana is stopping or ES is not ready (resolve ≠ persisted).
   * Gated skips mark the plugin install pass incomplete so ready() will not orphan-delete.
   */
  public async installManagedWorkflow(
    id: ManagedWorkflowId,
    options: ManagedWorkflowServiceInstallOptions,
    registeredPluginId: string
  ): Promise<void> {
    await this.ensureInitialized();
    const readiness = await this.ensureManagedInstallReady(`install '${id}'`);
    if (!readiness.ready) {
      // So ready() cannot treat gated-out installs as orphans and force-delete them.
      this.managedWorkflowsService.markInstallIncomplete(registeredPluginId);
      return;
    }
    return this.managedWorkflowsService.installManagedWorkflow(id, options, registeredPluginId);
  }

  public async uninstallManagedWorkflow(
    id: ManagedWorkflowId,
    options: ManagedWorkflowOperationOptions,
    registeredPluginId: string
  ): Promise<void> {
    await this.ensureInitialized();
    return this.managedWorkflowsService.uninstallManagedWorkflow(id, options, registeredPluginId);
  }

  public async getManagedWorkflowStatus(
    id: ManagedWorkflowId,
    options: GetManagedWorkflowStatusOptions,
    registeredPluginId: string
  ): Promise<ManagedWorkflowStatusReport> {
    await this.ensureInitialized();
    return this.managedWorkflowsService.getManagedWorkflowStatus(id, options, registeredPluginId);
  }

  public async executeManagedWorkflow(
    id: ManagedWorkflowId,
    request: KibanaRequest,
    options: ExecuteManagedWorkflowOptions,
    registeredPluginId: string
  ): Promise<string> {
    await this.ensureInitialized();
    return this.managedWorkflowsService.executeManagedWorkflow(
      id,
      request,
      options,
      registeredPluginId
    );
  }

  /**
   * Owner signal that static managed installs for this plugin are finished.
   * Best-effort: may no-op when Kibana is stopping or ES is not ready. When installs
   * were incomplete this boot, destructive orphan cleanup is skipped; dynamic auto
   * upgrades still run once this call has passed Elasticsearch readiness.
   */
  public async pluginReady(pluginId: string): Promise<void> {
    await this.ensureInitialized();
    const readiness = await this.ensureManagedInstallReady(`ready() for plugin '${pluginId}'`);
    if (!readiness.ready) {
      return;
    }
    return this.managedWorkflowsService.pluginReady(pluginId);
  }

  public async cleanupUnregisteredOrphans(registeredOwnerPluginIds: string[]): Promise<void> {
    await this.ensureInitialized();
    const readiness = await this.ensureManagedInstallReady('global orphan cleanup');
    if (!readiness.ready) {
      return;
    }
    return this.managedWorkflowsService.cleanupUnregisteredOrphans(registeredOwnerPluginIds);
  }
}
