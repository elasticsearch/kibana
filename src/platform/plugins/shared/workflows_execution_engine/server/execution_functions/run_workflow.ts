/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import apm from 'elastic-apm-node';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import {
  ExecutionStatus,
  isEventDrivenWorkflowTriggerSource,
  isTerminalStatus,
} from '@kbn/workflows';
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

export async function runWorkflow({
  workflowRunId,
  spaceId,
  taskAbortController,
  logger,
  config,
  fakeRequest,
  dependencies,
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
  // Span for setup/initialization phase
  const setupSpan = apm.startSpan('workflow setup', 'workflow', 'setup');
  const {
    workflowRuntime,
    stepExecutionRuntimeFactory,
    workflowExecutionState,
    stepIoService,
    workflowLogger,
    nodesFactory,
    workflowExecutionGraph,
    workflowTaskManager,
    workflowExecutionRepository,
    esClient,
    telemetryClient,
  } = await setupDependencies(
    workflowRunId,
    spaceId,
    logger,
    config,
    dependencies,
    fakeRequest,
    workflowsExecutionEngine
  );

  setupSpan?.end();

  const execution = workflowExecutionState.getWorkflowExecution();
  if (isTerminalStatus(execution.status)) {
    logger.debug(
      `Skipping workflow run ${workflowRunId}: execution already terminal [${execution.status}]`
    );
    if (meteringService) {
      void meteringService.reportWorkflowExecution(execution, dependencies.cloudSetup);
    }
    return;
  }

  const triggeredBy = execution.triggeredBy;
  const isEventDriven = isEventDrivenWorkflowTriggerSource(triggeredBy);
  if (isEventDriven && !workflowsExecutionEngine.triggerEvents.isEnabled) {
    const cancelledAt = new Date().toISOString();
    await workflowExecutionRepository.updateWorkflowExecution({
      id: workflowRunId,
      status: ExecutionStatus.SKIPPED,
      cancellationReason: 'Event-driven execution disabled by operator',
      cancelledAt,
      cancelledBy: 'system',
    });
    logger.debug(
      `Event-driven execution is disabled; skipping workflow run ${workflowRunId} (triggeredBy: ${triggeredBy}).`
    );
    telemetryClient.reportEventDrivenExecutionSuppressed({
      workflowExecution: {
        ...execution,
        status: ExecutionStatus.SKIPPED,
        cancellationReason: 'Event-driven execution disabled by operator',
        cancelledAt,
        cancelledBy: 'system',
      },
      logTriggerEventsEnabled: workflowsExecutionEngine.triggerEvents.isLogEventsEnabled,
    });
    return;
  }

  // Span for runtime initialization (graph building, topsort, etc.)
  const startSpan = apm.startSpan('workflow runtime start', 'workflow', 'initialization');
  try {
    await workflowRuntime.start();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      `Workflow execution ${workflowRunId} failed during runtime start: ${errorMessage}`
    );
    if (errorStack) {
      logger.error(`Workflow execution ${workflowRunId} runtime start error stack: ${errorStack}`);
    }
    throw error;
  } finally {
    startSpan?.end();
  }

  // Span for the main execution loop
  const loopSpan = apm.startSpan('workflow execution loop', 'workflow', 'execution');
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
    loopSpan?.setOutcome('success');
  } catch (error) {
    loopSpan?.setOutcome('failure');
    throw error;
  } finally {
    loopSpan?.end();

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
