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
import type { ConcurrencySettings, EsWorkflowExecution } from '@kbn/workflows';
import {
  ConcurrencySlotOccupyingExecutionStatuses,
  ExecutionStatus,
  isTerminalStatus,
} from '@kbn/workflows';

import type { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';
import { generateExecutionTaskScope } from '../utils/generate_execution_task_scope';
import { WORKFLOW_RUN_TASK_TYPE } from '../workflow_task_manager/types';
import type { StartWorkflowExecutionParams } from '../workflow_task_manager/types';

/**
 * Moves oldest `queued` executions to `pending` and schedules `workflow:run` tasks while
 * slot occupancy is below `concurrency.max`.
 */
export async function drainConcurrencyQueueSlots(params: {
  workflowExecutionRepository: WorkflowExecutionRepository;
  taskManager: TaskManagerStartContract;
  logger: Logger;
  spaceId: string;
  concurrencyGroupKey: string;
  concurrencySettings: ConcurrencySettings;
  request: KibanaRequest;
}): Promise<void> {
  const {
    workflowExecutionRepository,
    taskManager,
    logger,
    spaceId,
    concurrencyGroupKey,
    concurrencySettings,
    request,
  } = params;

  if (concurrencySettings.strategy !== 'queue') {
    return;
  }

  const maxConcurrency = concurrencySettings.max ?? 1;

  for (;;) {
    const slotCount =
      await workflowExecutionRepository.countExecutionsByConcurrencyGroupAndStatuses(
        concurrencyGroupKey,
        spaceId,
        ConcurrencySlotOccupyingExecutionStatuses
      );

    if (slotCount >= maxConcurrency) {
      return;
    }

    const nextQueuedId =
      await workflowExecutionRepository.getOldestQueuedExecutionIdByConcurrencyGroup(
        concurrencyGroupKey,
        spaceId
      );

    if (!nextQueuedId) {
      return;
    }

    const promoted =
      await workflowExecutionRepository.tryCasPromoteQueuedWorkflowExecutionToPending({
        workflowExecutionId: nextQueuedId,
        spaceId,
      });

    if (promoted) {
      const execution = await workflowExecutionRepository.getWorkflowExecutionById(
        nextQueuedId,
        spaceId
      );

      if (execution?.status === ExecutionStatus.PENDING) {
        if (!execution.id || !execution.spaceId) {
          logger.warn(
            `Promoted queued execution ${nextQueuedId} is missing id or spaceId; marking skipped`
          );
          const skipTimestamp = new Date().toISOString();
          await workflowExecutionRepository.updateWorkflowExecution(
            {
              id: nextQueuedId,
              status: ExecutionStatus.SKIPPED,
              cancelRequested: true,
              cancellationReason:
                'Queued promotion failed: execution document missing id or spaceId',
              cancelledAt: skipTimestamp,
              cancelledBy: 'system',
            },
            { refresh: 'wait_for' }
          );
        } else {
          const triggeredBy = execution.triggeredBy || 'manual';

          try {
            await taskManager.schedule(
              {
                id: `workflow:${execution.id}:${triggeredBy}`,
                taskType: WORKFLOW_RUN_TASK_TYPE,
                params: {
                  workflowRunId: execution.id,
                  spaceId: execution.spaceId,
                } satisfies StartWorkflowExecutionParams,
                state: {
                  lastRunAt: null,
                  lastRunStatus: null,
                  lastRunError: null,
                },
                scope: generateExecutionTaskScope(execution as EsWorkflowExecution),
                enabled: true,
              },
              { request }
            );
            logger.debug(
              `Promoted queued execution ${execution.id} to pending and scheduled workflow:run (group ${concurrencyGroupKey})`
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(
              `Promoted queued workflow execution ${nextQueuedId} but failed to schedule workflow:run (${message}); reverting to queued`
            );
            await workflowExecutionRepository.updateWorkflowExecution(
              { id: nextQueuedId, status: ExecutionStatus.QUEUED },
              { refresh: 'wait_for' }
            );
            return;
          }
        }
      }
    }
  }
}

export async function maybeDrainConcurrencyQueueAfterTerminal(params: {
  workflowExecutionRepository: WorkflowExecutionRepository;
  taskManager: TaskManagerStartContract;
  logger: Logger;
  workflowRunId: string;
  spaceId: string;
  fakeRequest: KibanaRequest;
}): Promise<void> {
  const { workflowExecutionRepository, taskManager, logger, workflowRunId, spaceId, fakeRequest } =
    params;

  try {
    const doc = await workflowExecutionRepository.getWorkflowExecutionById(workflowRunId, spaceId);
    if (!doc || !isTerminalStatus(doc.status)) {
      return;
    }
    const concurrency = doc.workflowDefinition?.settings?.concurrency;
    const groupKey = doc.concurrencyGroupKey;
    if (concurrency?.strategy !== 'queue' || !groupKey) {
      return;
    }

    await drainConcurrencyQueueSlots({
      workflowExecutionRepository,
      taskManager,
      logger,
      spaceId,
      concurrencyGroupKey: groupKey,
      concurrencySettings: concurrency,
      request: fakeRequest,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.debug(
      `maybeDrainConcurrencyQueueAfterTerminal: drain failed for execution ${workflowRunId}: ${msg}`
    );
  }
}
