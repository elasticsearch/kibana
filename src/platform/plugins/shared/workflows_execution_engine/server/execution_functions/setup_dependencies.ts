/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient, KibanaRequest, Logger } from '@kbn/core/server';
import type { EsWorkflowExecution } from '@kbn/workflows';
import { ExecutionStatus, isTerminalStatus, WorkflowRepository } from '@kbn/workflows';
import { GraphBuildError, isGraphBuildError, WorkflowGraph } from '@kbn/workflows/graph';
import { setWorkflowEventChainContext } from '@kbn/workflows-extensions/server';
import { WorkflowGraphSetupError } from './workflow_graph_setup_error';
import type { WorkflowsExecutionEngineConfig } from '../config';

import { ConnectorExecutor } from '../connector_executor';
import { defaultWorkflowSettings } from '../default_workflow_settings';
import {
  extractEventChainDepthFromExecution,
  extractEventChainVisitedWorkflowIdsFromExecution,
  mergeEmitterWorkflowIntoEventChainVisited,
} from '../lib/telemetry/utils/extract_execution_metadata';
import { WorkflowExecutionTelemetryClient } from '../lib/telemetry/workflow_execution_telemetry_client';
import type { StepExecutionRepository } from '../repositories/step_execution_repository';
import type { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';
import { NodesFactory } from '../step/nodes_factory';
import type { WorkflowsExecutionEnginePluginStart } from '../types';
import { StepExecutionRuntimeFactory } from '../workflow_context_manager/step_execution_runtime_factory';
import { StepIoService } from '../workflow_context_manager/step_io_service';
import type { ContextDependencies } from '../workflow_context_manager/types';
import { WorkflowExecutionCursor } from '../workflow_context_manager/workflow_execution_cursor';
import { WorkflowExecutionRuntimeManager } from '../workflow_context_manager/workflow_execution_runtime_manager';
import {
  getTerminalWorkflowRefreshOptions,
  WorkflowExecutionState,
} from '../workflow_context_manager/workflow_execution_state';

import { WorkflowEventLoggerService } from '../workflow_event_logger';
import { WorkflowTaskManager } from '../workflow_task_manager/workflow_task_manager';

export async function setupDependencies(
  workflowRunId: string,
  spaceId: string,
  logger: Logger,
  config: WorkflowsExecutionEngineConfig,
  dependencies: ContextDependencies,
  workflowExecutionRepository: WorkflowExecutionRepository,
  stepExecutionRepository: StepExecutionRepository,
  fakeRequest?: KibanaRequest,
  workflowsExecutionEngine?: WorkflowsExecutionEnginePluginStart
) {
  const { coreStart, actions, taskManager, workflowsExtensions } = dependencies;

  await workflowsExtensions.isReady();

  // Get ES client from core services (guaranteed to be available at task execution time)
  const internalEsClient = coreStart.elasticsearch.client.asInternalUser;

  const workflowRepository = new WorkflowRepository({
    esClient: internalEsClient,
    logger,
  });

  const workflowExecution = await workflowExecutionRepository.getWorkflowExecutionById(
    workflowRunId,
    spaceId
  );

  if (!workflowExecution) {
    throw new Error(`Workflow execution with ID ${workflowRunId} not found`);
  }

  if (!fakeRequest) {
    logger.error('Cannot execute a workflow without Kibana Request');
    throw new Error(
      `Workflow execution id ${workflowRunId} cannot execute a workflow without Kibana Request`
    );
  }

  const eventChainDepth = extractEventChainDepthFromExecution(workflowExecution) ?? -1;
  const baseVisited = extractEventChainVisitedWorkflowIdsFromExecution(
    workflowExecution,
    config.eventDriven.maxChainDepth
  );
  const visitedWorkflowIds = mergeEmitterWorkflowIntoEventChainVisited(
    baseVisited,
    workflowExecution.workflowId,
    config.eventDriven.maxChainDepth
  );
  setWorkflowEventChainContext(fakeRequest, {
    depth: eventChainDepth,
    sourceExecutionId: workflowExecution.id,
    ...(visitedWorkflowIds.length > 0 ? { visitedWorkflowIds } : {}),
  });

  // Reject incompatible execution formats before reading checkpoints, and persist
  // permanent setup failures instead of allowing task recovery to reinterpret them.
  let workflowExecutionGraph: WorkflowGraph;
  try {
    const executionMode = workflowExecution.executionMode;
    if (
      !isTerminalStatus(workflowExecution.status) &&
      executionMode !== 'parallel_v4' &&
      !(
        executionMode === undefined &&
        [ExecutionStatus.PENDING, ExecutionStatus.QUEUED].includes(workflowExecution.status) &&
        !workflowExecution.currentNodeId &&
        !workflowExecution.stepExecutionIds?.length &&
        !workflowExecution.scopeStack?.length
      )
    ) {
      throw new GraphBuildError(
        'This execution uses an unsupported legacy execution format. Start a new execution; legacy checkpoints cannot be resumed.',
        'workflow'
      );
    }
    workflowExecutionGraph = WorkflowGraph.fromWorkflowDefinition(
      workflowExecution.workflowDefinition,
      defaultWorkflowSettings
    );
    if (!workflowExecution.executionMode && !isTerminalStatus(workflowExecution.status)) {
      await workflowExecutionRepository.updateWorkflowExecution({
        id: workflowRunId,
        executionMode: 'parallel_v4',
      });
      workflowExecution.executionMode = 'parallel_v4';
    }
  } catch (error) {
    if (isGraphBuildError(error)) {
      const finishedAt = new Date();
      await workflowExecutionRepository.updateWorkflowExecution(
        {
          id: workflowRunId,
          status: ExecutionStatus.FAILED,
          error: { type: 'GraphBuildError', message: error.message },
          finishedAt: finishedAt.toISOString(),
          duration: finishedAt.getTime() - new Date(workflowExecution.startedAt).getTime(),
        },
        getTerminalWorkflowRefreshOptions({ ...workflowExecution, status: ExecutionStatus.FAILED })
      );
      logger.error(
        `Workflow execution ${workflowRunId} failed to build its execution graph: ${error.message}`
      );
      throw new WorkflowGraphSetupError(error.message);
    }
    throw error;
  }

  // If the execution is for a specific step, narrow the graph to that step
  if (workflowExecution.stepId) {
    workflowExecutionGraph = workflowExecutionGraph.getStepGraph(workflowExecution.stepId);
  }

  const scopedActionsClient = await actions.getActionsClientWithRequest(fakeRequest);
  const connectorExecutor = new ConnectorExecutor(scopedActionsClient);

  const workflowEventLoggerService = new WorkflowEventLoggerService(
    dependencies.coreStart.dataStreams,
    logger,
    config.logging.console
  );

  const workflowLogger = workflowEventLoggerService.createLogger(
    {
      workflowId: workflowExecution.workflowId,
      workflowName: workflowExecution.workflowDefinition.name,
      executionId: workflowExecution.id,
      spaceId: workflowExecution.spaceId,
    },
    { throwOnFailure: true }
  );

  const workflowExecutionState = new WorkflowExecutionState(
    workflowExecution as EsWorkflowExecution,
    workflowExecutionRepository
  );

  const stepIoService = new StepIoService({
    stepRepository: stepExecutionRepository,
    state: workflowExecutionState,
    evictionMinBytes: config.eviction.minPayloadSize.getValueInBytes(),
    logger,
  });

  // Create telemetry client
  const telemetryClient = new WorkflowExecutionTelemetryClient(coreStart.analytics, logger);

  const workflowExecutionCursor = new WorkflowExecutionCursor({
    workflowExecutionGraph,
    nodeId: workflowExecution.currentNodeId,
    stackFrames: workflowExecution.scopeStack,
  });

  // Create workflow runtime first (simpler, fewer dependencies)
  const workflowRuntime = new WorkflowExecutionRuntimeManager({
    workflowExecution: workflowExecution as EsWorkflowExecution,
    workflowExecutionGraph,
    workflowExecutionCursor,
    workflowLogger,
    workflowExecutionState,
    stepIoService,
    coreStart,
    dependencies,
    telemetryClient,
  });

  const esClient: ElasticsearchClient =
    coreStart.elasticsearch.client.asScoped(fakeRequest).asCurrentUser;

  const workflowTaskManager = new WorkflowTaskManager(taskManager);

  const enhancedDependencies: ContextDependencies = {
    ...dependencies,
    workflowRepository,
    workflowExecutionRepository,
    stepExecutionRepository,
    workflowsExecutionEngine,
    spaceId,
    request: fakeRequest,
  };

  const stepExecutionRuntimeFactory = new StepExecutionRuntimeFactory({
    workflowExecutionGraph,
    workflowExecutionState,
    stepIoService,
    workflowLogger,
    esClient,
    fakeRequest,
    coreStart,
    dependencies: enhancedDependencies,
  });

  const nodesFactory = new NodesFactory(
    connectorExecutor,
    workflowRuntime,
    workflowLogger,
    workflowExecutionGraph,
    stepExecutionRuntimeFactory,
    enhancedDependencies,
    stepIoService
  );

  return {
    workflowExecutionGraph,
    workflowRuntime,
    stepExecutionRuntimeFactory,
    workflowExecutionState,
    stepIoService,
    workflowLogger,
    workflowTaskManager,
    nodesFactory,
    workflowExecutionRepository,
    esClient,
    telemetryClient,
    workflowExecutionCursor,
  };
}
