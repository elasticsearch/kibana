/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import { ExecutionStatus, isTerminalStatus } from '@kbn/workflows';
import { WorkflowExecutionNotFoundError } from '@kbn/workflows/common/errors';
import { drainConcurrencyQueueSlots } from '../concurrency/concurrency_queue_drainer';
import type { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';
import type { WorkflowTaskManager } from '../workflow_task_manager/workflow_task_manager';

/**
 * Persists `cancelRequested: true` and asks Task Manager to make the cancellation
 * take effect as soon as possible. `PENDING` and `QUEUED` move straight to `CANCELLED`
 * because no execution loop will ever observe the flag for them.
 *
 * `forceRunIdleTasks` either runs an idle task already scoped to this execution
 * or schedules an immediate resume task, so the execution loop wakes up, sees
 * `cancelRequested`, and finalises the cancel via `cancelWorkflowIfRequested`.
 *
 * Throws `WorkflowExecutionNotFoundError` when the execution does not exist in
 * the given space. Returns silently when it is already terminal.
 */
export const cancelWorkflow = async ({
  workflowExecutionId,
  spaceId,
  schedulingRequest,
  workflowExecutionRepository,
  workflowTaskManager,
  taskManager,
  logger,
}: {
  workflowExecutionId: string;
  spaceId: string;
  schedulingRequest?: KibanaRequest;
  workflowExecutionRepository: WorkflowExecutionRepository;
  workflowTaskManager: WorkflowTaskManager;
  taskManager: TaskManagerStartContract;
  logger: Logger;
}): Promise<void> => {
  const workflowExecution = await workflowExecutionRepository.getWorkflowExecutionById(
    workflowExecutionId,
    spaceId
  );

  if (!workflowExecution) {
    throw new WorkflowExecutionNotFoundError(workflowExecutionId);
  }

  if (isTerminalStatus(workflowExecution.status)) {
    return;
  }

  const freesConcurrencySlotImmediately =
    workflowExecution.status === ExecutionStatus.PENDING ||
    workflowExecution.status === ExecutionStatus.QUEUED;

  const concurrencySettings = workflowExecution.workflowDefinition?.settings?.concurrency;
  const concurrencyGroupKey = workflowExecution.concurrencyGroupKey;
  const shouldRefreshBeforeQueueDrain =
    freesConcurrencySlotImmediately &&
    concurrencySettings?.strategy === 'queue' &&
    concurrencyGroupKey &&
    schedulingRequest;

  await workflowExecutionRepository.updateWorkflowExecution(
    {
      id: workflowExecution.id,
      ...(freesConcurrencySlotImmediately ? { status: ExecutionStatus.CANCELLED } : {}),
      cancelRequested: true,
      cancellationReason: 'Cancelled by user',
      cancelledAt: new Date().toISOString(),
      cancelledBy: 'system',
    },
    shouldRefreshBeforeQueueDrain ? { refresh: 'wait_for' } : {}
  );

  await workflowTaskManager.forceRunIdleTasks(workflowExecution.id, {
    spaceId: workflowExecution.spaceId,
    fakeRequest: schedulingRequest,
  });

  if (shouldRefreshBeforeQueueDrain && concurrencySettings && concurrencyGroupKey) {
    try {
      await drainConcurrencyQueueSlots({
        workflowExecutionRepository,
        taskManager,
        logger,
        spaceId: workflowExecution.spaceId,
        concurrencyGroupKey,
        concurrencySettings,
        request: schedulingRequest,
      });
    } catch (drainErr) {
      logger.debug(
        `Concurrency queue drain after cancel failed: ${
          drainErr instanceof Error ? drainErr.message : String(drainErr)
        }`
      );
    }
  }
};
