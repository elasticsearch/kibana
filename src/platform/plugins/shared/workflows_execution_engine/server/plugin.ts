/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import { v4 as generateUuid } from 'uuid';
import type {
  CoreSetup,
  CoreStart,
  KibanaRequest,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import { ExecutionStatus, pickManagedWorkflowFields, WorkflowRepository } from '@kbn/workflows';
import type {
  BulkScheduleWorkflowResult,
  EsWorkflowExecution,
  WorkflowExecutionEngineModel,
  WorkflowSettings,
} from '@kbn/workflows';
import {
  WorkflowExecutionInvalidStatusError,
  WorkflowExecutionNotFoundError,
} from '@kbn/workflows/common/errors';
import { ConcurrencyManager } from './concurrency/concurrency_manager';
import type { WorkflowsExecutionEngineConfig } from './config';
import {
  cancelWorkflow,
  checkAndSkipIfExistingScheduledExecution,
  resumeWorkflow,
  runWorkflow,
} from './execution_functions';
import { checkLicense } from './lib/check_license';
import { ensureWorkflowsDataStreamsRolledOver } from './lib/data_streams/ensure_data_streams_rolled_over';
import { getAuthenticatedUser } from './lib/get_user';
import {
  resolveExhaustedWorkflowRunTask,
  resolveInterruptedWorkflowResumeTask,
  resolveInterruptedWorkflowRunTask,
} from './lib/task_recovery';
import { normalizeEventChainVisitedWorkflowIds } from './lib/telemetry/utils/extract_execution_metadata';
import { WorkflowExecutionTelemetryClient } from './lib/telemetry/workflow_execution_telemetry_client';
import { validateWorkflowInputs } from './lib/validate_workflow_inputs';
import { WorkflowsMeteringService } from './metering/metering_service';
import { initializeLogsRepositoryDataStream } from './repositories/logs_repository/data_stream';
import { StepExecutionRepository } from './repositories/step_execution_repository';
import { WorkflowExecutionRepository } from './repositories/workflow_execution_repository';
import { initializeTriggerEventsDataStream, TriggerEventHandler } from './trigger_events';
import { initializeTriggerEventsClient } from './trigger_events/event_logs';
import { searchTriggerEventLog as querySearchTriggerEventLog } from './trigger_events/event_logs/trigger_event_log_query';
import type {
  CancelAllActiveWorkflowExecutions,
  CancelWorkflowExecution,
  ExecuteWorkflow,
  ExecuteWorkflowStep,
  InternalResumeWorkflowExecution,
  ResumeWorkflowExecution,
  ScheduleWorkflow,
  TriggerEventsContract,
  WorkflowsExecutionEnginePluginSetup,
  WorkflowsExecutionEnginePluginSetupDeps,
  WorkflowsExecutionEnginePluginStart,
  WorkflowsExecutionEnginePluginStartDeps,
} from './types';
import { generateExecutionTaskScope } from './utils';
import {
  buildWorkflowContext,
  type WorkflowExecutionForInputRendering,
} from './workflow_context_manager/build_workflow_context';
import type { ContextDependencies } from './workflow_context_manager/types';
import { WorkflowEventLoggerService } from './workflow_event_logger';
import type {
  ResumeWorkflowExecutionParams,
  StartWorkflowExecutionParams,
} from './workflow_task_manager/types';
import {
  WORKFLOW_RESUME_TASK_TYPE,
  WORKFLOW_RUN_TASK_TYPE,
  WORKFLOW_SCHEDULED_TASK_TYPE,
} from './workflow_task_manager/types';
import {
  getWorkflowGlobalTimeoutResumeTaskId,
  WorkflowTaskManager,
} from './workflow_task_manager/workflow_task_manager';
import { createWorkflowTaskAbortController } from './workflow_task_shutdown';
import { createIndexes } from '../common';

/**
 * Max Task Manager attempts for `workflow:run`.
 * - Attempt 1: normal `runWorkflow` execution.
 * - Attempts > 1: `resolveInterruptedWorkflowRunTask` runs first; when it marks the execution FAILED
 *   (interrupt recovery) the runner returns without re-executing user logic - so attempt 2 is not a
 *   second full workflow run in that case.
 * - A third attempt mainly covers transient failures persisting that recovery (e.g. ES unavailable)
 *   or a thrown error on attempt 1 where attempt 2 still runs recovery then `runWorkflow` again;
 *   it is not meant as extra user workflow retries after successful interrupt recovery.
 */
const WORKFLOW_RUN_TASK_MAX_ATTEMPTS = 3;

/**
 * Max Task Manager attempts for `workflow:resume`.
 * Same numeric budget as run but semantics differ: each attempt can run `resumeWorkflow` user logic
 * until interrupt recovery short-circuits or the last attempt applies `resolveExhaustedWorkflowRunTask`
 * after a handler failure - so extra attempts also cover resume work that runs and may throw.
 */
const WORKFLOW_RESUME_TASK_MAX_ATTEMPTS = 3;

/** Batch size for bulk cancel search_after paging (internal; not exposed on the public API). */
const BULK_CANCEL_PAGE_SIZE = 10;

type SetupDependencies = Pick<ContextDependencies, 'cloudSetup'>;

export class WorkflowsExecutionEnginePlugin
  implements
    Plugin<
      WorkflowsExecutionEnginePluginSetup,
      WorkflowsExecutionEnginePluginStart,
      WorkflowsExecutionEnginePluginSetupDeps,
      WorkflowsExecutionEnginePluginStartDeps
    >
{
  private readonly logger: Logger;
  private readonly config: WorkflowsExecutionEngineConfig;
  private concurrencyManager!: ConcurrencyManager;
  private setupDependencies?: SetupDependencies;
  private coreSetup?: CoreSetup<
    WorkflowsExecutionEnginePluginStartDeps,
    WorkflowsExecutionEnginePluginStart
  >;
  private meteringService?: WorkflowsMeteringService;
  private initializePromise?: Promise<void>;
  /** Set in start(); used by task runners to pass parent-resume into run/resume without exposing it on the public plugin contract. */
  private internalResumeWorkflowExecutionHandler?: InternalResumeWorkflowExecution;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
    this.config = initializerContext.config.get<WorkflowsExecutionEngineConfig>();
  }

  public setup(
    core: CoreSetup<WorkflowsExecutionEnginePluginStartDeps, WorkflowsExecutionEnginePluginStart>,
    plugins: WorkflowsExecutionEnginePluginSetupDeps
  ) {
    this.logger.debug('Workflows execution engine setup');

    // Register telemetry event schemas
    WorkflowExecutionTelemetryClient.setup(core.analytics);

    const logger = this.logger;
    const config = this.config;

    this.coreSetup = core;

    initializeLogsRepositoryDataStream(core.dataStreams);
    initializeTriggerEventsDataStream(core.dataStreams);

    const setupDependencies: SetupDependencies = { cloudSetup: plugins.cloud };
    this.setupDependencies = setupDependencies;

    // Initialize metering from the centralized Usage API plugin
    if (plugins.usageApi?.usageReporting) {
      this.meteringService = new WorkflowsMeteringService(
        plugins.usageApi?.usageReporting,
        this.logger.get('workflowsMetering')
      );
      this.logger.debug('Workflows metering service initialized');
    } else {
      this.logger.debug(
        'Workflows metering service not initialized: Usage API plugin is not available or not configured'
      );
    }

    plugins.taskManager.registerTaskDefinitions({
      [WORKFLOW_RUN_TASK_TYPE]: {
        title: 'Run Workflow',
        description: 'Executes a workflow immediately',
        // Set high timeout for long-running workflows.
        // This is high value to allow long-running workflows.
        // The workflow timeout logic defined in workflow execution engine logic is the primary control.
        timeout: '365d',
        // Retries allow `resolveInterruptedWorkflowRunTask` to fail-fast abandoned executions after interrupt.
        maxAttempts: WORKFLOW_RUN_TASK_MAX_ATTEMPTS,
        createTaskRunner: ({ taskInstance, fakeRequest, abortController }) => {
          if (!fakeRequest) {
            throw new Error('Cannot execute a workflow without Kibana Request');
          }
          const taskAbortController = createWorkflowTaskAbortController(abortController);
          return {
            run: async () => {
              const { workflowRunId, spaceId } =
                taskInstance.params as StartWorkflowExecutionParams;

              // Add queue delay metrics to APM trace for observability
              const now = Date.now();
              const scheduledAt = taskInstance.scheduledAt
                ? new Date(taskInstance.scheduledAt).getTime()
                : null;
              const queueDelayMs = scheduledAt ? now - scheduledAt : null;

              const { default: apm } = await import('elastic-apm-node');
              const currentTransaction = apm.currentTransaction;
              if (currentTransaction) {
                if (queueDelayMs !== null) {
                  currentTransaction.setLabel('queue_delay_ms', queueDelayMs);
                  currentTransaction.setLabel(
                    'queue_delay_seconds',
                    Math.round(queueDelayMs / 1000)
                  );
                }
                currentTransaction.setLabel('workflow_run_id', workflowRunId);
                currentTransaction.setLabel('space_id', spaceId);
              }

              const [coreStart, pluginsStart, workflowsExecutionEngine] =
                await core.getStartServices();
              await checkLicense(pluginsStart.licensing);

              await this.initialize(coreStart);
              const dependencies: ContextDependencies = {
                ...setupDependencies,
                coreStart,
                actions: pluginsStart.actions,
                taskManager: pluginsStart.taskManager,
                workflowsExtensions: pluginsStart.workflowsExtensions,
                config,
              };

              const esClient = coreStart.elasticsearch.client.asInternalUser;
              const workflowExecutionRepository = new WorkflowExecutionRepository(esClient);
              const stepExecutionRepository = new StepExecutionRepository(esClient);

              const interruptedOutcome = await resolveInterruptedWorkflowRunTask({
                workflowExecutionRepository,
                stepExecutionRepository,
                workflowRunId,
                spaceId,
                taskAttempts: taskInstance.attempts,
                logger,
              });

              if (interruptedOutcome === 'task_complete') {
                return;
              }

              try {
                await runWorkflow({
                  workflowRunId,
                  spaceId,
                  taskAbortController,
                  config,
                  logger,
                  fakeRequest,
                  dependencies,
                  workflowsExecutionEngine,
                  meteringService: this.meteringService,
                  internalResumeWorkflowExecution: this.internalResumeWorkflowExecutionHandler,
                });
              } catch (error) {
                await resolveExhaustedWorkflowRunTask({
                  workflowExecutionRepository,
                  stepExecutionRepository,
                  workflowRunId,
                  spaceId,
                  taskAttempts: taskInstance.attempts,
                  maxAttempts: WORKFLOW_RUN_TASK_MAX_ATTEMPTS,
                  error,
                  logger,
                });
                throw error;
              }
            },
            cancel: async () => {
              taskAbortController.abort();
            },
          };
        },
      },
    });
    plugins.taskManager.registerTaskDefinitions({
      [WORKFLOW_RESUME_TASK_TYPE]: {
        title: 'Resume Workflow',
        description: 'Resumes a paused workflow',
        // Set high timeout for long-running workflows.
        // This is high value to allow long-running workflows.
        // The workflow timeout logic defined in workflow execution engine logic is the primary control.
        timeout: '365d',
        // Retries allow `resolveInterruptedWorkflowResumeTask` to fail-fast abandoned executions after interrupt.
        maxAttempts: WORKFLOW_RESUME_TASK_MAX_ATTEMPTS,
        createTaskRunner: ({ taskInstance, fakeRequest, abortController }) => {
          if (!fakeRequest) {
            throw new Error('Cannot resume a workflow without Kibana Request');
          }
          const taskAbortController = createWorkflowTaskAbortController(abortController);
          return {
            run: async () => {
              const { workflowRunId, spaceId } =
                taskInstance.params as ResumeWorkflowExecutionParams;

              // Add queue delay metrics to APM trace for observability
              const now = Date.now();
              const scheduledAt = taskInstance.scheduledAt
                ? new Date(taskInstance.scheduledAt).getTime()
                : null;
              const runAt = taskInstance.runAt ? new Date(taskInstance.runAt).getTime() : null;
              const queueDelayMs = scheduledAt ? now - scheduledAt : null;
              const resumeDelayMs = runAt ? now - runAt : null;

              const { default: apm } = await import('elastic-apm-node');
              const currentTransaction = apm.currentTransaction;
              if (currentTransaction) {
                if (queueDelayMs !== null) {
                  currentTransaction.setLabel('queue_delay_ms', queueDelayMs);
                  currentTransaction.setLabel(
                    'queue_delay_seconds',
                    Math.round(queueDelayMs / 1000)
                  );
                }
                if (resumeDelayMs !== null) {
                  currentTransaction.setLabel('resume_delay_ms', resumeDelayMs);
                }
                currentTransaction.setLabel('workflow_run_id', workflowRunId);
                currentTransaction.setLabel('space_id', spaceId);
              }

              const [coreStart, pluginsStart, workflowsExecutionEngine] =
                await core.getStartServices();
              await checkLicense(pluginsStart.licensing);

              await this.initialize(coreStart);
              const dependencies: ContextDependencies = {
                ...setupDependencies,
                coreStart,
                actions: pluginsStart.actions,
                taskManager: pluginsStart.taskManager,
                workflowsExtensions: pluginsStart.workflowsExtensions,
                config,
              };

              const esClient = coreStart.elasticsearch.client.asInternalUser;
              const workflowExecutionRepository = new WorkflowExecutionRepository(esClient);
              const stepExecutionRepository = new StepExecutionRepository(esClient);

              const interruptedOutcome = await resolveInterruptedWorkflowResumeTask({
                workflowExecutionRepository,
                stepExecutionRepository,
                workflowRunId,
                spaceId,
                taskAttempts: taskInstance.attempts,
                logger,
              });

              if (interruptedOutcome === 'task_complete') {
                return;
              }

              try {
                await resumeWorkflow({
                  workflowRunId,
                  spaceId,
                  taskAbortController,
                  config,
                  logger,
                  fakeRequest,
                  dependencies,
                  workflowsExecutionEngine,
                  meteringService: this.meteringService,
                  internalResumeWorkflowExecution: this.internalResumeWorkflowExecutionHandler,
                });
              } catch (error) {
                await resolveExhaustedWorkflowRunTask({
                  workflowExecutionRepository,
                  stepExecutionRepository,
                  workflowRunId,
                  spaceId,
                  taskAttempts: taskInstance.attempts,
                  maxAttempts: WORKFLOW_RESUME_TASK_MAX_ATTEMPTS,
                  error,
                  logger,
                });
                throw error;
              }
            },
            cancel: async () => {
              taskAbortController.abort();
            },
          };
        },
      },
    });
    plugins.taskManager.registerTaskDefinitions({
      [WORKFLOW_SCHEDULED_TASK_TYPE]: {
        title: 'Scheduled Workflow Execution',
        description: 'Executes workflows on a scheduled basis',
        // Set high timeout for long-running workflows.
        // This is high value to allow long-running workflows.
        // The workflow timeout logic defined in workflow execution engine logic is the primary control.
        timeout: '365d',
        maxAttempts: 3,
        createTaskRunner: ({ taskInstance, fakeRequest, abortController }) => {
          if (!fakeRequest) {
            throw new Error('Cannot execute a scheduled workflow without Kibana Request');
          }
          const taskAbortController = createWorkflowTaskAbortController(abortController);
          return {
            run: async () => {
              const { workflowId, spaceId } = taskInstance.params as {
                workflowId: string;
                spaceId: string;
                triggerType: string;
              };

              // Add queue delay metrics to APM trace for observability
              // This shows how long the task waited in the queue before execution
              const now = Date.now();
              const scheduledAt = taskInstance.scheduledAt
                ? new Date(taskInstance.scheduledAt).getTime()
                : null;
              const runAt = taskInstance.runAt ? new Date(taskInstance.runAt).getTime() : null;

              const queueDelayMs = scheduledAt ? now - scheduledAt : null;
              const scheduleDelayMs = runAt ? now - runAt : null;

              // Add labels to current APM transaction for queue visibility
              const { default: apm } = await import('elastic-apm-node');
              const currentTransaction = apm.currentTransaction;
              if (currentTransaction) {
                if (queueDelayMs !== null) {
                  currentTransaction.setLabel('queue_delay_ms', queueDelayMs);
                  currentTransaction.setLabel(
                    'queue_delay_seconds',
                    Math.round(queueDelayMs / 1000)
                  );
                }
                if (scheduleDelayMs !== null) {
                  currentTransaction.setLabel('schedule_delay_ms', scheduleDelayMs);
                }
                currentTransaction.setLabel('workflow_id', workflowId);
                currentTransaction.setLabel('space_id', spaceId);
              }

              logger.debug(
                `Workflow ${workflowId} queue metrics: queueDelayMs=${queueDelayMs}, scheduleDelayMs=${scheduleDelayMs}`
              );

              const [coreStart, pluginsStart] = await core.getStartServices();
              await checkLicense(pluginsStart.licensing);

              await this.initialize(coreStart);
              const dependencies: ContextDependencies = {
                ...setupDependencies,
                coreStart,
                actions: pluginsStart.actions,
                taskManager: pluginsStart.taskManager,
                workflowsExtensions: pluginsStart.workflowsExtensions,
                config,
              };
              const esClient = coreStart.elasticsearch.client.asInternalUser;

              const workflowRepository = new WorkflowRepository({ esClient, logger });
              const workflowExecutionRepository = new WorkflowExecutionRepository(esClient);
              const stepExecutionRepository = new StepExecutionRepository(esClient);

              const workflow = await workflowRepository.getWorkflow(workflowId, spaceId, {
                includeGlobal: true,
              });
              if (!workflow) {
                // Keep this as error for a while to ensure that such message appears only once per workflow
                logger.error(
                  `Workflow ${workflowId} not found in space ${spaceId}; removing orphaned scheduled task`
                );
                return {
                  state: taskInstance.state,
                  shouldDeleteTask: true,
                };
              }
              logger.debug(`Running scheduled workflow task for workflow ${workflow.id}`);

              // Guard check: Check&Skip only when workflow has no concurrency strategy. When strategy is
              // set, the concurrency check (later) governs the limit and strategy.
              if (!workflow.definition?.settings?.concurrency?.strategy) {
                const wasSkipped = await checkAndSkipIfExistingScheduledExecution(
                  workflow,
                  spaceId,
                  workflowExecutionRepository,
                  stepExecutionRepository,
                  taskInstance,
                  logger
                );
                if (wasSkipped) {
                  return;
                }
              }

              // Check for RRule triggers and log details
              const scheduledTriggers =
                workflow.definition?.triggers?.filter((trigger) => trigger.type === 'scheduled') ||
                [];
              const rruleTriggers = scheduledTriggers.filter(
                (trigger) => trigger.type === 'scheduled' && 'rrule' in (trigger.with || {})
              );

              // Create workflow execution record
              const workflowCreatedAt = new Date();
              const executionContext = {
                workflowRunId: `scheduled-${Date.now()}`,
                spaceId,
                inputs: {},
                event: {
                  type: 'scheduled',
                  timestamp: new Date().toISOString(),
                  source: 'task-manager',
                },
                triggeredBy: 'scheduled',
              };

              // Extract user from fake request (contains API key of user who scheduled the workflow)
              const span = apm.startSpan(
                'workflow get authenticated user',
                'workflow',
                'execution'
              );
              const executedBy = await getAuthenticatedUser(
                fakeRequest,
                coreStart.security,
                coreStart.elasticsearch.client
              );
              span?.end();

              const workflowExecution: Partial<EsWorkflowExecution> = {
                id: generateUuid(),
                spaceId,
                workflowId: workflow.id,
                ...pickManagedWorkflowFields(workflow),
                isTestRun: false,
                workflowDefinition: workflow.definition,
                yaml: workflow.yaml,
                context: executionContext,
                status: ExecutionStatus.PENDING,
                // Store task's runAt to link execution to specific scheduled run
                // runAt is stable across retries (retries use the same runAt but get a new startedAt)
                // This allows us to detect stale executions from previous scheduled runs
                taskRunAt: taskInstance.runAt?.toISOString() || null,
                createdAt: workflowCreatedAt.toISOString(),
                executedBy,
                triggeredBy: 'scheduled',
                // Store queue delay metrics for observability (only if enabled in config)
                ...(this.config.collectQueueMetrics
                  ? {
                      queueMetrics: {
                        scheduledAt: taskInstance.scheduledAt?.toString(),
                        runAt: taskInstance.runAt?.toString(),
                        startedAt: new Date(now).toISOString(),
                        queueDelayMs,
                        scheduleDelayMs,
                      },
                    }
                  : {}),
              };

              const concurrencyGroupKey = this.getConcurrencyGroupKey(
                workflowExecution,
                workflow.definition?.settings,
                coreStart,
                dependencies
              );
              if (concurrencyGroupKey) {
                workflowExecution.concurrencyGroupKey = concurrencyGroupKey;
              }

              // Use refresh: 'wait_for' to ensure the execution is immediately searchable
              // for deduplication checks by subsequent scheduled tasks
              await workflowExecutionRepository.createWorkflowExecution(workflowExecution, {
                refresh: 'wait_for',
              });

              // Check concurrency limits and apply collision strategy if needed
              const canProceed = await this.checkConcurrencyIfNeeded(workflowExecution);
              if (!canProceed) {
                // Execution was dropped due to concurrency limit, skip running
                return;
              }

              if (!workflowExecution.id || !workflowExecution.spaceId) {
                throw new Error('Workflow execution must have id and spaceId');
              }

              const [, , workflowsExecutionEngine] = await core.getStartServices();

              await runWorkflow({
                workflowRunId: workflowExecution.id,
                spaceId: workflowExecution.spaceId,
                taskAbortController,
                logger,
                config,
                fakeRequest,
                dependencies,
                workflowsExecutionEngine,
                meteringService: this.meteringService,
                internalResumeWorkflowExecution: this.internalResumeWorkflowExecutionHandler,
              });

              const scheduleType = rruleTriggers.length > 0 ? 'RRule' : 'interval/cron';
              logger.debug(
                `Successfully executed ${scheduleType}-scheduled workflow ${workflow.id}`
              );
            },
            async cancel() {
              taskAbortController.abort();
            },
          };
        },
      },
    });

    return {};
  }

  public start(coreStart: CoreStart, plugins: WorkflowsExecutionEnginePluginStartDeps) {
    this.logger.debug('workflows-execution-engine: Start');

    if (!this.setupDependencies) {
      throw new Error('Setup not called before start');
    }

    const esClient = coreStart.elasticsearch.client.asInternalUser;
    void ensureWorkflowsDataStreamsRolledOver(this.logger.get('data-stream-rollover'), esClient);

    // Initialize ConcurrencyManager with dependencies
    const workflowTaskManager = new WorkflowTaskManager(plugins.taskManager);
    const workflowExecutionRepository = new WorkflowExecutionRepository(esClient);
    const workflowRepository = new WorkflowRepository({ esClient, logger: this.logger });
    this.concurrencyManager = new ConcurrencyManager(
      workflowTaskManager,
      workflowExecutionRepository
    );

    const dependencies: ContextDependencies = {
      ...this.setupDependencies,
      coreStart,
      actions: plugins.actions,
      taskManager: plugins.taskManager,
      workflowsExtensions: plugins.workflowsExtensions,
      config: this.config,
    };

    // Re-check that a workflow is still enabled right before persisting an
    // execution document.  The route-level check may have read a stale value
    // if a concurrent hard-delete disabled the workflow in the meantime.
    // Skipped for ephemeral workflows — unsaved workflows don't exist in the workflow index.
    const ensureWorkflowEnabled = async (
      workflow: WorkflowExecutionEngineModel,
      spaceId: string
    ) => {
      if (workflow.isEphemeral) {
        return;
      }
      const stillEnabled = await workflowRepository.isWorkflowEnabled(workflow.id, spaceId, {
        includeGlobal: true,
      });
      if (!stillEnabled) {
        throw new Error(`Workflow is disabled: ${workflow.id}. Enable the workflow to run it.`);
      }
    };

    // Builds an execution document without persisting it. Shared by the
    // single-item persist helper and the bulk scheduling path.
    const buildWorkflowExecutionDocument = (args: {
      workflow: WorkflowExecutionEngineModel;
      context: Record<string, unknown>;
      defaultTriggeredBy: string;
      authenticatedUser: string;
      now: Date;
    }): WorkflowExecutionForInputRendering => {
      const { workflow, context, defaultTriggeredBy, authenticatedUser, now } = args;
      const triggeredBy = (context.triggeredBy as string | undefined) || defaultTriggeredBy;
      const spaceId = (context.spaceId as string | undefined) || 'default';
      const metadata = context.metadata as Record<string, unknown> | undefined;
      const eventPayload = context.event as Record<string, unknown> | undefined;
      let rootEventChainDepth: number | undefined;
      if (eventPayload) {
        const rawDepth = eventPayload.eventChainDepth;
        if (typeof rawDepth === 'number' && !Number.isNaN(rawDepth) && rawDepth >= 0) {
          rootEventChainDepth = rawDepth;
        } else if (typeof rawDepth === 'string' && rawDepth.trim() !== '') {
          const parsed = parseInt(rawDepth, 10);
          if (!Number.isNaN(parsed) && parsed >= 0) {
            rootEventChainDepth = parsed;
          }
        }
      }
      const rootVisited = normalizeEventChainVisitedWorkflowIds(
        eventPayload?.eventChainVisitedWorkflowIds,
        this.config.eventDriven.maxChainDepth
      );
      const dispatchEventId =
        typeof metadata?.eventId === 'string' ? metadata.eventId.trim() || undefined : undefined;
      const workflowExecution: WorkflowExecutionForInputRendering = {
        id: generateUuid(),
        spaceId,
        workflowId: workflow.id,
        ...pickManagedWorkflowFields(workflow),
        isTestRun: workflow.isTestRun,
        workflowDefinition: workflow.definition,
        yaml: workflow.yaml,
        context,
        status: ExecutionStatus.PENDING,
        createdAt: now.toISOString(),
        executedBy: authenticatedUser,
        triggeredBy,
        ...(metadata ? { metadata } : {}),
        ...(rootEventChainDepth !== undefined ? { eventChainDepth: rootEventChainDepth } : {}),
        ...(rootVisited.length > 0 ? { eventChainVisitedWorkflowIds: rootVisited } : {}),
        ...(dispatchEventId ? { dispatchEventId } : {}),
      };

      const concurrencyGroupKey = this.getConcurrencyGroupKey(
        workflowExecution,
        workflow.definition?.settings,
        coreStart,
        dependencies
      );
      if (concurrencyGroupKey) {
        workflowExecution.concurrencyGroupKey = concurrencyGroupKey;
      }

      return workflowExecution;
    };

    const createAndPersistWorkflowExecution = async (
      workflow: WorkflowExecutionEngineModel,
      context: Record<string, unknown>,
      defaultTriggeredBy: string,
      request: KibanaRequest,
      options: { refresh: boolean | 'wait_for' } = { refresh: false }
    ): Promise<{
      workflowExecution: WorkflowExecutionForInputRendering;
      repository: WorkflowExecutionRepository;
    }> => {
      await this.initialize(coreStart);

      await ensureWorkflowEnabled(workflow, (context.spaceId as string | undefined) || 'default');

      const authenticatedUser = await getAuthenticatedUser(
        request,
        coreStart.security,
        coreStart.elasticsearch.client
      );

      const workflowExecution = buildWorkflowExecutionDocument({
        workflow,
        context,
        defaultTriggeredBy,
        authenticatedUser,
        now: new Date(),
      });

      // Only pay the refresh cost when the concurrency check will actually run.
      // Without a concurrencyGroupKey there is no check, so refresh:false is fine.
      // When a check will run, the caller dictates the strategy: manual/UI paths use
      // refresh:true (immediate, no latency for the user); async paths use refresh:'wait_for'
      // (piggybacks on the scheduled cycle, lower cluster cost).
      await workflowExecutionRepository.createWorkflowExecution(workflowExecution, {
        refresh: workflowExecution.concurrencyGroupKey ? options.refresh : false,
      });

      return { workflowExecution, repository: workflowExecutionRepository };
    };

    // Helper function to create a task instance
    const createTaskInstance = (
      workflowExecution: Partial<EsWorkflowExecution>,
      scope: string[]
    ) => {
      return {
        id: `workflow:${workflowExecution.id}:${workflowExecution.triggeredBy}`,
        taskType: WORKFLOW_RUN_TASK_TYPE,
        params: {
          workflowRunId: workflowExecution.id,
          spaceId: workflowExecution.spaceId,
        } as StartWorkflowExecutionParams,
        state: {
          lastRunAt: null,
          lastRunStatus: null,
          lastRunError: null,
        },
        scope,
        enabled: true,
      };
    };

    const executeWorkflow: ExecuteWorkflow = async (workflow, context, request) => {
      await checkLicense(plugins.licensing);

      // AUTO-DETECT: Check if we're already running in a Task Manager context
      const isRunningInTaskManager =
        (context.triggeredBy as string | undefined) === 'scheduled' ||
        (context.source as string | undefined) === 'task-manager' ||
        request?.isFakeRequest === true;

      // Child executions (triggered by a workflow step) must always be scheduled in their own task,
      // never run inline in the parent's task. Otherwise the parent's runtime is blocked until the
      // child becomes idle, and cancel/timeout on the parent cannot take effect until then.
      const isChildExecution = (context.triggeredBy as string | undefined) === 'workflow-step';

      if (!isRunningInTaskManager && !request) {
        throw new Error('Workflows cannot be executed without the user context');
      }

      // Test-only hook: simulate slow execution creation so Scout API tests
      // can deterministically reproduce the TOCTOU race in hardDeleteWorkflows.
      // Only honoured for internal API requests (KbnClient sets x-elastic-internal-origin).
      if (request?.isInternalApiRequest) {
        const raw = request.headers['x-kbn-test-run-delay-ms'];
        const delayMs = parseInt(String(Array.isArray(raw) ? raw[0] : raw ?? '0'), 10);
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }

      const { workflowExecution } = await createAndPersistWorkflowExecution(
        workflow,
        context,
        'manual',
        request,
        { refresh: true }
      );

      const inputsValid = await validateWorkflowInputs(
        workflowExecution,
        workflowExecutionRepository,
        this.logger,
        coreStart,
        dependencies
      );
      if (!inputsValid) {
        return {
          workflowExecutionId: workflowExecution.id,
        };
      }

      // Check concurrency limits and apply collision strategy if needed
      const canProceed = await this.checkConcurrencyIfNeeded(workflowExecution);
      if (!canProceed) {
        // Execution was dropped due to concurrency limit, return execution ID
        return {
          workflowExecutionId: workflowExecution.id,
        };
      }

      if (isRunningInTaskManager && !isChildExecution) {
        // We're already in a task and this is not a child - execute directly without scheduling another task
        this.logger.debug(
          `Executing workflow directly (already in Task Manager context): ${workflow.id}`
        );

        if (!this.coreSetup) {
          throw new Error('Core setup not available');
        }
        const [, , workflowsExecutionEngine] = await this.coreSetup.getStartServices();

        await runWorkflow({
          workflowRunId: workflowExecution.id,
          spaceId: workflowExecution.spaceId,
          taskAbortController: new AbortController(), // TODO: We need to think how to pass this properly from outer task
          logger: this.logger,
          config: this.config,
          fakeRequest: request,
          dependencies,
          workflowsExecutionEngine,
          meteringService: this.meteringService,
          internalResumeWorkflowExecution: this.internalResumeWorkflowExecutionHandler,
        });
      } else {
        // Schedule a task: either we're not in a task, or this is a child execution (must not run inline)
        const taskInstance = createTaskInstance(workflowExecution, ['workflows']);
        await plugins.taskManager.schedule(taskInstance, { request: request as KibanaRequest });
        this.logger.debug(
          `Scheduling workflow task for workflow ${workflow.id}, execution ${workflowExecution.id}${
            isChildExecution ? ' (child execution)' : ''
          }`
        );
      }

      return {
        workflowExecutionId: workflowExecution.id,
      };
    };

    const scheduleWorkflow: ScheduleWorkflow = async (workflow, context, request) => {
      await checkLicense(plugins.licensing);

      const { workflowExecution } = await createAndPersistWorkflowExecution(
        workflow,
        context,
        'alert',
        request,
        { refresh: 'wait_for' }
      );

      // Check concurrency limits and apply collision strategy if needed
      const canProceed = await this.checkConcurrencyIfNeeded(workflowExecution);
      if (!canProceed) {
        // Execution was dropped due to concurrency limit, skip scheduling
        return {
          workflowExecutionId: workflowExecution.id as string,
        };
      }

      // Always schedule a task (never execute directly)
      const taskInstance = createTaskInstance(
        workflowExecution,
        generateExecutionTaskScope(workflowExecution as EsWorkflowExecution)
      );

      await plugins.taskManager.schedule(taskInstance, { request });
      this.logger.debug(
        `Scheduling workflow task with user context for workflow ${workflow.id}, execution ${workflowExecution.id}`
      );

      return {
        workflowExecutionId: workflowExecution.id as string,
      };
    };

    const bulkScheduleWorkflow = async (
      items: Array<{ workflow: WorkflowExecutionEngineModel; context: Record<string, unknown> }>,
      request: KibanaRequest
    ): Promise<BulkScheduleWorkflowResult> => {
      if (items.length === 0) {
        return [];
      }

      await checkLicense(plugins.licensing);
      await this.initialize(coreStart);

      const authenticatedUser = await getAuthenticatedUser(
        request,
        coreStart.security,
        coreStart.elasticsearch.client
      );
      const now = new Date();

      const results: BulkScheduleWorkflowResult = new Array(items.length);

      const spaceIdFor = (item: (typeof items)[number]) =>
        (item.context.spaceId as string | undefined) || 'default';

      // Single ES search for the enabled flags of every (workflowId, spaceId)
      // referenced by the batch. Skips ephemeral items (they are not indexed as workflows).
      const enabledRefs = items
        .filter((item) => !item.workflow.isEphemeral)
        .map((item) => ({ workflowId: item.workflow.id, spaceId: spaceIdFor(item) }));
      const enabledMap =
        enabledRefs.length === 0
          ? new Map<string, boolean>()
          : await workflowRepository.areWorkflowsEnabled(enabledRefs, {
              includeGlobal: true,
            });

      interface PreparedItem {
        idx: number;
        workflowExecution: Partial<EsWorkflowExecution>;
      }
      const prepared: PreparedItem[] = [];

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        try {
          if (!item.workflow.isEphemeral) {
            const spaceId = spaceIdFor(item);
            const enabled = enabledMap.get(`${spaceId}:${item.workflow.id}`) ?? false;
            if (!enabled) {
              throw new Error(
                `Workflow is disabled: ${item.workflow.id}. Enable the workflow to run it.`
              );
            }
          }
          const workflowExecution = buildWorkflowExecutionDocument({
            workflow: item.workflow,
            context: item.context,
            defaultTriggeredBy: 'alert',
            authenticatedUser,
            now,
          });
          prepared.push({ idx, workflowExecution });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results[idx] = { status: 'error', error: { message } };
        }
      }

      if (prepared.length === 0) {
        return results;
      }

      // Bulk write all prepared executions in a single _bulk call.
      // `refresh: 'wait_for'` matches the single-item scheduleWorkflow path
      // so downstream concurrency checks see the freshly-written docs.
      const bulkWriteResults = await workflowExecutionRepository.bulkCreateWorkflowExecutions(
        prepared.map((p) => p.workflowExecution),
        { refresh: 'wait_for' }
      );

      // Map per-doc bulk errors back to results; keep succeeded items for the
      // concurrency + task-scheduling passes.
      const succeeded: PreparedItem[] = [];
      for (let i = 0; i < prepared.length; i++) {
        const p = prepared[i];
        const writeResult = bulkWriteResults[i];
        if ('error' in writeResult) {
          results[p.idx] = {
            status: 'error',
            error: { message: writeResult.error },
          };
        } else {
          succeeded.push(p);
        }
      }

      if (succeeded.length === 0) {
        return results;
      }

      // Every item with a persisted doc returns 'scheduled' with its id, regardless
      // of whether the concurrency check drops it (matches single-item scheduleWorkflow).
      for (const p of succeeded) {
        results[p.idx] = {
          status: 'scheduled',
          workflowExecutionId: p.workflowExecution.id as string,
        };
      }

      // Concurrency checks for items in the same group must run sequentially:
      // they read and mutate the same ES state, so running them in parallel
      // would let siblings in one batch see each other as "in flight" and,
      // with max=1 and strategy='drop', drop every item; with
      // 'cancel-in-progress' they would also race to cancel each other.
      // Items without a key, and items in different groups, stay parallel.
      const keylessItems: PreparedItem[] = [];
      const bucketsByGroup = new Map<string, PreparedItem[]>();
      for (const p of succeeded) {
        const groupKey = p.workflowExecution.concurrencyGroupKey;
        if (!groupKey) {
          keylessItems.push(p);
        } else {
          const bucketKey = `${p.workflowExecution.spaceId ?? 'default'}:${groupKey}`;
          const existing = bucketsByGroup.get(bucketKey);
          if (existing) {
            existing.push(p);
          } else {
            bucketsByGroup.set(bucketKey, [p]);
          }
        }
      }

      const passingIdx = new Set<number>();
      const runCheck = async (p: PreparedItem) => {
        if (await this.checkConcurrencyIfNeeded(p.workflowExecution)) {
          passingIdx.add(p.idx);
        }
      };
      await Promise.all([
        ...keylessItems.map(runCheck),
        ...Array.from(bucketsByGroup.values()).map(async (bucket) => {
          for (const p of bucket) {
            await runCheck(p);
          }
        }),
      ]);

      const toSchedule = succeeded.filter((p) => passingIdx.has(p.idx));
      if (toSchedule.length > 0) {
        const tasks = toSchedule.map((p) =>
          createTaskInstance(
            p.workflowExecution,
            generateExecutionTaskScope(p.workflowExecution as EsWorkflowExecution)
          )
        );
        await plugins.taskManager.bulkSchedule(tasks, { request });
        this.logger.debug(`Bulk-scheduled ${toSchedule.length} workflow task(s) with user context`);
      }

      return results;
    };

    const executeWorkflowStep: ExecuteWorkflowStep = async (
      workflow,
      stepId,
      executionContext,
      contextOverride,
      request
    ) => {
      await checkLicense(plugins.licensing);

      await this.initialize(coreStart);
      await ensureWorkflowEnabled(workflow, workflow.spaceId || 'default');

      const workflowCreatedAt = new Date();
      const context: Record<string, unknown> = {
        ...(executionContext ?? {}),
        contextOverride,
      };

      const triggeredBy = (context.triggeredBy as string | undefined) || 'manual'; // 'manual' or 'scheduled'
      const executedBy = await getAuthenticatedUser(
        request,
        coreStart.security,
        coreStart.elasticsearch.client
      );
      const workflowExecution = {
        id: generateUuid(),
        spaceId: workflow.spaceId,
        stepId,
        workflowId: workflow.id,
        ...pickManagedWorkflowFields(workflow),
        isTestRun: workflow.isTestRun,
        workflowDefinition: workflow.definition,
        yaml: workflow.yaml,
        context,
        status: ExecutionStatus.PENDING,
        createdAt: workflowCreatedAt.toISOString(),
        executedBy,
        triggeredBy,
      };

      await workflowExecutionRepository.createWorkflowExecution(workflowExecution);

      const taskInstance = {
        id: `workflow:${workflowExecution.id}:${workflowExecution.triggeredBy}`,
        taskType: WORKFLOW_RUN_TASK_TYPE,
        params: {
          workflowRunId: workflowExecution.id,
          spaceId: workflowExecution.spaceId,
        },
        state: {
          lastRunAt: null,
          lastRunStatus: null,
          lastRunError: null,
        },
        scope: generateExecutionTaskScope(workflowExecution as EsWorkflowExecution),
        enabled: true,
      };

      // Use Task Manager's first-class API key support by passing the request
      // This ensures the step runs with the user's permissions, not kibana_system
      // At this point, request is guaranteed to exist due to the early check above
      this.logger.debug(
        `Scheduling workflow step task with user context for workflow ${workflow.id}, step ${stepId}`
      );
      await plugins.taskManager.schedule(taskInstance, { request });

      return {
        workflowExecutionId: workflowExecution.id as string,
      };
    };

    const cancelWorkflowExecution: CancelWorkflowExecution = async (
      workflowExecutionId,
      spaceId,
      schedulingRequest
    ) => {
      await checkLicense(plugins.licensing);
      await this.initialize(coreStart);

      await cancelWorkflow({
        workflowExecutionId,
        spaceId,
        schedulingRequest,
        workflowExecutionRepository,
        workflowTaskManager,
      });
    };

    const cancelAllActiveWorkflowExecutions: CancelAllActiveWorkflowExecutions = async ({
      spaceId,
      workflowId,
    }) => {
      await checkLicense(plugins.licensing);
      await this.initialize(coreStart);

      let searchAfter: estypes.SortResults | undefined;

      do {
        const page = await workflowExecutionRepository.findNonTerminalExecutionIdsByWorkflowIdPage({
          spaceId,
          workflowId,
          size: BULK_CANCEL_PAGE_SIZE,
          searchAfter,
        });

        if (page.results.length === 0) {
          break;
        }

        const outcomes = await Promise.allSettled(
          page.results.map((id) => cancelWorkflowExecution(id, spaceId))
        );

        outcomes.forEach((outcome, index) => {
          if (outcome.status === 'rejected') {
            const executionId = page.results[index];
            const message =
              outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
            this.logger.warn(
              `cancelAllActiveWorkflowExecutions: failed to cancel execution ${executionId}: ${message}`
            );
          }
        });

        searchAfter = page.nextSearchAfter;
      } while (searchAfter !== undefined);
    };

    const resumeWorkflowExecution: ResumeWorkflowExecution = async (
      executionId,
      spaceId,
      input,
      request
    ) => {
      await checkLicense(plugins.licensing);

      await this.initialize(coreStart);
      const workflowExecution = await workflowExecutionRepository.getWorkflowExecutionById(
        executionId,
        spaceId
      );

      if (!workflowExecution) {
        throw new WorkflowExecutionNotFoundError(executionId);
      }

      if (workflowExecution.status !== ExecutionStatus.WAITING_FOR_INPUT) {
        throw new WorkflowExecutionInvalidStatusError(
          executionId,
          workflowExecution.status,
          ExecutionStatus.WAITING_FOR_INPUT
        );
      }

      // Freshness guard: a waitForInput step whose parent workflow already
      // terminated (timeout, cancel, external failure) can leave the execution
      // doc with `status: waiting_for_input` but `finishedAt` set — writing
      // resumeInput and scheduling a resume task in that state is a no-op that
      // silently swallows the analyst's response. Reject explicitly so the
      // caller sees a 409 and the Inbox provider can surface a real error.
      if (workflowExecution.finishedAt) {
        throw new WorkflowExecutionInvalidStatusError(
          executionId,
          `${workflowExecution.status} (already finished at ${workflowExecution.finishedAt})`,
          ExecutionStatus.WAITING_FOR_INPUT
        );
      }

      const resumedBy = await getAuthenticatedUser(
        request,
        coreStart.security,
        coreStart.elasticsearch.client
      );

      const resumeContext = {
        ...workflowExecution.context,
        resumeInput: input,
        resumedBy,
        resumedAt: new Date().toISOString(),
      };

      await internalResumeWorkflowExecution(executionId, spaceId, resumeContext, request);

      return { resumedBy };
    };

    const internalResumeWorkflowExecution: InternalResumeWorkflowExecution = async (
      executionId,
      spaceId,
      context,
      request
    ) => {
      if (context) {
        await workflowExecutionRepository.updateWorkflowExecution({
          id: executionId,
          context,
        });
      }

      await workflowTaskManager.scheduleImmediateResume({
        executionId,
        spaceId,
        fakeRequest: request,
      });

      await plugins.taskManager
        .removeIfExists(getWorkflowGlobalTimeoutResumeTaskId(executionId))
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to remove idle-timeout resume task (execution=${executionId}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        });

      // Same idea as cancel: nudge TM so the resume task runs as soon as possible
      await workflowTaskManager.forceRunIdleTasks(executionId);
    };

    this.internalResumeWorkflowExecutionHandler = internalResumeWorkflowExecution;

    const workflowEventLoggerService = new WorkflowEventLoggerService(
      coreStart.dataStreams,
      this.logger,
      this.config.logging.console
    );

    const triggerEventsClientPromise = initializeTriggerEventsClient(coreStart.dataStreams);

    const triggerEventHandler = new TriggerEventHandler({
      coreStart,
      workflowRepository,
      workflowsExtensions: plugins.workflowsExtensions,
      spaces: plugins.spaces?.spacesService,
      scheduleWorkflow,
      logger: this.logger,
      config: this.config.eventDriven,
      triggerEventsClientPromise,
    });

    const triggerEvents: TriggerEventsContract = {
      emitEvent: (params) => triggerEventHandler.handleEvent(params),
      isEnabled: this.config.eventDriven.enabled,
      isLogEventsEnabled: this.config.eventDriven.logEvents,
      maxEventChainDepth: this.config.eventDriven.maxChainDepth,
      searchTriggerEventLog: async (params) => {
        const triggerEventsClient = await triggerEventsClientPromise;
        return querySearchTriggerEventLog(triggerEventsClient, params);
      },
    };

    return {
      workflowEventLoggerService,
      executeWorkflow,
      executeWorkflowStep,
      scheduleWorkflow,
      bulkScheduleWorkflow,
      cancelWorkflowExecution,
      cancelAllActiveWorkflowExecutions,
      resumeWorkflowExecution,
      triggerEvents,
    };
  }

  public stop() {}

  private async initialize(coreStart: CoreStart): Promise<void> {
    if (!this.initializePromise) {
      // Clear the cached promise on rejection so a transient failure (e.g. an ES
      // circuit_breaking_exception) doesn't poison every subsequent call. In-flight
      // callers still share the same attempt; only the *next* call after rejection
      // gets a fresh `createIndexes` invocation.
      const attempt = createIndexes({
        esClient: coreStart.elasticsearch.client.asInternalUser,
        logger: this.logger,
      });
      this.initializePromise = attempt;
      attempt.catch(() => {
        if (this.initializePromise === attempt) {
          this.initializePromise = undefined;
        }
      });
    }
    await this.initializePromise;
  }

  /**
   * Reused local wrapper for evaluating the concurrency group key for a workflow execution.
   * Normalizes the partial workflowExecution to build the workflow context needed for template evaluation.
   *
   * @param workflowExecution - The partial workflow execution
   * @param workflowSettings - The workflow settings from workflow definition
   * @param coreStart - Core start services
   * @param dependencies - Context dependencies for building workflow context
   * @returns The evaluated concurrency group key, or null if not applicable
   */
  private getConcurrencyGroupKey(
    workflowExecution: Partial<EsWorkflowExecution>,
    workflowSettings: WorkflowSettings | undefined,
    coreStart: CoreStart,
    dependencies: ContextDependencies
  ): string | null {
    if (!workflowSettings?.concurrency?.key) {
      return null;
    }

    // Guard check: ConcurrencyManager may not be initialized if task executes before start().
    // This should not occur in normal operation.
    if (!this.concurrencyManager) {
      this.logger.warn('ConcurrencyManager not initialized, skipping concurrency key evaluation.');
      return null;
    }

    const normalizedWorkflowExecution: EsWorkflowExecution = {
      scopeStack: [],
      error: null,
      startedAt: null,
      finishedAt: '',
      cancelRequested: false,
      duration: 0,
      ...workflowExecution,
    } as EsWorkflowExecution;

    // Concurrency keys are evaluated before validateWorkflowInputs renders and persists inputs.
    // Liquid-rendered input defaults or templated input values are not supported here.
    return this.concurrencyManager.evaluateConcurrencyKey(
      workflowSettings.concurrency,
      buildWorkflowContext(normalizedWorkflowExecution, coreStart, dependencies),
      workflowSettings.liquid
    );
  }

  /**
   * Checks concurrency limits and applies collision strategy if needed.
   * This helper method consolidates the duplicated concurrency check logic.
   *
   * For 'drop' strategy: if limit is exceeded, ConcurrencyManager marks execution as SKIPPED.
   * For 'cancel-in-progress' strategy: ConcurrencyManager cancels old executions to make room.
   *
   * @param workflowExecution - The workflow execution (might be partial)
   * @returns Promise<boolean> - true if execution can proceed, false if it should be dropped
   */
  private async checkConcurrencyIfNeeded(
    workflowExecution: Partial<EsWorkflowExecution>
  ): Promise<boolean> {
    // Guard check: ConcurrencyManager not initialized if task executes before start().
    // This should not occur in normal operation.
    // Execution will proceed without concurrency enforcement.
    if (!this.concurrencyManager) {
      this.logger.warn(
        `ConcurrencyManager not initialized, skipping concurrency check for execution ${workflowExecution.id}.`
      );
      return true;
    }

    if (
      !workflowExecution.workflowDefinition?.settings?.concurrency ||
      !workflowExecution.concurrencyGroupKey ||
      !workflowExecution.id ||
      !workflowExecution.spaceId
    ) {
      return true; // No concurrency settings, allow execution
    }

    try {
      const canProceed = await this.concurrencyManager.checkConcurrency(
        workflowExecution.workflowDefinition.settings.concurrency,
        workflowExecution.concurrencyGroupKey,
        workflowExecution.id,
        workflowExecution.spaceId
      );

      if (!canProceed) {
        this.logger.debug(
          `Dropped workflow execution ${workflowExecution.id} (group: ${workflowExecution.concurrencyGroupKey}) due to concurrency limit`
        );
      }

      return canProceed;
    } catch (error) {
      // Best-effort concurrency enforcement: log error but allow execution to proceed
      // This prevents a single cancellation failure from blocking new executions
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Failed to enforce concurrency limits for workflow execution ${workflowExecution.id} (group: ${workflowExecution.concurrencyGroupKey}): ${errorMessage}. Execution will proceed without concurrency enforcement.`
      );
      if (error instanceof Error) {
        this.logger.debug(`Concurrency enforcement error stack: ${error.stack}`);
      }
      return true; // On error, allow execution to proceed
    }
  }
}
