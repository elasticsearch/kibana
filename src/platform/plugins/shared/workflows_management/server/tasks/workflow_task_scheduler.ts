/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import {
  calculateNextRunAtFromSchedule,
  type TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { EsWorkflow } from '@kbn/workflows';
import { getReadableFrequency, getReadableInterval } from '../lib/rrule_logging_utils';
import type { WorkflowTrigger } from '../lib/schedule_utils';
import { convertWorkflowScheduleToTaskSchedule, getScheduledTriggers } from '../lib/schedule_utils';

const VERSION_CONFLICT_STATUS = 409;
const NOT_FOUND_STATUS = 404;

const getScheduledWorkflowTaskId = (workflowId: string) => `workflow:${workflowId}:scheduled`;

export interface WorkflowTaskSchedulerParams {
  workflowId: string;
  spaceId: string;
  schedule: { interval: string };
}

export class WorkflowTaskScheduler {
  constructor(
    private readonly logger: Logger,
    private readonly taskManager: TaskManagerStartContract
  ) {}

  /**
   * Schedules tasks for all scheduled triggers in a workflow.
   * Uses idempotent scheduling: if a task already exists, its schedule is updated in place.
   */
  async scheduleWorkflowTasks(
    workflow: EsWorkflow,
    spaceId: string,
    request: KibanaRequest
  ): Promise<string[]> {
    const scheduledTriggers = getScheduledTriggers(workflow.definition?.triggers ?? []);
    const scheduledTaskIds: string[] = [];

    for (const trigger of scheduledTriggers) {
      try {
        const taskId = await this.scheduleWorkflowTask(workflow.id, spaceId, trigger, request);
        scheduledTaskIds.push(taskId);
        this.logger.debug(
          `Scheduled workflow task for workflow ${workflow.id}, trigger ${trigger.type}, task ID: ${taskId}`
        );
      } catch (error) {
        this.logger.error(
          `Failed to schedule workflow task for workflow ${workflow.id}, trigger ${trigger.type}: ${error}`
        );
        throw error;
      }
    }

    return scheduledTaskIds;
  }

  /**
   * Schedules a single workflow task for a specific trigger.
   * Idempotent: if the task already exists (409 conflict), updates the schedule in place
   * via bulkUpdateSchedules instead of failing. If Task Manager skips the update, recreates
   * the deterministic task with the latest schedule and execution credentials.
   */
  async scheduleWorkflowTask(
    workflowId: string,
    spaceId: string,
    trigger: WorkflowTrigger,
    request: KibanaRequest
  ): Promise<string> {
    const schedule = convertWorkflowScheduleToTaskSchedule(trigger);
    const taskId = `workflow:${workflowId}:${trigger.type}`;

    // Log RRule-specific scheduling details
    if ('rrule' in schedule && schedule.rrule) {
      const freqText = getReadableFrequency(schedule.rrule.freq);
      const intervalText = getReadableInterval(schedule.rrule.freq, schedule.rrule.interval);

      this.logger.debug(
        `RRule schedule created for workflow ${workflowId}: ${freqText} every ${schedule.rrule.interval} ${intervalText}`
      );
    }

    const taskInstance = {
      id: taskId,
      taskType: 'workflow:scheduled',
      schedule,
      params: {
        workflowId,
        spaceId,
        triggerType: trigger.type,
      },
      state: {
        lastRunAt: null,
        lastRunStatus: null,
        lastRunError: null,
      },
      scope: ['workflows'],
      enabled: true,
    };

    try {
      // Use Task Manager's first-class API key support by passing the request.
      // Task Manager will automatically create and manage the API key for user context.
      const scheduledTask = await this.taskManager.schedule(taskInstance, { request });

      return scheduledTask.id;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === VERSION_CONFLICT_STATUS) {
        // Task already exists — update its schedule in place rather than failing.
        // This handles both interval and RRule schedule types.
        const result = await this.taskManager.bulkUpdateSchedules([taskId], schedule, {
          request,
          regenerateApiKey: true,
        });
        if (result.errors.length > 0) {
          const firstError = result.errors[0].error;
          // 409 (concurrent update) and 404 (task was just removed) are non-fatal
          if (
            firstError.statusCode !== VERSION_CONFLICT_STATUS &&
            firstError.statusCode !== NOT_FOUND_STATUS
          ) {
            throw new Error(
              `Failed to update schedule for workflow task "${taskId}": ${firstError.message}`
            );
          }
        }
        // Task Manager intentionally skips running tasks when updating schedules, and skipped tasks
        // are not returned in either `tasks` or `errors`. Recreate the deterministic workflow task
        // so it picks up the latest schedule interval and refreshed execution credentials.
        if (!result.tasks.some((task) => task.id === taskId)) {
          const existingTask = await this.taskManager.get(taskId).catch((error) => {
            if ((error as { statusCode?: number }).statusCode === NOT_FOUND_STATUS) {
              return undefined;
            }
            throw error;
          });
          const recreatedTaskInstance = existingTask
            ? {
                ...taskInstance,
                scheduledAt: existingTask.scheduledAt,
                runAt: new Date(
                  calculateNextRunAtFromSchedule({
                    schedule,
                    startDate: existingTask.scheduledAt,
                  })
                ),
              }
            : taskInstance;
          await this.taskManager.removeIfExists(taskId);
          const scheduledTask = await this.taskManager.schedule(recreatedTaskInstance, { request });
          this.logger.debug(
            `Recreated scheduled task for workflow ${workflowId} after in-place update was skipped`
          );
          return scheduledTask.id;
        }
        this.logger.debug(
          `Updated existing scheduled task for workflow ${workflowId} (schedule updated in place)`
        );
        return taskId;
      }
      throw err;
    }
  }

  /** Unschedules the scheduled workflow task by deterministic task id. */
  async unscheduleWorkflowTasks(workflowId: string): Promise<void> {
    const taskId = getScheduledWorkflowTaskId(workflowId);

    try {
      await this.taskManager.removeIfExists(taskId);
    } catch (error) {
      this.logger.error(`Failed to unschedule tasks for workflow ${workflowId}: ${error}`);
      throw error;
    }
  }

  /** Unschedules scheduled workflow tasks for multiple workflows via bulkRemove. */
  async bulkUnscheduleWorkflowTasks(workflowIds: string[]): Promise<void> {
    if (workflowIds.length === 0) {
      return;
    }

    const taskIdToWorkflowId = new Map(
      workflowIds.map((workflowId) => [getScheduledWorkflowTaskId(workflowId), workflowId] as const)
    );
    const taskIds = [...taskIdToWorkflowId.keys()];

    try {
      const bulkRemoveResult = await this.taskManager.bulkRemove(taskIds);
      const failedRemovals = bulkRemoveResult.statuses.filter(
        (status) => !status.success && status.error?.statusCode !== NOT_FOUND_STATUS
      );

      for (const status of failedRemovals) {
        const workflowId = taskIdToWorkflowId.get(status.id) ?? status.id;
        this.logger.warn(
          `Failed to unschedule tasks for deleted workflow ${workflowId}: ${
            status.error?.statusCode ?? 'unknown status'
          }: ${status.error?.message ?? 'unknown error'}`
        );
      }
    } catch (error) {
      this.logger.error(`Failed to bulk unschedule workflow tasks: ${error}`);
    }
  }

  /**
   * Updates scheduled tasks when a workflow is updated.
   * Uses idempotent scheduling (create-or-update) instead of a non-atomic delete-then-create
   * pattern. This prevents the task from being permanently lost if the create step fails
   * after the delete step succeeds.
   */
  async updateWorkflowTasks(
    workflow: EsWorkflow,
    spaceId: string,
    request: KibanaRequest
  ): Promise<void> {
    // Schedule tasks idempotently — creates new tasks or updates existing ones in place.
    // No need to unschedule first since scheduleWorkflowTask handles 409 conflicts gracefully.
    await this.scheduleWorkflowTasks(workflow, spaceId, request);
  }
}
