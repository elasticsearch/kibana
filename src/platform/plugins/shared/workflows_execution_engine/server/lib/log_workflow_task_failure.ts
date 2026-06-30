/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';

export interface WorkflowTaskFailureLogContext {
  taskType: 'workflow:run' | 'workflow:resume' | 'workflow:scheduled';
  workflowId?: string;
  workflowRunId?: string;
  spaceId?: string;
  taskId?: string;
  attempt?: number;
}

const LOG_MESSAGE = 'Workflow task failed';
const VERSION_CONFLICT_MARKER = 'version_conflict_engine_exception';

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function logWorkflowTaskFailure(
  logger: Logger,
  error: unknown,
  context: WorkflowTaskFailureLogContext
): void {
  const normalizedError = toError(error);
  const meta: Record<string, unknown> = {
    taskType: context.taskType,
    workflowId: context.workflowId,
    workflowRunId: context.workflowRunId,
    spaceId: context.spaceId,
    taskId: context.taskId,
    attempt: context.attempt,
    errorMessage: normalizedError.message,
    errorName: normalizedError.name,
    error: normalizedError,
  };

  if (normalizedError.message.includes(VERSION_CONFLICT_MARKER)) {
    meta.failureKind = 'task_manager_version_conflict';
  }

  logger.error(LOG_MESSAGE, meta);
}
