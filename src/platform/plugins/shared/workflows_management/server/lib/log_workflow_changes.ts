/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ObjectChange } from '@kbn/change-history';
import type { Logger } from '@kbn/core/server';
import { DEFAULT_MAX_RETRIES, DEFAULT_RETRY_DELAY_MS, delayMs } from '@kbn/occ';

import { isRetryableChangeHistoryError } from './is_retryable_change_history_error';
import {
  WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
  type WorkflowChangeHistoryActionType,
} from '../../common/lib/workflow_change_history/constants';
import type {
  IScopedWorkflowChangeHistoryService,
  IWorkflowChangeHistoryService,
} from '../services/workflow_change_history_types';
import type { WorkflowProperties } from '../storage/workflow_storage';

export interface LogWorkflowChangesParams {
  workflows: Array<{ id: string; document: WorkflowProperties }>;
  changeHistoryService: Pick<IWorkflowChangeHistoryService, 'isInitialized'> | undefined;
  scopedChangeHistory: IScopedWorkflowChangeHistoryService | undefined;
  workflowVersioningEnabled: boolean;
  action: WorkflowChangeHistoryActionType;
  spaceId: string;
  timestamp: string | Date;
  correlationId?: string;
  logger: Logger;
  maxRetries?: number;
  retryDelayMs?: number;
}

const toObjectChanges = (
  workflows: Array<{ id: string; document: WorkflowProperties }>,
  timestamp: string | Date,
  logger: Logger
): ObjectChange[] => {
  const timestampIso = new Date(timestamp).toISOString();

  return workflows.map(({ id, document }) => {
    if (document.version == null) {
      logger.warn(
        `Logging workflow change history for '${id}' without object.sequence: document.version is missing`
      );
    }

    return {
      timestamp: timestampIso,
      objectId: id,
      objectType: WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
      ...(document.version != null ? { sequence: document.version } : {}),
      snapshot: { yaml: document.yaml },
    };
  });
};

/**
 * Appends workflow definition changes to change-history after a successful primary write.
 * Uses `document.version` as `object.sequence` when present; otherwise history falls back to `@timestamp` ordering.
 * Retries transient failures; never throws to the mutation caller.
 */
export const logWorkflowChanges = async ({
  workflows,
  changeHistoryService,
  scopedChangeHistory,
  workflowVersioningEnabled,
  action,
  spaceId,
  timestamp,
  correlationId,
  logger,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}: LogWorkflowChangesParams): Promise<void> => {
  if (!changeHistoryService?.isInitialized() || !scopedChangeHistory) {
    return;
  }

  if (!workflowVersioningEnabled) {
    return;
  }

  if (workflows.length === 0) {
    return;
  }

  const changes = toObjectChanges(workflows, timestamp, logger);

  const logOpts = {
    action,
    spaceId,
    ...(correlationId ? { correlationId } : {}),
  };

  const maxAttempts = 1 + maxRetries;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await scopedChangeHistory.logBulk(changes, logOpts);
      return;
    } catch (error) {
      if (!isRetryableChangeHistoryError(error) || attempt >= maxAttempts) {
        const workflowIds = changes.map((change) => change.objectId).join(', ');
        logger.error(
          `Unable to log workflow changes for action "${action}" (workflows: ${workflowIds}) after ${attempt} attempt(s)`,
          { error }
        );
        return;
      }

      logger.debug(
        `Change-history write failed for action "${action}", retrying (attempt ${attempt}/${maxAttempts})`
      );
      await delayMs(retryDelayMs);
    }
  }
};
