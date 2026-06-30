/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { RunContext, RunResult } from '@kbn/task-manager-plugin/server/task';
import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core/server';
import moment from 'moment';
import { TasksConfig } from './config';
import { EntityStoreTaskType } from './constants';
import type * as types from '../types';
import type { EntityType } from '../../common/domain/definitions/entity_schema';
import { createLogsExtractionClient } from './factories';
import { wrapTaskRun } from '../telemetry/traces';
import { entityStoreMetrics } from '../monitor/metrics';

function getTaskType(entityType: EntityType): string {
  const config = TasksConfig[EntityStoreTaskType.enum.extractEntity];
  return `${config.type}:${entityType}`;
}

export function getExtractEntityTaskId(entityType: EntityType, namespace: string): string {
  return `${getTaskType(entityType)}:${namespace}`;
}

async function runTask({
  taskInstance,
  fakeRequest,
  abortController,
  entityType,
  logger,
  core,
  isServerless,
}: RunContext & {
  entityType: EntityType;
  logger: Logger;
  core: types.EntityStoreCoreSetup;
  isServerless: boolean;
}): Promise<RunResult> {
  logger.info(`Running extract entity task`);

  const currentState = taskInstance.state;
  const runs = currentState.runs || 0;
  const namespace = currentState.namespace;

  if (!fakeRequest) {
    logger.error(`No fake request found, skipping extract entity task`);
    return {
      state: {
        ...currentState,
      },
    };
  }

  let remote = false;

  try {
    const { logsExtractionClient } = await createLogsExtractionClient({
      core,
      fakeRequest,
      logger,
      namespace,
      isServerless,
    });

    const extractionStart = Date.now();
    const extractionResult = await logsExtractionClient.extractLogs(entityType, {
      abortController,
    });
    const extractionDuration = moment().diff(extractionStart, 'milliseconds');

    remote = extractionResult.isRemote;
    if (!extractionResult.success) {
      logger.error(
        `Logs extraction failed for ${entityType}: ${extractionResult.error.message}, took ${extractionDuration}ms`
      );
      entityStoreMetrics.extractionTaskError.add(1, {
        entity_type: entityType,
        namespace,
        error_type: extractionResult.error.name ?? 'UnknownError',
        remote,
      });
    } else {
      logger.info(
        `Successfully extracted ${extractionResult.count} entities for ${entityType}, took ${extractionDuration}ms  `
      );
      entityStoreMetrics.extractionTaskSuccess.add(1, {
        entity_type: entityType,
        namespace,
        remote,
      });
    }

    const updatedState = {
      namespace,
      lastExecutionTimestamp: new Date().toISOString(),
      runs: runs + 1,
      entityType,
      lastExtractionSuccess: extractionResult.success,
      status: 'success',
    };

    return {
      state: updatedState,
    };
  } catch (e) {
    logger.error(`Error running extract entity task, received ${e.message}`);

    entityStoreMetrics.extractionTaskError.add(1, {
      entity_type: entityType,
      namespace,
      error_type: e.name ?? 'UnknownError',
      remote,
    });

    return {
      state: {
        ...currentState,
        lastError: e.message,
        lastErrorTimestamp: new Date().toISOString(),
        status: 'error',
        entityType,
      },
    };
  }
}

export function registerExtractEntityTasks({
  taskManager,
  logger,
  entityTypes,
  core,
  isServerless,
}: {
  core: types.EntityStoreCoreSetup;
  taskManager: TaskManagerSetupContract;
  logger: Logger;
  entityTypes: EntityType[];
  isServerless: boolean;
}): void {
  try {
    const config = TasksConfig[EntityStoreTaskType.enum.extractEntity];
    entityTypes.forEach((type) => {
      const taskType = getTaskType(type);
      taskManager.registerTaskDefinitions({
        [taskType]: {
          title: config.title,
          timeout: config.timeout,
          createTaskRunner: ({ taskInstance, abortController, fakeRequest, executionUuid }) => ({
            run: () =>
              wrapTaskRun({
                spanName: 'entityStore.task.extract_entity.run',
                namespace: taskInstance.state.namespace,
                attributes: {
                  'entity_store.task.id': taskInstance.id,
                  'entity_store.task.type': taskType,
                  'entity_store.entity.type': type,
                },
                run: () =>
                  runTask({
                    taskInstance,
                    abortController,
                    executionUuid,
                    logger: logger.get(taskInstance.id),
                    core,
                    entityType: type,
                    fakeRequest,
                    isServerless,
                  }),
              }),
          }),
        },
      });
    });
  } catch (e) {
    logger.error(`Error registering extract entity tasks, received ${e.message}`);
    throw e;
  }
}

export async function scheduleExtractEntityTask({
  logger,
  taskManager,
  type,
  namespace,
  frequency,
  request,
}: {
  logger: Logger;
  taskManager: TaskManagerStartContract;
  type: EntityType;
  frequency: string;
  namespace: string;
  request: KibanaRequest;
}): Promise<void> {
  try {
    const taskType = getTaskType(type);
    const taskId = getExtractEntityTaskId(type, namespace);
    const interval = frequency ?? TasksConfig[EntityStoreTaskType.enum.extractEntity].interval;
    await taskManager.ensureScheduled(
      {
        id: taskId,
        taskType,
        schedule: { interval },
        state: { namespace },
        params: {},
      },
      { request }
    );
  } catch (e) {
    logger.error(`Error scheduling extract entity tasks, received ${e.message}`);
    throw e;
  }
}

export async function stopExtractEntityTask({
  taskManager,
  logger,
  type,
  namespace,
}: {
  taskManager: TaskManagerStartContract;
  logger: Logger;
  type: EntityType;
  namespace: string;
}): Promise<void> {
  const taskId = getExtractEntityTaskId(type, namespace);
  await taskManager.removeIfExists(taskId);
  logger.debug(`removed extract entity task: ${taskId}`);
}
