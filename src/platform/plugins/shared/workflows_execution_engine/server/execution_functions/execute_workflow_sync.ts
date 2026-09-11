/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import { ExecutionStatus } from '@kbn/workflows';
import type { EsWorkflowExecution, WorkflowExecutionEngineModel } from '@kbn/workflows';
import { runWorkflowSync } from './run_workflow_sync';
import { buildWorkflowExecutionDocument } from '../lib/build_workflow_execution_document';
import { getAuthenticatedUser } from '../lib/get_user';
import { validateWorkflowInputs } from '../lib/validate_workflow_inputs';
import { InMemoryExecutionPersistence } from '../repositories/execution_persistence';
import type {
  ExecuteWorkflowOptions,
  ExecuteWorkflowResponse,
  WorkflowsExecutionEnginePluginStart,
} from '../types';
import type { ContextDependencies } from '../workflow_context_manager/types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getSynchronousWorkflowOutput = (output: unknown): Record<string, unknown> | undefined => {
  if (output === undefined || output === null) {
    return undefined;
  }
  if (isRecord(output)) {
    return output;
  }
  throw new Error('Synchronous workflow output must be an object');
};

export const executeWorkflowSync = async ({
  workflow,
  context,
  request,
  options,
  logger,
  dependencies,
  getWorkflowsExecutionEngine,
}: {
  workflow: WorkflowExecutionEngineModel;
  context: Record<string, unknown>;
  request: KibanaRequest;
  options: ExecuteWorkflowOptions;
  logger: Logger;
  dependencies: ContextDependencies;
  getWorkflowsExecutionEngine: () => Promise<WorkflowsExecutionEnginePluginStart>;
}): Promise<ExecuteWorkflowResponse> => {
  const { coreStart, workflowRepository, config } = dependencies;

  const spaceId = typeof context.spaceId === 'string' ? context.spaceId : 'default';

  if (!workflow.isEphemeral && workflowRepository) {
    const stillEnabled = await workflowRepository.isWorkflowEnabled(workflow.id, spaceId, {
      includeGlobal: true,
    });
    if (!stillEnabled) {
      throw new Error(`Workflow is disabled: ${workflow.id}. Enable the workflow to run it.`);
    }
  }

  const authenticatedUser = await getAuthenticatedUser(
    request,
    coreStart.security,
    coreStart.elasticsearch.client
  );

  const workflowExecution = await buildWorkflowExecutionDocument({
    workflow,
    context,
    defaultTriggeredBy: 'manual',
    authenticatedUser,
    now: new Date(),
    maxEventChainDepth: config.eventDriven.maxChainDepth,
    getConcurrencyGroupKey: () => null,
  });

  if (options.executionId) {
    workflowExecution.id = options.executionId;
  }

  if (!workflowExecution.workflowDefinition) {
    throw new Error('Synchronous workflow execution requires a workflow definition');
  }

  const syncWorkflowExecution: EsWorkflowExecution = {
    ...workflowExecution,
    isTestRun: workflowExecution.isTestRun ?? false,
    status: workflowExecution.status ?? ExecutionStatus.PENDING,
    context: workflowExecution.context ?? context,
    workflowDefinition: workflowExecution.workflowDefinition,
    yaml: workflowExecution.yaml ?? workflow.yaml,
    scopeStack: workflowExecution.scopeStack ?? [],
    error: workflowExecution.error ?? null,
    startedAt: workflowExecution.startedAt ?? workflowExecution.createdAt,
    finishedAt: workflowExecution.finishedAt ?? new Date().toISOString(),
    cancelRequested: workflowExecution.cancelRequested ?? false,
    duration: workflowExecution.duration ?? 0,
  };

  const syncExecutionPersistence = new InMemoryExecutionPersistence(syncWorkflowExecution);
  const inputsValid = await validateWorkflowInputs(
    syncWorkflowExecution,
    syncExecutionPersistence,
    logger,
    coreStart,
    { ...dependencies, capabilities: options.capabilities }
  );
  if (!inputsValid) {
    const failedExecution = await syncExecutionPersistence.getWorkflowExecutionById(
      syncWorkflowExecution.id,
      spaceId
    );
    return {
      workflowExecutionId: syncWorkflowExecution.id,
      result: {
        status: ExecutionStatus.FAILED,
        ...(failedExecution?.error ? { error: failedExecution.error } : {}),
      },
    };
  }

  const abortController = new AbortController();
  const abort = () => abortController.abort(options.abortSignal?.reason);
  options.abortSignal?.addEventListener('abort', abort, { once: true });
  if (options.abortSignal?.aborted) {
    abort();
  }

  const maxDurationMs = config.syncExecution.maxDurationMs;
  const timeoutId = setTimeout(
    () =>
      abortController.abort(
        new Error(`Synchronous workflow execution timed out after ${maxDurationMs}ms`)
      ),
    maxDurationMs
  );

  try {
    const workflowsExecutionEngine = await getWorkflowsExecutionEngine();
    const result = await runWorkflowSync({
      workflowExecution: syncWorkflowExecution,
      request,
      abortController,
      logger,
      config,
      dependencies: { ...dependencies, capabilities: options.capabilities },
      workflowsExecutionEngine,
      workflowExecutionRepository: syncExecutionPersistence,
      stepExecutionRepository: syncExecutionPersistence,
    });

    const output = getSynchronousWorkflowOutput(result.context?.output);
    const failureError =
      result.status === ExecutionStatus.FAILED && result.error ? result.error : undefined;
    return {
      workflowExecutionId: result.id,
      result: {
        status: result.status,
        ...(output ? { output } : {}),
        ...(failureError ? { error: failureError } : {}),
      },
    };
  } finally {
    clearTimeout(timeoutId);
    options.abortSignal?.removeEventListener('abort', abort);
  }
};
