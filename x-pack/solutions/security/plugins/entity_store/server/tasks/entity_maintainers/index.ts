/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';
import type { Logger } from '@kbn/logging';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { CoreStart, KibanaRequest } from '@kbn/core/server';
import type { LicenseType } from '@kbn/licensing-types';
import {
  EntityMaintainerTaskStatus,
  EntityMaintainerTelemetryEventType,
  type RegisterEntityMaintainerConfig,
} from './types';
import { TasksConfig } from '../config';
import { EntityStoreTaskType } from '../constants';
import type {
  EntityStoreCoreSetup,
  EntityStoreStartContract,
  EntityStoreStartPlugins,
} from '../../types';
import { entityMaintainersRegistry } from './entity_maintainers_registry';
import type { TelemetryReporter } from '../../telemetry/events';
import { ENTITY_MAINTAINER_EVENT } from '../../telemetry/events';
import { executeMaintainerRun } from './execution';

/** Used when `RegisterEntityMaintainerConfig.minLicense` is omitted (minimum Kibana tier). */
export const DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE: LicenseType = 'basic';
/** Preserves current task manager default behavior when per-maintainer timeout is omitted. */
export const DEFAULT_ENTITY_MAINTAINER_TIMEOUT = '5m';

export function getTaskType(id: string): string {
  return `${TasksConfig[EntityStoreTaskType.enum.entityMaintainer].type}:${id}`;
}

export function getTaskId(id: string, namespace: string): string {
  return `${id}:${namespace}`;
}

export async function scheduleEntityMaintainerTask({
  logger,
  taskManager,
  id,
  interval,
  namespace,
  request,
  enabled,
}: {
  logger: Logger;
  taskManager: TaskManagerStartContract;
  id: string;
  interval: string;
  namespace: string;
  request: KibanaRequest;
  enabled?: boolean;
}): Promise<void> {
  logger.debug(`Scheduling entity maintainer task: ${id}`);
  await taskManager.ensureScheduled(
    {
      id: getTaskId(id, namespace),
      taskType: getTaskType(id),
      schedule: { interval },
      state: { namespace, taskStatus: EntityMaintainerTaskStatus.STARTED },
      params: {},
      enabled: enabled ?? true,
    },
    { request }
  );
}

export function registerEntityMaintainerTask({
  taskManager,
  logger,
  config,
  core,
  analytics,
}: {
  taskManager: TaskManagerSetupContract;
  logger: Logger;
  config: RegisterEntityMaintainerConfig;
  core: EntityStoreCoreSetup;
  analytics: TelemetryReporter;
}): void {
  logger.debug(`Registering entity maintainer task: ${config.id}`);
  const { title } = TasksConfig[EntityStoreTaskType.enum.entityMaintainer];
  const { run, interval, timeout, initialState, description, id, setup, minLicense } = config;
  const effectiveMinLicense = minLicense ?? DEFAULT_ENTITY_MAINTAINER_MIN_LICENSE;
  const effectiveTimeout = timeout ?? DEFAULT_ENTITY_MAINTAINER_TIMEOUT;
  const type = getTaskType(id);

  void core
    .getStartServices()
    .then(
      ([coreStart, plugins]: [CoreStart, EntityStoreStartPlugins, EntityStoreStartContract]) => {
        entityMaintainersRegistry.register({
          id,
          interval,
          description,
          minLicense: effectiveMinLicense,
          run,
          setup,
          initialState,
        });

        taskManager.registerTaskDefinitions({
          [type]: {
            title,
            description,
            timeout: effectiveTimeout,
            createTaskRunner: ({ taskInstance, abortController, fakeRequest }) => ({
              run: async () => {
                const status = taskInstance.state;

                if (!fakeRequest) {
                  logger.error(`No fake request found, skipping run`);
                  return { state: status };
                }

                const result = await executeMaintainerRun({
                  status,
                  request: fakeRequest,
                  taskId: taskInstance.id,
                  taskAbortController: abortController,
                  id,
                  run,
                  setup,
                  initialState,
                  effectiveMinLicense,
                  type,
                  coreStart,
                  licensing: plugins.licensing,
                  workflowsExtensions: plugins.workflowsExtensions,
                  analytics,
                  logger,
                });

                return result ?? { state: status };
              },
            }),
          },
        });
      }
    )
    .catch((err) => {
      logger.error(`Failed to register entity maintainer task: ${err?.message}`);
    });
  analytics.reportEvent(ENTITY_MAINTAINER_EVENT, {
    id,
    type: EntityMaintainerTelemetryEventType.REGISTER,
  });
}

async function updateTaskStatus({
  taskManager,
  taskId,
  taskStatus,
  request,
}: {
  taskManager: TaskManagerStartContract;
  taskId: string;
  taskStatus: EntityMaintainerTaskStatus;
  request: KibanaRequest;
}): Promise<void> {
  await taskManager.bulkUpdateState([taskId], (state) => ({ ...state, taskStatus }), { request });
}

export async function stopEntityMaintainer({
  taskManager,
  id,
  namespace,
  logger,
  request,
  analytics,
}: {
  taskManager: TaskManagerStartContract;
  id: string;
  namespace: string;
  logger: Logger;
  request: KibanaRequest;
  analytics: TelemetryReporter;
}): Promise<void> {
  const taskId = getTaskId(id, namespace);
  await updateTaskStatus({
    taskManager,
    taskId,
    taskStatus: EntityMaintainerTaskStatus.STOPPED,
    request,
  });
  analytics.reportEvent(ENTITY_MAINTAINER_EVENT, {
    id,
    namespace,
    type: EntityMaintainerTelemetryEventType.STOP,
  });
  logger.debug(`Stopped entity maintainer task: ${taskId}`);
}

export async function startEntityMaintainer({
  taskManager,
  id,
  namespace,
  logger,
  request,
  analytics,
}: {
  taskManager: TaskManagerStartContract;
  id: string;
  namespace: string;
  logger: Logger;
  request: KibanaRequest;
  analytics: TelemetryReporter;
}): Promise<void> {
  const taskId = getTaskId(id, namespace);
  await updateTaskStatus({
    taskManager,
    taskId,
    taskStatus: EntityMaintainerTaskStatus.STARTED,
    request,
  });
  const runSoon = false;
  await taskManager.bulkEnable([taskId], runSoon, { request });
  analytics.reportEvent(ENTITY_MAINTAINER_EVENT, {
    id,
    namespace,
    type: EntityMaintainerTelemetryEventType.START,
  });
  logger.debug(`Start entity maintainer task: ${taskId}`);
}

export async function removeEntityMaintainer({
  taskManager,
  id,
  namespace,
  logger,
  analytics,
}: {
  taskManager: TaskManagerStartContract;
  id: string;
  namespace: string;
  logger: Logger;
  analytics: TelemetryReporter;
}): Promise<void> {
  const taskId = getTaskId(id, namespace);
  await taskManager.removeIfExists(taskId);
  analytics.reportEvent(ENTITY_MAINTAINER_EVENT, {
    id,
    namespace,
    type: EntityMaintainerTelemetryEventType.DELETE,
  });
  logger.debug(`Removed entity maintainer task: ${taskId}`);
}
