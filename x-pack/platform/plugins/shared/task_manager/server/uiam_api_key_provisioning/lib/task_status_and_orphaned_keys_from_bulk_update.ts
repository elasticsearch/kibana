/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isSavedObjectErrorResult } from '@kbn/core/server';
import type { SavedObjectErrorResult } from '@kbn/core/server';
import type { InvalidationTarget } from '../../api_key_strategy';
import type { UiamKeyResult } from '../types';
import {
  createTaskProvisioningStatusFromBulkUpdateResult,
  type TaskUiamProvisioningStatusDoc,
} from './task_uiam_provisioning_observability_status';

const invalidationTargetFromUiamKeyResult = (
  c: UiamKeyResult | undefined
): InvalidationTarget | null => {
  if (c == null) {
    return null;
  }
  if (c.uiamApiKeyId.length > 0 && c.uiamApiKey.length > 0) {
    return { apiKeyId: c.uiamApiKeyId, uiamApiKey: c.uiamApiKey };
  }
  return null;
};

/**
 * Result item from a bulkUpdate call (has id and optional error).
 * Mirrors `BulkUpdateResultItem` in alerting's `provisioning_status.ts`.
 */
export interface TaskBulkUpdateResultItem {
  id: string;
  error?: SavedObjectErrorResult['error'];
}

/**
 * Builds status docs from bulk update results and collects invalidation targets for tasks
 * that failed to update (orphaned), shaped like {@link InvalidationTarget} in `api_key_strategy`
 * and Alerting’s notion of “orphan” UIAM material to queue for the invalidate pipeline.
 */
export const statusDocsAndOrphanedUiamKeysFromTaskBulkUpdate = (
  savedObjects: Array<TaskBulkUpdateResultItem>,
  uiamKeyByTaskId: Map<string, UiamKeyResult>
): {
  provisioningStatusForCompletedTasks: TaskUiamProvisioningStatusDoc[];
  provisioningStatusForFailedTasks: TaskUiamProvisioningStatusDoc[];
  orphanedInvalidationTargets: InvalidationTarget[];
} => {
  const provisioningStatusForCompletedTasks: TaskUiamProvisioningStatusDoc[] = [];
  const provisioningStatusForFailedTasks: TaskUiamProvisioningStatusDoc[] = [];
  const orphanedInvalidationTargets: InvalidationTarget[] = [];
  for (const so of savedObjects) {
    const statusDoc = createTaskProvisioningStatusFromBulkUpdateResult(so);
    if (isSavedObjectErrorResult(so)) {
      provisioningStatusForFailedTasks.push(statusDoc);
      const target = invalidationTargetFromUiamKeyResult(uiamKeyByTaskId.get(so.id));
      if (target) {
        orphanedInvalidationTargets.push(target);
      }
    } else {
      provisioningStatusForCompletedTasks.push(statusDoc);
    }
  }
  return {
    provisioningStatusForCompletedTasks,
    provisioningStatusForFailedTasks,
    orphanedInvalidationTargets,
  };
};
