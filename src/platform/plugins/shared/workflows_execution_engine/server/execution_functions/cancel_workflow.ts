/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core/server';
import { ExecutionStatus, isTerminalStatus } from '@kbn/workflows';
import { WorkflowExecutionNotFoundError } from '@kbn/workflows/common/errors';
import type { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';
import type { WorkflowTaskManager } from '../workflow_task_manager/workflow_task_manager';

/**
 * Persists `cancelRequested: true` and asks Task Manager to make the cancellation
 * take effect as soon as possible. `PENDING` is moved straight to `CANCELLED`
 * because no execution loop will ever observe the flag for it.
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
}: {
  workflowExecutionId: string;
  spaceId: string;
  schedulingRequest: KibanaRequest;
  workflowExecutionRepository: WorkflowExecutionRepository;
  workflowTaskManager: WorkflowTaskManager;
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

  await workflowExecutionRepository.updateWorkflowExecution({
    id: workflowExecution.id,
    ...(workflowExecution.status === ExecutionStatus.PENDING
      ? { status: ExecutionStatus.CANCELLED }
      : {}),
    cancelRequested: true,
    cancellationReason: 'Cancelled by user',
    cancelledAt: new Date().toISOString(),
    cancelledBy: 'system',
  });

  await workflowTaskManager.forceRunIdleTasks(workflowExecution.id, {
    spaceId: workflowExecution.spaceId,
    fakeRequest: schedulingRequest,
  });
};
