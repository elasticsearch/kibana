/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import apm from 'elastic-apm-node';
import { performance } from 'perf_hooks';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { EsWorkflowExecution } from '@kbn/workflows';
import { setupDependencies } from './setup_dependencies';
import {
  syncExecutionDurationHistogram,
  syncExecutionRequestsCounter,
} from './sync_execution_metrics';
import { validateSyncWorkflow } from './validate_sync_workflow';
import type { WorkflowsExecutionEngineConfig } from '../config';
import type {
  StepExecutionPersistence,
  WorkflowExecutionPersistence,
} from '../repositories/execution_persistence';
import type { WorkflowsExecutionEnginePluginStart } from '../types';
import type { ContextDependencies } from '../workflow_context_manager/types';
import { workflowExecutionLoop } from '../workflow_execution_loop';

export const runWorkflowSync = async ({
  workflowExecution,
  request,
  abortController,
  logger,
  config,
  dependencies,
  workflowsExecutionEngine,
  workflowExecutionRepository,
  stepExecutionRepository,
}: {
  workflowExecution: EsWorkflowExecution;
  request: KibanaRequest;
  abortController: AbortController;
  logger: Logger;
  config: WorkflowsExecutionEngineConfig;
  dependencies: ContextDependencies;
  workflowsExecutionEngine: WorkflowsExecutionEnginePluginStart;
  workflowExecutionRepository: WorkflowExecutionPersistence;
  stepExecutionRepository: StepExecutionPersistence;
}): Promise<EsWorkflowExecution> => {
  apm.currentTransaction?.setLabel('execution_mode', 'sync');
  const startTime = performance.now();
  let outcome: 'success' | 'error' | 'aborted' = 'success';

  const resolveAbortOutcome = (signal: AbortSignal): 'aborted' | 'error' => {
    const reason = signal.reason;
    return reason instanceof Error && reason.name !== 'AbortError' ? 'error' : 'aborted';
  };

  try {
    const setup = await setupDependencies({
      workflowRunId: workflowExecution.id,
      spaceId: workflowExecution.spaceId,
      logger,
      config,
      dependencies,
      fakeRequest: request,
      workflowsExecutionEngine,
      workflowExecution,
      workflowExecutionRepository,
      stepExecutionRepository,
    });

    validateSyncWorkflow(
      setup.workflowExecutionGraph,
      dependencies.workflowsExtensions.getStepDefinition
    );
    await setup.workflowRuntime.start();
    await workflowExecutionLoop({
      ...setup,
      workflowExecutionRepository: setup.activeExecutionPersistence,
      fakeRequest: request,
      coreStart: dependencies.coreStart,
      signal: abortController.signal,
      executionMode: 'sync',
    });

    if (abortController.signal.aborted) {
      outcome = resolveAbortOutcome(abortController.signal);
    }
    return setup.workflowExecutionState.getWorkflowExecution();
  } catch (error) {
    outcome = abortController.signal.aborted
      ? resolveAbortOutcome(abortController.signal)
      : 'error';
    throw error;
  } finally {
    syncExecutionDurationHistogram.record(performance.now() - startTime, { outcome });
    syncExecutionRequestsCounter.add(1, { outcome });
  }
};
