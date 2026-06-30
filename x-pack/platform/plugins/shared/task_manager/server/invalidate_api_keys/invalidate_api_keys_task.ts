/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { CoreStart } from '@kbn/core-lifecycle-server';
import type {
  InvalidateAPIKeyResult,
  InvalidateAPIKeysParams,
  InvalidateUiamAPIKeyParams,
} from '@kbn/security-plugin-types-server';
import type { KibanaRequest } from '@kbn/core/server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-shared';
import type { TaskScheduling } from '../task_scheduling';
import type { TaskTypeDictionary } from '../task_type_dictionary';
import { INVALIDATE_API_KEY_SO_NAME, TASK_SO_NAME } from '../saved_objects';
import type { TaskManagerStartContract } from '..';
import type { TaskManagerPluginsStart } from '../plugin';
import { runInvalidate } from './lib';

export const TASK_ID = 'invalidate_api_keys';
const TASK_TYPE = `task_manager:${TASK_ID}`;

export type ApiKeyInvalidationFn = (
  params: InvalidateAPIKeysParams
) => Promise<InvalidateAPIKeyResult | null> | undefined;

export type UiamApiKeyInvalidationFn = (
  request: KibanaRequest,
  params: InvalidateUiamAPIKeyParams
) => Promise<InvalidateAPIKeyResult | null>;

export async function scheduleInvalidateApiKeyTask(
  logger: Logger,
  taskScheduling: TaskScheduling,
  interval: string
) {
  try {
    await taskScheduling.ensureScheduled({
      id: TASK_ID,
      taskType: TASK_TYPE,
      schedule: { interval },
      state: {},
      params: {},
    });
  } catch (e) {
    logger.error(`Error scheduling ${TASK_ID} task, received ${e.message}`);
  }
}

interface RegisterInvalidateApiKeyTaskOpts {
  configInterval: string;
  coreStartServices: () => Promise<[CoreStart, TaskManagerPluginsStart, TaskManagerStartContract]>;
  getEncryptedSavedObjectsClient: () => EncryptedSavedObjectsClient | undefined;
  invalidateApiKeyFn?: ApiKeyInvalidationFn;
  invalidateUiamApiKeyFn?: () => UiamApiKeyInvalidationFn | undefined;
  logger: Logger;
  removalDelay: string;
  taskTypeDictionary: TaskTypeDictionary;
}

export function registerInvalidateApiKeyTask(opts: RegisterInvalidateApiKeyTaskOpts) {
  const {
    logger,
    configInterval,
    coreStartServices,
    getEncryptedSavedObjectsClient,
    invalidateApiKeyFn,
    invalidateUiamApiKeyFn,
    removalDelay,
    taskTypeDictionary,
  } = opts;
  taskTypeDictionary.registerTaskDefinitions({
    [TASK_TYPE]: {
      title: 'Invalidate task manager API keys',
      createTaskRunner: taskRunner({
        logger,
        configInterval,
        coreStartServices,
        getEncryptedSavedObjectsClient,
        invalidateApiKeyFn,
        invalidateUiamApiKeyFn,
        removalDelay,
      }),
    },
  });
}

type InvalidateApiKeysTaskRunnerOpts = Pick<
  RegisterInvalidateApiKeyTaskOpts,
  | 'logger'
  | 'configInterval'
  | 'coreStartServices'
  | 'getEncryptedSavedObjectsClient'
  | 'invalidateApiKeyFn'
  | 'invalidateUiamApiKeyFn'
  | 'removalDelay'
>;

interface InvalidateApiKeysTaskState {
  missing_api_key_retries?: Record<string, number>;
}

export function taskRunner(opts: InvalidateApiKeysTaskRunnerOpts) {
  const {
    logger,
    configInterval,
    coreStartServices,
    getEncryptedSavedObjectsClient,
    invalidateApiKeyFn,
    invalidateUiamApiKeyFn,
    removalDelay,
  } = opts;
  return ({ taskInstance }: { taskInstance: { state: InvalidateApiKeysTaskState } }) => {
    return {
      async run() {
        let missingApiKeyRetries = { ...(taskInstance.state.missing_api_key_retries ?? {}) };
        try {
          const [{ savedObjects }] = await coreStartServices();
          const savedObjectsClient = savedObjects.createInternalRepository([
            INVALIDATE_API_KEY_SO_NAME,
            TASK_SO_NAME,
          ]);

          const result = await runInvalidate({
            encryptedSavedObjectsClient: getEncryptedSavedObjectsClient(),
            invalidateApiKeyFn,
            invalidateUiamApiKeyFn: invalidateUiamApiKeyFn?.(),
            logger,
            missingApiKeyRetries,
            removalDelay,
            savedObjectsClient,
            savedObjectType: INVALIDATE_API_KEY_SO_NAME,
            savedObjectTypesToQuery: [
              {
                type: TASK_SO_NAME,
                apiKeyAttributePath: `${TASK_SO_NAME}.attributes.userScope.apiKeyId`,
              },
            ],
          });
          missingApiKeyRetries = result.missingApiKeyRetries;

          logger.debug(`Invalidated a total of ${result.totalInvalidated} API keys.`);

          return {
            state: { missing_api_key_retries: missingApiKeyRetries },
            schedule: { interval: configInterval },
          };
        } catch (e) {
          logger.error(`Error invalidating task manager API keys - ${e.message}`, {
            error: { stack_trace: e.stack },
          });
          return {
            state: { missing_api_key_retries: missingApiKeyRetries },
            schedule: { interval: configInterval },
          };
        }
      },
    };
  };
}
