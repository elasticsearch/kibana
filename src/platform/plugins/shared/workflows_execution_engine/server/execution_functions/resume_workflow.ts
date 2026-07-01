/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import { isTerminalStatus } from '@kbn/workflows';
import { handlePostExecutionLoop } from './handle_post_execution_loop';
import { setupDependencies } from './setup_dependencies';
import type { WorkflowsExecutionEngineConfig } from '../config';
import { emitWorkflowExecutionFailedEventIfFailed } from '../lib/emit_workflow_execution_failed_event';
import type { WorkflowsMeteringService } from '../metering';
import type {
  InternalResumeWorkflowExecution,
  WorkflowsExecutionEnginePluginStart,
} from '../types';
import type { ContextDependencies } from '../workflow_context_manager/types';
import { workflowExecutionLoop } from '../workflow_execution_loop';

export async function resumeWorkflow({
  workflowRunId,
  spaceId,
  taskAbortController,
  dependencies,
  logger,
  config,
  fakeRequest,
  workflowsExecutionEngine,
  meteringService,
  internalResumeWorkflowExecution,
}: {
  workflowRunId: string;
  spaceId: string;
  taskAbortController: AbortController;
  logger: Logger;
  config: WorkflowsExecutionEngineConfig;
  fakeRequest: KibanaRequest;
  dependencies: ContextDependencies;
  workflowsExecutionEngine: WorkflowsExecutionEnginePluginStart;
  meteringService?: WorkflowsMeteringService;
  internalResumeWorkflowExecution?: InternalResumeWorkflowExecution;
}): Promise<void> {
  const {
    workflowRuntime,
    stepExecutionRuntimeFactory,
    workflowExecutionState,
    stepIoService,
    workflowLogger,
    nodesFactory,
    workflowExecutionGraph,
    esClient,
    workflowTaskManager,
    workflowExecutionRepository,
  } = await setupDependencies(
    workflowRunId,
    spaceId,
    logger,
    config,
    dependencies,
    fakeRequest,
    workflowsExecutionEngine
  );

  const loadedExecution = workflowExecutionState.getWorkflowExecution();
  if (isTerminalStatus(loadedExecution.status)) {
    logger.info(
      `Resume skipped for ${workflowRunId}: already in terminal status ${loadedExecution.status}`
    );
    return;
  }

  await workflowRuntime.resume();

  try {
    await workflowExecutionLoop({
      workflowRuntime,
      stepExecutionRuntimeFactory,
      workflowExecutionState,
      stepIoService,
      workflowExecutionRepository,
      workflowLogger,
      nodesFactory,
      workflowExecutionGraph,
      esClient,
      fakeRequest,
      coreStart: dependencies.coreStart,
      taskAbortController,
      workflowTaskManager,
    });
  } finally {
    await emitWorkflowExecutionFailedEventIfFailed({
      workflowRuntime,
      workflowExecutionState,
      emitEvent: workflowsExecutionEngine.triggerEvents.emitEvent,
      request: fakeRequest,
      logger,
      workflowRunId,
    });
  }

  await handlePostExecutionLoop({
    workflowRunId,
    spaceId,
    logger,
    fakeRequest,
    workflowExecutionRepository,
    internalResumeWorkflowExecution,
    workflowTaskManager,
    taskManager: dependencies.taskManager,
    meteringService,
    cloudSetup: dependencies.cloudSetup,
  });
}
