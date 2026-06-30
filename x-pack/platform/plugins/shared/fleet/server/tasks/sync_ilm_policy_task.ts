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
import { v4 as uuidv4 } from 'uuid';

import { appContextService } from '../services';
import { syncIlmPolicy } from '../services/epm/packages';

const TASK_TYPE = 'fleet:sync_ilm_policy';

export interface SyncIlmPolicyTaskParams {
  spaceId: string;
  packageName: string;
  namespace: string;
  ilmPolicy: string | undefined;
}

export function registerSyncIlmPolicyTask(taskManagerSetup: TaskManagerSetupContract) {
  taskManagerSetup.registerTaskDefinitions({
    [TASK_TYPE]: {
      title: 'Fleet Sync ILM policy namespace component templates',
      timeout: '15m',
      maxAttempts: 3,
      createTaskRunner: ({ taskInstance, abortController }) => {
        const { spaceId, packageName, namespace, ilmPolicy } =
          taskInstance.params as SyncIlmPolicyTaskParams;
        return {
          async run() {
            const logger = appContextService.getLogger();
            logger.debug(
              `[syncIlmPolicyTask] Running for package ${packageName}, namespace ${namespace} in space ${spaceId}: ilmPolicy=${
                ilmPolicy ?? '(clear)'
              }`
            );

            const soClient = appContextService.getInternalUserSOClientForSpaceId(spaceId);
            const esClient = appContextService.getInternalUserESClient();

            try {
              await syncIlmPolicy({
                soClient,
                esClient,
                packageName,
                namespace,
                ilmPolicy,
                abortController,
              });
            } catch (err) {
              logger.error(
                `[syncIlmPolicyTask] Failed for package ${packageName}, namespace ${namespace} in space ${spaceId}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
                { error: err }
              );
              throw err;
            }
          },
        };
      },
    },
  });
}

export async function scheduleSyncIlmPolicyTask(
  taskManagerStart: TaskManagerStartContract,
  params: SyncIlmPolicyTaskParams
) {
  await taskManagerStart.ensureScheduled({
    id: `${TASK_TYPE}:${uuidv4()}`,
    scope: ['fleet'],
    params,
    taskType: TASK_TYPE,
    runAt: new Date(Date.now() + 3 * 1000),
    state: {},
  });
}
