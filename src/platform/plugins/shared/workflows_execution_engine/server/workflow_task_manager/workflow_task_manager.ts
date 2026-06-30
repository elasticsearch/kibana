/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { v4 } from 'uuid';
import { type KibanaRequest, SavedObjectsErrorHelpers } from '@kbn/core/server';
import { type TaskManagerStartContract, TaskStatus } from '@kbn/task-manager-plugin/server';
import type { EsWorkflowExecution } from '@kbn/workflows';
import { WORKFLOW_RESUME_TASK_TYPE } from './types';
import type { ResumeWorkflowExecutionParams } from './types';
import { generateExecutionTaskScope } from '../utils';

/** Stable task id so idle-timeout (workflow + enclosing step) resumes dedupe per execution. */
export const getWorkflowGlobalTimeoutResumeTaskId = (workflowExecutionId: string): string =>
  `workflow-global-timeout-${workflowExecutionId}`;

export class WorkflowTaskManager {
  constructor(private taskManager: TaskManagerStartContract) {}

  /**
   * Schedules or updates a single `workflow:resume` at the earliest idle deadline (HITL /
   * sync child). Skips TM writes when runAt and params already match.
   *
   * Uses `taskManager.get` once per schedule attempt to dedupe: callers invoke this when
   * entering `handleExecutionDelay` after a step completes (once per `runNode` pass while the
   * workflow is waiting), not in an inner hot loop over unchanged state.
   */
  async scheduleWorkflowGlobalTimeoutResumeTask({
    workflowExecution,
    resumeAt,
    fakeRequest,
  }: {
    workflowExecution: EsWorkflowExecution;
    resumeAt: Date;
    fakeRequest: KibanaRequest;
  }): Promise<{ taskId: string }> {
    const taskId = getWorkflowGlobalTimeoutResumeTaskId(workflowExecution.id);
    const desiredRunAtMs = resumeAt.getTime();

    try {
      const existing = await this.taskManager.get(taskId);
      if (existing.runAt != null) {
        const existingRunAtMs = new Date(existing.runAt).getTime();
        const params = existing.params as ResumeWorkflowExecutionParams | undefined;
        if (
          existing.taskType === WORKFLOW_RESUME_TASK_TYPE &&
          existingRunAtMs === desiredRunAtMs &&
          params?.workflowRunId === workflowExecution.id &&
          params?.spaceId === workflowExecution.spaceId
        ) {
          return { taskId: existing.id };
        }
      }
    } catch (err) {
      if (!SavedObjectsErrorHelpers.isNotFoundError(err)) {
        throw err;
      }
    }

    await this.taskManager.removeIfExists(taskId);

    const task = await this.taskManager.schedule(
      {
        id: taskId,
        taskType: WORKFLOW_RESUME_TASK_TYPE,
        params: {
          workflowRunId: workflowExecution.id,
          spaceId: workflowExecution.spaceId,
        } satisfies ResumeWorkflowExecutionParams,
        state: {},
        runAt: resumeAt,
        scope: generateExecutionTaskScope(workflowExecution as EsWorkflowExecution),
      },
      { request: fakeRequest }
    );

    return {
      taskId: task.id,
    };
  }

  async scheduleResumeTask({
    workflowExecution,
    resumeAt,
    fakeRequest,
  }: {
    workflowExecution: EsWorkflowExecution;
    resumeAt: Date;
    fakeRequest: KibanaRequest;
  }): Promise<{ taskId: string }> {
    const task = await this.taskManager.schedule(
      {
        id: v4(),
        taskType: WORKFLOW_RESUME_TASK_TYPE,
        params: {
          workflowRunId: workflowExecution.id,
          spaceId: workflowExecution.spaceId,
        } satisfies ResumeWorkflowExecutionParams,
        state: {},
        runAt: resumeAt,
        scope: generateExecutionTaskScope(workflowExecution as EsWorkflowExecution),
      },
      { request: fakeRequest }
    );

    return {
      taskId: task.id,
    };
  }

  async scheduleImmediateResume({
    executionId,
    spaceId,
    fakeRequest,
  }: {
    executionId: string;
    spaceId: string;
    fakeRequest?: KibanaRequest;
  }): Promise<{ taskId: string }> {
    const task = await this.taskManager.schedule(
      {
        id: v4(),
        taskType: WORKFLOW_RESUME_TASK_TYPE,
        params: {
          workflowRunId: executionId,
          spaceId,
        } satisfies ResumeWorkflowExecutionParams,
        state: {},
        scope: [`workflow:execution:${executionId}`],
      },
      fakeRequest ? { request: fakeRequest } : undefined
    );

    return {
      taskId: task.id,
    };
  }

  async forceRunIdleTasks(
    workflowExecutionId: string,
    options?: { spaceId: string; fakeRequest: KibanaRequest }
  ): Promise<void> {
    const scopeTerm = {
      term: {
        'task.scope': `workflow:execution:${workflowExecutionId}`,
      },
    };

    const { docs: idleTasks } = await this.taskManager.fetch({
      query: {
        bool: {
          must: [
            {
              term: {
                'task.status': TaskStatus.Idle,
              },
            },
            scopeTerm,
          ],
        },
      },
    });

    const idleTasksToRun = idleTasks.filter(
      (idleTask) => idleTask.id !== getWorkflowGlobalTimeoutResumeTaskId(workflowExecutionId)
    );

    if (idleTasksToRun.length) {
      // TODO: To use bulkRunSoon once available
      await Promise.all(idleTasksToRun.map((idleTask) => this.taskManager.runSoon(idleTask.id)));
      return;
    }

    const { docs: activeTasks } = await this.taskManager.fetch({
      query: {
        bool: {
          must: [
            scopeTerm,
            {
              terms: {
                'task.status': [TaskStatus.Running, TaskStatus.Claiming],
              },
            },
          ],
        },
      },
    });

    if (activeTasks.length) {
      return;
    }

    if (options?.spaceId) {
      const { taskId } = await this.scheduleImmediateResume({
        executionId: workflowExecutionId,
        spaceId: options.spaceId,
        fakeRequest: options.fakeRequest,
      });
      await this.taskManager.runSoon(taskId);
    }
  }
}
