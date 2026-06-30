/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ISavedObjectsRepository, Logger } from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import {
  UiamApiKeyProvisioningEntityType,
  UiamApiKeyProvisioningStatus,
} from '@kbn/uiam-api-keys-provisioning-status';
import { UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE } from '../uiam_api_keys_provisioning_status_saved_object';
import { TAGS } from '../constants';
import { getErrorMessage } from './error_utils';

export interface TaskUiamProvisioningStatusDoc {
  type: typeof UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE;
  id: string;
  attributes: {
    '@timestamp': string;
    entityId: string;
    entityType: typeof UiamApiKeyProvisioningEntityType.TASK;
    status:
      | typeof UiamApiKeyProvisioningStatus.SKIPPED
      | typeof UiamApiKeyProvisioningStatus.FAILED
      | typeof UiamApiKeyProvisioningStatus.COMPLETED;
    message?: string;
    errorCode?: string;
  };
}

export const createSkippedTaskProvisioningStatus = (
  taskId: string,
  message: string
): TaskUiamProvisioningStatusDoc => ({
  type: UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE,
  id: taskId,
  attributes: {
    '@timestamp': new Date().toISOString(),
    entityId: taskId,
    entityType: UiamApiKeyProvisioningEntityType.TASK,
    status: UiamApiKeyProvisioningStatus.SKIPPED,
    message,
  },
});

export const createFailedConversionTaskProvisioningStatus = (
  taskId: string,
  message: string,
  errorCode?: string
): TaskUiamProvisioningStatusDoc => ({
  type: UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE,
  id: taskId,
  attributes: {
    '@timestamp': new Date().toISOString(),
    entityId: taskId,
    entityType: UiamApiKeyProvisioningEntityType.TASK,
    status: UiamApiKeyProvisioningStatus.FAILED,
    message,
    ...(errorCode ? { errorCode } : {}),
  },
});

export const createTaskProvisioningStatusFromBulkUpdateResult = (so: {
  id: string;
  error?: { message?: string };
}): TaskUiamProvisioningStatusDoc => ({
  type: UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE,
  id: so.id,
  attributes: {
    '@timestamp': new Date().toISOString(),
    entityId: so.id,
    entityType: UiamApiKeyProvisioningEntityType.TASK,
    status: so.error ? UiamApiKeyProvisioningStatus.FAILED : UiamApiKeyProvisioningStatus.COMPLETED,
    ...(so.error
      ? {
          message: `Error bulk updating task ${so.id} with UIAM key: ${
            so.error.message ?? so.error
          }`,
        }
      : {}),
  },
});

export interface TaskUiamProvisioningObservabilityStatusPayload {
  skipped: TaskUiamProvisioningStatusDoc[];
  failedConversions: TaskUiamProvisioningStatusDoc[];
  completed: TaskUiamProvisioningStatusDoc[];
  failed: TaskUiamProvisioningStatusDoc[];
}

/**
 * Same shape as Alerting's `ProvisioningStatusWritePayload` for `uiam_api_keys_provisioning_status`.
 */
export type TaskProvisioningStatusWritePayload = TaskUiamProvisioningObservabilityStatusPayload;

export interface TaskProvisioningStatusCounts {
  skipped: number;
  failedConversions: number;
  completed: number;
  failed: number;
  total: number;
}

/**
 * Builds the flat docs array and counts for a provisioning status write (mirrors
 * `prepareProvisioningStatusWrite` in `alerting/server/provisioning/lib/provisioning_status.ts`).
 */
export const prepareTaskProvisioningStatusWrite = (
  payload: TaskProvisioningStatusWritePayload
): { docs: TaskUiamProvisioningStatusDoc[]; counts: TaskProvisioningStatusCounts } => {
  const { skipped, failedConversions, completed, failed } = payload;
  const docs: TaskUiamProvisioningStatusDoc[] = [
    ...skipped,
    ...failedConversions,
    ...completed,
    ...failed,
  ];
  const counts: TaskProvisioningStatusCounts = {
    skipped: skipped.length,
    failedConversions: failedConversions.length,
    completed: completed.length,
    failed: failed.length,
    total: docs.length,
  };
  return { docs, counts };
};

/**
 * Persists provisioning status docs for monitoring only. Swallows errors so execution is unchanged.
 */
export const writeTaskUiamProvisioningObservabilityStatus = async (
  savedObjectsClient: ISavedObjectsRepository,
  logger: Logger,
  payload: TaskUiamProvisioningObservabilityStatusPayload
): Promise<void> => {
  const { docs, counts } = prepareTaskProvisioningStatusWrite(payload);
  if (docs.length === 0) {
    return;
  }
  try {
    const result = await savedObjectsClient.bulkCreate(docs, { overwrite: true });
    result.saved_objects.forEach((so) => {
      if (isSavedObjectErrorResult(so)) {
        logger.warn(
          `Error writing task provisioning status for ${so.id}: ${so.error.message ?? so.error}`,
          { tags: TAGS }
        );
      }
    });
    logger.info(
      `Wrote provisioning status: ${counts.total} total (${counts.skipped} skipped, ${counts.failedConversions} failed conversions, ${counts.completed} completed, ${counts.failed} failed updates).`,
      { tags: TAGS }
    );
  } catch (e) {
    logger.error(`Error writing provisioning status: ${getErrorMessage(e)}`, {
      error: {
        stack_trace: e instanceof Error ? e.stack : undefined,
        tags: [...TAGS, 'status-write-failed'],
      },
    });
  }
};
