/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ChangeHistoryDocument } from '@kbn/change-history';

import { WORKFLOW_CHANGE_HISTORY_SYSTEM_USER } from '../../common/lib/workflow_change_history/constants';
import type { WorkflowHistoryItem } from '../../common/lib/workflow_change_history/types';

export const mapWorkflowHistoryItem = (document: ChangeHistoryDocument): WorkflowHistoryItem => ({
  timestamp: document['@timestamp'],
  id: document.event.id,
  user: document.user.name
    ? {
        name: document.user.name,
        ...(document.user.id ? { profileId: document.user.id } : {}),
      }
    : { name: WORKFLOW_CHANGE_HISTORY_SYSTEM_USER },
  action: document.event.action as WorkflowHistoryItem['action'],
  ...(document.object.sequence != null ? { version: document.object.sequence } : {}),
  ...(document.event.reason ? { comment: document.event.reason } : {}),
  workflow: {
    yaml: typeof document.object.snapshot.yaml === 'string' ? document.object.snapshot.yaml : '',
  },
});
