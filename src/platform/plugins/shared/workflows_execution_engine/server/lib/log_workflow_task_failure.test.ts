/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { logWorkflowTaskFailure } from './log_workflow_task_failure';

describe('logWorkflowTaskFailure', () => {
  it('logs task failures with structured context', () => {
    const logger = loggingSystemMock.createLogger();
    const error = new Error('task execution failed');

    logWorkflowTaskFailure(logger, error, {
      taskType: 'workflow:run',
      workflowRunId: 'run-1',
      spaceId: 'default',
      taskId: 'task-1',
      attempt: 2,
    });

    expect(logger.error).toHaveBeenCalledWith('Workflow task failed', {
      taskType: 'workflow:run',
      workflowId: undefined,
      workflowRunId: 'run-1',
      spaceId: 'default',
      taskId: 'task-1',
      attempt: 2,
      errorMessage: 'task execution failed',
      errorName: 'Error',
      error,
    });
  });

  it('tags version conflict failures for Task Manager spike triage', () => {
    const logger = loggingSystemMock.createLogger();
    const error = new Error(
      '[version_conflict_engine_exception]: version conflict, required seqNo [1], primary term [1]'
    );

    logWorkflowTaskFailure(logger, error, {
      taskType: 'workflow:scheduled',
      workflowId: 'wf-1',
      spaceId: 'default',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Workflow task failed',
      expect.objectContaining({
        failureKind: 'task_manager_version_conflict',
        taskType: 'workflow:scheduled',
        workflowId: 'wf-1',
      })
    );
  });
});
