/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { UiamApiKeyProvisioningStatus } from '@kbn/uiam-api-keys-provisioning-status';
import type { UiamKeyResult } from '../types';
import { statusDocsAndOrphanedUiamKeysFromTaskBulkUpdate } from './task_status_and_orphaned_keys_from_bulk_update';

describe('statusDocsAndOrphanedUiamKeysFromTaskBulkUpdate', () => {
  it('splits success vs failure, collects invalidation target when update fails', () => {
    const uiamKeyByTaskId = new Map<string, UiamKeyResult>([
      [
        'a',
        {
          taskId: 'a',
          uiamApiKey: 'YTpmb28',
          uiamApiKeyId: 'id-a',
          attributes: {
            apiKey: 'k',
            taskType: 'alerting:.index-threshold',
            userScope: { apiKeyId: 'es', apiKeyCreatedByUser: false },
          },
        },
      ],
    ]);
    const {
      provisioningStatusForCompletedTasks,
      provisioningStatusForFailedTasks,
      orphanedInvalidationTargets,
    } = statusDocsAndOrphanedUiamKeysFromTaskBulkUpdate(
      [
        { id: 'a', error: { error: 'Conflict', message: 'conflict', statusCode: 409 } },
        { id: 'b' },
      ],
      uiamKeyByTaskId
    );

    expect(orphanedInvalidationTargets).toEqual([{ apiKeyId: 'id-a', uiamApiKey: 'YTpmb28' }]);
    expect(provisioningStatusForFailedTasks).toHaveLength(1);
    expect(provisioningStatusForFailedTasks[0].id).toBe('a');
    expect(provisioningStatusForFailedTasks[0].attributes.status).toBe(
      UiamApiKeyProvisioningStatus.FAILED
    );
    expect(provisioningStatusForCompletedTasks).toHaveLength(1);
    expect(provisioningStatusForCompletedTasks[0].id).toBe('b');
    expect(provisioningStatusForCompletedTasks[0].attributes.status).toBe(
      UiamApiKeyProvisioningStatus.COMPLETED
    );
  });
});
