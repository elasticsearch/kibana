/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import assert from 'assert';
import type {
  AnalyticsServiceSetup,
  CoreSetup,
  KibanaRequest,
  Logger,
  LoggerFactory,
} from '@kbn/core/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
  ConcreteTaskInstance,
  RunContext,
} from '@kbn/task-manager-plugin/server';
import { TaskCost, TaskPriority } from '@kbn/task-manager-plugin/server/task';
import { throwUnrecoverableError } from '@kbn/task-manager-plugin/server';
import type { Pipeline } from '@kbn/ingest-pipelines-plugin/common/types';
import { getConnectorDefaultModel } from '@kbn/inference-common';
import { MAX_ATTEMPTS_AI_WORKFLOWS, TASK_TIMEOUT_DURATION } from '../constants';
import { TASK_STATUSES } from '../saved_objects/constants';
import { AgentService } from '../agents/agent_service';
import type { AutomaticImportSamplesIndexService } from '../samples_index/index_service';
import { generateFieldMappings } from '../build_integration/fields';
import { validateFieldMappings } from '../build_integration/validate_fields';
import type { FieldMapping } from '../../agents/state';
import type { LangSmithOptions } from '../../routes/types';
import type { AutomaticImportPluginStartDependencies } from '../../types';
import type { AutomaticImportSavedObjectService } from '../saved_objects/saved_objects_service';
import { AutomaticImportTelemetryEventType } from '../../../common';
import { DATA_STREAM_PHASES, type DataStreamPhase } from '../../../common/phases';

export const DATA_STREAM_CREATION_TASK_TYPE = 'autoImport-dataStream-task';

export interface DataStreamTaskParams extends DataStreamParams {
  /**
   * Inference connector ID to use when the background task runs.
   */
  connectorId: string;
  /**
   * Integration name that this data stream belongs to.
   */
  integrationName: string;
  /**
   * Unique data stream name for this integration.
   */
  dataStreamName: string;
  /**
   * Optional LangSmith tracing options to propagate to the agent invocation.
   */
  langSmithOptions?: LangSmithOptions;
}

export interface DataStreamParams {
  integrationId: string;
  dataStreamId: string;
}

export function isUnrecoverableByStatus(error: unknown): boolean {
  const s =
    (error as { statusCode?: number })?.statusCode ??
    (error as { meta?: { status?: number } })?.meta?.status ??
    (error as { output?: { statusCode?: number } })?.output?.statusCode;
  return s !== undefined && s !== 200 && s !== 201;
}

export class TaskManagerService {
  private logger: Logger;
  private taskManager: TaskManagerStartContract | null = null;
  private agentService: AgentService;
  private automaticImportSavedObjectService: AutomaticImportSavedObjectService | null = null;
  private analytics: AnalyticsServiceSetup;
  private readonly inFlightRunAbortControllers = new Map<string, AbortController>();

  constructor(
    logger: LoggerFactory,
    taskManagerSetup: TaskManagerSetupContract,
    core: CoreSetup<AutomaticImportPluginStartDependencies>,
    analytics: AnalyticsServiceSetup,
    samplesIndexService: AutomaticImportSamplesIndexService
  ) {
    this.logger = logger.get('taskManagerService');
    this.agentService = new AgentService(samplesIndexService, logger);
    this.analytics = analytics;

    taskManagerSetup.registerTaskDefinitions({
      [DATA_STREAM_CREATION_TASK_TYPE]: {
        title: 'Data Stream generation workflow',
        description: 'Executes long-running AI agent workflows for data stream generation',
        timeout: TASK_TIMEOUT_DURATION,
        maxAttempts: MAX_ATTEMPTS_AI_WORKFLOWS,
        cost: TaskCost.Normal,
        priority: TaskPriority.Normal,
        createTaskRunner: ({ taskInstance, fakeRequest, abortController }: RunContext) => ({
          run: async () => {
            assert(
              this.automaticImportSavedObjectService,
              'Automatic import saved object service not initialized'
            );
            const tmTaskId = taskInstance.id;
            this.inFlightRunAbortControllers.set(tmTaskId, abortController);
            try {
              return await this.runTask(
                taskInstance,
                core,
                this.automaticImportSavedObjectService,
                fakeRequest as KibanaRequest,
                abortController.signal
              );
            } finally {
              this.inFlightRunAbortControllers.delete(tmTaskId);
            }
          },
          cancel: async () => {
            return this.cancelTask(taskInstance);
          },
        }),
      },
    });

    this.logger.debug(`Task definition "${DATA_STREAM_CREATION_TASK_TYPE}" registered`);
  }

  // for lifecycle start phase
  public initialize(
    taskManager: TaskManagerStartContract,
    automaticImportSavedObjectService: AutomaticImportSavedObjectService
  ): void {
    this.taskManager = taskManager;
    this.automaticImportSavedObjectService = automaticImportSavedObjectService;
    this.logger.info('Automatic Import TaskManagerService initialized');
  }

  public async scheduleDataStreamCreationTask(
    params: DataStreamTaskParams,
    request: KibanaRequest
  ): Promise<{ taskId: string }> {
    assert(this.taskManager, 'TaskManager not initialized');

    const taskId = this.generateDataStreamTaskId({
      integrationId: params.integrationId,
      dataStreamId: params.dataStreamId,
    });

    const taskInstance = await this.taskManager.ensureScheduled(
      {
        id: taskId,
        taskType: DATA_STREAM_CREATION_TASK_TYPE,
        params,
        state: { task_status: TASK_STATUSES.pending },
        scope: ['automaticImport'],
      },
      { request }
    );

    this.logger.debug(`Task scheduled: ${taskInstance.id}`);
    return { taskId: taskInstance.id };
  }

  public async removeDataStreamCreationTask(dataStreamParams: DataStreamParams): Promise<void> {
    assert(this.taskManager, 'TaskManager not initialized');
    const taskId = this.generateDataStreamTaskId(dataStreamParams);
    try {
      const inFlightController = this.inFlightRunAbortControllers.get(taskId);
      if (inFlightController && !inFlightController.signal.aborted) {
        inFlightController.abort();
        this.logger.debug(`Aborted in-flight run for task ${taskId} before removing task document`);
      }
      await this.taskManager.removeIfExists(taskId);
      this.logger.debug(`Task deleted: ${taskId}`);
    } catch (error) {
      this.logger.error(`Failed to remove task ${taskId}:`, error);
      throw error;
    }
  }

  public async getTaskStatus(taskId: string): Promise<{
    task_status: keyof typeof TASK_STATUSES;
  }> {
    if (!this.taskManager) {
      throw new Error('TaskManager not initialized');
    }

    try {
      const task = await this.taskManager.get(taskId);

      return {
        task_status: task.state?.task_status,
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to get task status for ${taskId}: ${error}`);
      throw new Error(`Task ${taskId} not found or inaccessible`);
    }
  }

  private async runTask(
    taskInstance: ConcreteTaskInstance,
    core: CoreSetup<AutomaticImportPluginStartDependencies>,
    automaticImportSavedObjectService: AutomaticImportSavedObjectService,
    request: KibanaRequest,
    abortSignal: AbortSignal
  ) {
    assert(this.agentService, 'Agent service not initialized');
    assert(
      automaticImportSavedObjectService,
      'Automatic import saved object service not initialized'
    );

    const { id: taskId, params } = taskInstance;
    const {
      integrationId,
      dataStreamId,
      connectorId,
      integrationName,
      dataStreamName,
      langSmithOptions,
    } = params as DataStreamTaskParams;

    this.logger.debug(
      `Running task ${taskId} with ${JSON.stringify({ integrationId, dataStreamId, connectorId })}`
    );

    const startTime = Date.now();
    let modelName: string | undefined;
    let connectorType: string | undefined;
    let connectorName: string | undefined;

    try {
      if (!integrationId || !dataStreamId || !connectorId) {
        throw new Error('Task params must include integrationId, dataStreamId, and connectorId');
      }

      // Get core services and plugins
      const [coreStart, pluginsStart] = await core.getStartServices();

      // Use internal user for agent tools (fetch samples, validate pipeline) and field mapping
      // validation. These operations run in a background task and do not require user-scoped access.
      const esClient = coreStart.elasticsearch.client.asInternalUser;

      const model = await pluginsStart.inference.getChatModel({
        request,
        connectorId,
        chatModelOptions: {
          temperature: 0.05,
          // Prevent long internal retries; Task Manager handles retries at task level
          maxRetries: 1,
          disableStreaming: true,
          maxConcurrency: 50,
          telemetryMetadata: { pluginId: 'automatic_import' },
        },
      });

      try {
        const inferenceConnector = model.getConnector();
        modelName = getConnectorDefaultModel(inferenceConnector);
        connectorType = inferenceConnector.type;
        connectorName = inferenceConnector.name;
      } catch (resolveErr) {
        this.logger.warn(`Failed to resolve model info for telemetry: ${resolveErr}`);
      }

      const fieldsMetadataClient = await pluginsStart.fieldsMetadata.getClient(request);

      await automaticImportSavedObjectService.updateDataStreamSavedObjectAttributes({
        integrationId,
        dataStreamId,
        status: TASK_STATUSES.processing,
      });
      await automaticImportSavedObjectService.updateDataStreamPhase(
        dataStreamId,
        integrationId,
        DATA_STREAM_PHASES.analyzingLogs
      );
      this.throwIfAborted(abortSignal);

      const reportPhase = async (phase: DataStreamPhase) => {
        this.throwIfAborted(abortSignal);
        await automaticImportSavedObjectService.updateDataStreamPhase(
          dataStreamId,
          integrationId,
          phase
        );
      };

      const result = await this.agentService.invokeAutomaticImportAgent(
        integrationId,
        dataStreamId,
        esClient,
        model,
        fieldsMetadataClient,
        langSmithOptions,
        abortSignal,
        reportPhase
      );

      this.logger.debug(`Task ${taskId} completed successfully`);
      this.throwIfAborted(abortSignal);

      if (!result.current_pipeline) {
        throw new Error('Agent did not produce a valid ingest pipeline');
      }

      const pipelineObject = result.current_pipeline as Pipeline;
      const pipelineGenerationResultsObjects = result.pipeline_generation_results ?? [];

      this.logger.debug(`Pipeline object: ${JSON.stringify(pipelineObject)}`);
      this.logger.debug(
        `Pipeline generation results objects: ${JSON.stringify(result.pipeline_generation_results)}`
      );

      const agentFieldMappings = (result.field_mappings as FieldMapping[] | undefined) ?? undefined;

      await reportPhase(DATA_STREAM_PHASES.mappingEventFields);
      const fieldMapping = await generateFieldMappings(
        (pipelineGenerationResultsObjects ?? []) as Array<Record<string, unknown>>,
        fieldsMetadataClient,
        agentFieldMappings
      );
      this.logger.debug(`Generated field mappings: ${JSON.stringify(fieldMapping)}`);
      this.throwIfAborted(abortSignal);

      await reportPhase(DATA_STREAM_PHASES.mappingRelatedFields);

      await reportPhase(DATA_STREAM_PHASES.finalizing);
      const validationResult = await validateFieldMappings(
        esClient,
        fieldMapping,
        this.logger,
        abortSignal
      );
      if (!validationResult.valid) {
        this.logger.warn(
          `Field mapping validation warnings for ${dataStreamId}: ${validationResult.errors.join(
            ', '
          )}`
        );
      }
      this.throwIfAborted(abortSignal);

      // Update the data stream saved object with pipeline, field mappings, and task status
      await automaticImportSavedObjectService.updateDataStreamSavedObjectAttributes(
        {
          integrationId,
          dataStreamId,
          ingestPipeline: pipelineObject,
          pipelineDocs: pipelineGenerationResultsObjects,
          fieldMapping,
          status: TASK_STATUSES.completed,
        },
        abortSignal
      );

      this.logger.debug(`Data stream ${dataStreamId} updated successfully`);
      this.logger.debug(`Task ${taskId} result: ${JSON.stringify(result)}`);

      this.reportDataStreamCreationComplete({
        integrationId,
        integrationName,
        dataStreamId,
        dataStreamName,
        connectorId,
        modelName,
        connectorType,
        connectorName,
        durationMs: Date.now() - startTime,
        success: true,
      });

      return {
        state: {
          task_status: TASK_STATUSES.completed,
          result: {
            ingest_pipeline: pipelineObject,
            pipeline_generation_results: pipelineGenerationResultsObjects,
          },
        },
      };
    } catch (error) {
      if (abortSignal.aborted) {
        this.logger.debug(`Task ${taskId} was cancelled`);
        try {
          await automaticImportSavedObjectService.updateDataStreamSavedObjectAttributes({
            integrationId,
            dataStreamId,
            status: TASK_STATUSES.cancelled,
          });
        } catch (updateError) {
          this.logger.error(
            `Failed to mark data stream ${dataStreamId} as cancelled: ${JSON.stringify(
              updateError
            )}`
          );
        }
        return { state: { task_status: TASK_STATUSES.cancelled } };
      }

      this.logger.error(`Task ${taskId} failed: ${error}`);

      // Report telemetry for failed completion
      const errorMessage = error instanceof Error ? error.message : String(error);

      try {
        await automaticImportSavedObjectService.updateDataStreamSavedObjectAttributes({
          integrationId,
          dataStreamId,
          status: TASK_STATUSES.failed,
        });
        this.logger.debug(
          `Data stream ${dataStreamId} marked as failed for integration ${integrationId}`
        );
      } catch (updateError) {
        this.logger.error(
          `Failed to mark data stream ${dataStreamId} as failed: ${JSON.stringify(updateError)}`
        );
      }

      this.reportDataStreamCreationComplete({
        integrationId,
        integrationName,
        dataStreamId,
        dataStreamName,
        connectorId,
        modelName,
        connectorType,
        connectorName,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      if (isUnrecoverableByStatus(error))
        throwUnrecoverableError(error instanceof Error ? error : new Error(String(error)));

      return { state: { task_status: TASK_STATUSES.failed }, error };
    }
  }

  private reportDataStreamCreationComplete(params: {
    integrationId: string;
    integrationName: string;
    dataStreamId: string;
    dataStreamName: string;
    connectorId: string;
    modelName?: string;
    connectorType?: string;
    connectorName?: string;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
  }) {
    try {
      this.analytics.reportEvent(AutomaticImportTelemetryEventType.DataStreamCreationComplete, {
        sessionId: 'server-task',
        integrationId: params.integrationId,
        integrationName: params.integrationName,
        dataStreamId: params.dataStreamId,
        dataStreamName: params.dataStreamName,
        connectorId: params.connectorId,
        durationMs: params.durationMs,
        success: params.success,
        ...(params.modelName ? { modelName: params.modelName } : {}),
        ...(params.connectorType ? { connectorType: params.connectorType } : {}),
        ...(params.connectorName ? { connectorName: params.connectorName } : {}),
        ...(params.errorMessage ? { errorMessage: params.errorMessage } : {}),
      });
    } catch (telemetryError) {
      this.logger.warn(`Failed to report telemetry: ${telemetryError}`);
    }
  }

  private throwIfAborted(abortSignal: AbortSignal) {
    if (abortSignal.aborted) {
      throw new Error('Task was cancelled');
    }
  }

  private async cancelTask(taskInstance: ConcreteTaskInstance) {
    this.logger.debug(`Cancelling task ${taskInstance.id}`);
    return { state: { task_status: TASK_STATUSES.cancelled } };
  }

  private generateDataStreamTaskId(params: DataStreamParams): string {
    return `data-stream-task-${params.integrationId}-${params.dataStreamId}`;
  }
}
