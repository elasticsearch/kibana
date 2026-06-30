/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { pick } from 'lodash';
import type { RunContext } from '@kbn/task-manager-plugin/server';
import { asSpaceId } from '@kbn/core-spaces-common';
import {
  createTaskRunError,
  TaskErrorSource,
  throwRetryableError,
  throwUnrecoverableError,
} from '@kbn/task-manager-plugin/server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import { createRetryableError, getErrorSource } from '@kbn/task-manager-plugin/server/task_running';
import { type Headers, type FakeRawRequest } from '@kbn/core-http-server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import type { Logger } from '@kbn/logging';
import type {
  ISavedObjectsRepository,
  SavedObject,
  SavedObjectReference,
} from '@kbn/core-saved-objects-api-server';
import { SavedObjectsErrorHelpers } from '@kbn/core-saved-objects-server';
import type { ActionExecutorContract } from './action_executor';
import type {
  ActionTaskExecutorParams,
  ActionTaskParams,
  ActionTypeExecutorResult,
  ActionTypeRegistryContract,
  SpaceIdToNamespaceFunction,
} from '../types';
import { ACTION_TASK_PARAMS_SAVED_OBJECT_TYPE } from '../constants/saved_objects';
import type { ActionExecutionSourceType } from './action_execution_source';
import { asEmptySource, asSavedObjectExecutionSource } from './action_execution_source';
import type { RelatedSavedObjects } from './related_saved_objects';
import { validatedRelatedSavedObjects } from './related_saved_objects';
import { injectSavedObjectReferences } from './action_task_params_utils';
import type { InMemoryMetrics } from '../monitoring';
import { IN_MEMORY_METRICS } from '../monitoring';
import { ActionTypeDisabledError } from './errors';

export interface TaskRunnerContext {
  logger: Logger;
  actionTypeRegistry: ActionTypeRegistryContract;
  encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
  spaceIdToNamespace: SpaceIdToNamespaceFunction;
  savedObjectsRepository: ISavedObjectsRepository;
}

type TaskParams = Omit<SavedObject<ActionTaskParams>, 'id' | 'type'>;

export class TaskRunnerFactory {
  private isInitialized = false;
  private taskRunnerContext?: TaskRunnerContext;
  private readonly actionExecutor: ActionExecutorContract;
  private readonly inMemoryMetrics: InMemoryMetrics;

  constructor(actionExecutor: ActionExecutorContract, inMemoryMetrics: InMemoryMetrics) {
    this.actionExecutor = actionExecutor;
    this.inMemoryMetrics = inMemoryMetrics;
  }

  public initialize(taskRunnerContext: TaskRunnerContext) {
    if (this.isInitialized) {
      throw new Error('TaskRunnerFactory already initialized');
    }
    this.isInitialized = true;
    this.taskRunnerContext = taskRunnerContext;
  }

  public create({ taskInstance, abortController, executionUuid }: RunContext) {
    if (!this.isInitialized) {
      throw new Error('TaskRunnerFactory not initialized');
    }

    const { actionExecutor, inMemoryMetrics } = this;
    const { logger, encryptedSavedObjectsClient, spaceIdToNamespace, savedObjectsRepository } =
      this.taskRunnerContext!;

    const taskInfo = {
      scheduled: taskInstance.runAt,
      attempts: taskInstance.attempts,
    };
    const actionExecutionId = executionUuid;
    const actionTaskExecutorParams = taskInstance.params as ActionTaskExecutorParams;

    return {
      async run() {
        const {
          attributes: {
            actionId,
            params,
            apiKey,
            executionId,
            consumer,
            source,
            relatedSavedObjects,
          },
          references,
        } = await getActionTaskParams(
          actionTaskExecutorParams,
          encryptedSavedObjectsClient,
          spaceIdToNamespace,
          logger
        );

        const { spaceId } = actionTaskExecutorParams;
        const request = getFakeRequest(apiKey, spaceId);

        let executorResult: ActionTypeExecutorResult<unknown> | undefined;
        try {
          executorResult = await actionExecutor.execute({
            params,
            actionId: actionId as string,
            request,
            taskInfo,
            executionId,
            consumer,
            relatedSavedObjects: validatedRelatedSavedObjects(logger, relatedSavedObjects),
            actionExecutionId,
            ...getSource(references, source),
            signal: abortController.signal,
          });
        } catch (e) {
          const errorSource =
            e instanceof ActionTypeDisabledError
              ? TaskErrorSource.USER
              : getErrorSource(e) || TaskErrorSource.FRAMEWORK;
          logger.error(`Action '${actionId}' failed: ${e.message}`, {
            tags: ['connector-run-failed', `${errorSource}-error`],
          });
          if (e instanceof ActionTypeDisabledError) {
            // We'll stop re-trying due to action being forbidden
            throwUnrecoverableError(createTaskRunError(e, errorSource));
          }
          throw createTaskRunError(e, errorSource);
        }

        inMemoryMetrics.increment(IN_MEMORY_METRICS.ACTION_EXECUTIONS);
        if (executorResult.status === 'error') {
          inMemoryMetrics.increment(IN_MEMORY_METRICS.ACTION_FAILURES);

          let message = executorResult.message;
          if (executorResult.serviceMessage) {
            message = `${message}: ${executorResult.serviceMessage}`;
          }
          logger.error(`Action '${actionId}' failed: ${message}`, {
            tags: ['connector-run-failed', `${executorResult.errorSource}-error`],
          });

          // Task manager error handler only kicks in when an error thrown (at this time)
          // So what we have to do is throw when the return status is `error`.
          throw throwRetryableError(
            createTaskRunError(new Error(executorResult.message), executorResult.errorSource),
            executorResult.retry as boolean | Date
          );
        }
      },
      cancel: async () => {
        // Write event log entry
        const { spaceId } = actionTaskExecutorParams;

        const {
          attributes: { actionId, apiKey, executionId, consumer, source, relatedSavedObjects },
          references,
        } = await getActionTaskParams(
          actionTaskExecutorParams,
          encryptedSavedObjectsClient,
          spaceIdToNamespace,
          logger
        );

        const request = getFakeRequest(apiKey, spaceId);

        await actionExecutor.logCancellation({
          actionId,
          request,
          consumer,
          executionId,
          relatedSavedObjects: (relatedSavedObjects || []) as RelatedSavedObjects,
          actionExecutionId,
          ...getSource(references, source),
        });

        inMemoryMetrics.increment(IN_MEMORY_METRICS.ACTION_TIMEOUTS);

        logger.debug(
          `Cancelling action task for action with id ${actionId} - execution error due to timeout.`
        );
        return { state: {} };
      },
      cleanup: async () => {
        // Cleanup action_task_params object now that we're done with it
        try {
          await savedObjectsRepository.delete(
            ACTION_TASK_PARAMS_SAVED_OBJECT_TYPE,
            actionTaskExecutorParams.actionTaskParamsId,
            { refresh: false, namespace: spaceIdToNamespace(actionTaskExecutorParams.spaceId) }
          );
        } catch (e) {
          // Log error only, we shouldn't fail the task because of an error here (if ever there's retry logic)
          logger.error(
            `Failed to cleanup ${ACTION_TASK_PARAMS_SAVED_OBJECT_TYPE} object [id="${actionTaskExecutorParams.actionTaskParamsId}"]: ${e.message}`
          );
        }
      },
    };
  }
}

function getFakeRequest(apiKey: string | undefined, spaceId: string) {
  const requestHeaders: Headers = {};
  if (apiKey) {
    requestHeaders.authorization = `ApiKey ${apiKey}`;
  }

  const fakeRawRequest: FakeRawRequest = {
    headers: requestHeaders,
    spaceId: asSpaceId(spaceId),
  };

  return kibanaRequestFactory(fakeRawRequest);
}

async function getActionTaskParams(
  executorParams: ActionTaskExecutorParams,
  encryptedSavedObjectsClient: EncryptedSavedObjectsClient,
  spaceIdToNamespace: SpaceIdToNamespaceFunction,
  logger: Logger
): Promise<TaskParams> {
  const { spaceId } = executorParams;
  const namespace = spaceIdToNamespace(spaceId);
  try {
    const actionTask =
      await encryptedSavedObjectsClient.getDecryptedAsInternalUser<ActionTaskParams>(
        ACTION_TASK_PARAMS_SAVED_OBJECT_TYPE,
        executorParams.actionTaskParamsId,
        { namespace }
      );
    const {
      attributes: { relatedSavedObjects },
      references,
    } = actionTask;

    const { actionId, relatedSavedObjects: injectedRelatedSavedObjects } =
      injectSavedObjectReferences(references, relatedSavedObjects as RelatedSavedObjects);

    return {
      ...actionTask,
      attributes: {
        ...actionTask.attributes,
        ...(actionId ? { actionId } : {}),
        ...(relatedSavedObjects ? { relatedSavedObjects: injectedRelatedSavedObjects } : {}),
      },
    };
  } catch (e) {
    const errorSource = SavedObjectsErrorHelpers.isNotFoundError(e)
      ? TaskErrorSource.USER
      : TaskErrorSource.FRAMEWORK;
    logger.error(
      `Failed to load action task params ${executorParams.actionTaskParamsId}: ${e.message}`,
      { tags: ['connector-run-failed', `${errorSource}-error`] }
    );
    if (SavedObjectsErrorHelpers.isNotFoundError(e)) {
      throw createRetryableError(createTaskRunError(e, errorSource), true);
    }
    throw createRetryableError(createTaskRunError(e, errorSource), true);
  }
}

function getSource(references: SavedObjectReference[], sourceType?: string) {
  const sourceInReferences = references.find((ref) => ref.name === 'source');
  if (sourceInReferences) {
    return { source: asSavedObjectExecutionSource(pick(sourceInReferences, 'id', 'type')) };
  }

  return sourceType ? { source: asEmptySource(sourceType as ActionExecutionSourceType) } : {};
}
