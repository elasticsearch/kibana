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
import { ExecutionStatus, WorkflowRepository } from '@kbn/workflows';
import { isGraphBuildError, WorkflowGraph } from '@kbn/workflows/graph';
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
import {
  WORKFLOWS_EXECUTIONS_INDEX,
  WORKFLOWS_STEP_EXECUTIONS_INDEX,
} from '../repositories/data_access_layer/constants/execution_indexes';
import { PlainIndexDataClient } from '../repositories/data_access_layer/implementations/plain_index/plain_index_data_client';
import type {
  StepExecutionPersistence,
  WorkflowExecutionPersistence,
} from '../repositories/execution_persistence';
import { StepExecutionRepository } from '../repositories/step_execution_repository';
import { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';
import { NodesFactory } from '../step/nodes_factory';
import type { WorkflowsExecutionEnginePluginStart } from '../types';
import { StepExecutionRuntimeFactory } from '../workflow_context_manager/step_execution_runtime_factory';
import { StepIoService } from '../workflow_context_manager/step_io_service';
import type { ContextDependencies } from '../workflow_context_manager/types';
import { WorkflowExecutionCursor } from '../workflow_context_manager/workflow_execution_cursor';
import { WorkflowExecutionRuntimeManager } from '../workflow_context_manager/workflow_execution_runtime_manager';
import { WorkflowExecutionState } from '../workflow_context_manager/workflow_execution_state';

import { WorkflowEventLoggerService } from '../workflow_event_logger';
import { WorkflowTaskManager } from '../workflow_task_manager/workflow_task_manager';

export async function setupDependencies({
  workflowRunId,
  spaceId,
  logger,
  config,
  dependencies,
  fakeRequest,
  workflowsExecutionEngine,
  workflowExecution: workflowExecutionOverride,
  workflowExecutionRepository: workflowExecutionRepositoryOverride,
  stepExecutionRepository: stepExecutionRepositoryOverride,
}: {
  workflowRunId: string;
  spaceId: string;
  logger: Logger;
  config: WorkflowsExecutionEngineConfig;
  dependencies: ContextDependencies;
  fakeRequest?: KibanaRequest;
  workflowsExecutionEngine?: WorkflowsExecutionEnginePluginStart;
  workflowExecution?: EsWorkflowExecution;
  workflowExecutionRepository?: WorkflowExecutionPersistence;
  stepExecutionRepository?: StepExecutionPersistence;
}) {
  const { coreStart, actions, taskManager, workflowsExtensions } = dependencies;

  await workflowsExtensions.isReady();

  // Get ES client from core services (guaranteed to be available at task execution time)
  const internalEsClient = coreStart.elasticsearch.client.asInternalUser;

  const workflowExecutionPersistence =
    workflowExecutionRepositoryOverride ??
    new WorkflowExecutionRepository(
      new PlainIndexDataClient({
        esClient: internalEsClient,
        logger,
        indexName: WORKFLOWS_EXECUTIONS_INDEX,
      })
    );
  const stepExecutionPersistence =
    stepExecutionRepositoryOverride ??
    new StepExecutionRepository(
      new PlainIndexDataClient({
        esClient: internalEsClient,
        logger,
        indexName: WORKFLOWS_STEP_EXECUTIONS_INDEX,
      })
    );
  const workflowRepository = new WorkflowRepository({
    esClient: internalEsClient,
    logger,
  });

  const workflowExecution =
    workflowExecutionOverride ??
    (await workflowExecutionPersistence.getWorkflowExecutionById(workflowRunId, spaceId));

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

  // Compiling the definition into its execution graph can throw a GraphBuildError
  // for a structurally-unsupported workflow (currently only the parallel-branch
  // constraints: nested flow-control / unsupported step types inside a branch
  // body). This same rule is validated in the editor (see the client-side
  // `validateGraphBuild`, which squiggles the offending step), so authored-in-UI
  // workflows are rejected before they ever run. This block is the defense-in-depth
  // runtime net for the paths that bypass the editor — API/programmatic creation,
  // imports, or workflows authored before the constraint existed. It is a permanent
  // author error, not a transient fault, so we mark the execution FAILED with the
  // actionable message and rethrow a typed, non-retryable error — otherwise the raw
  // throw escapes the task runner and the run is force-recovered into an opaque
  // "Execution abandoned" TaskRecoveryError with no failure reason and no step records.
  let workflowExecutionGraph: WorkflowGraph;
  try {
    workflowExecutionGraph = WorkflowGraph.fromWorkflowDefinition(
      workflowExecution.workflowDefinition,
      defaultWorkflowSettings
    );
  } catch (error) {
    if (isGraphBuildError(error)) {
      const finishedAt = new Date();
      await workflowExecutionPersistence.updateWorkflowExecution({
        id: workflowRunId,
        status: ExecutionStatus.FAILED,
        error: { type: 'GraphBuildError', message: error.message },
        finishedAt: finishedAt.toISOString(),
        duration: finishedAt.getTime() - new Date(workflowExecution.startedAt).getTime(),
      });
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

  const workflowLogger = workflowEventLoggerService.createLogger({
    workflowId: workflowExecution.workflowId,
    workflowName: workflowExecution.workflowDefinition.name,
    executionId: workflowExecution.id,
    spaceId: workflowExecution.spaceId,
  });

  const workflowExecutionState = new WorkflowExecutionState(
    workflowExecution,
    workflowExecutionPersistence
  );

  const stepIoService = new StepIoService({
    stepRepository: stepExecutionPersistence,
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
    workflowExecution,
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
    workflowExecutionRepository: workflowExecutionPersistence,
    stepExecutionRepository: stepExecutionPersistence as StepExecutionRepository | undefined,
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
    // activeExecutionPersistence = resolved persistence (override ?? ES-backed default)
    activeExecutionPersistence: workflowExecutionPersistence,
    // workflowExecutionRepository = raw caller override; undefined on the async path
    workflowExecutionRepository: workflowExecutionRepositoryOverride,
    esClient,
    telemetryClient,
    workflowExecutionCursor,
  };
}
