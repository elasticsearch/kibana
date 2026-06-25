/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ChangeHistoryDetail, ChangeHistoryListItem } from '@kbn/change-history-ui';

import type { WorkflowHistoryItem } from '../../../common/lib/workflow_change_history/types';

export interface MapWorkflowHistoryItemOptions {
  isCurrent?: boolean;
}

export const mapWorkflowHistoryItemToListItem = (
  item: WorkflowHistoryItem,
  { isCurrent }: MapWorkflowHistoryItemOptions = {}
): ChangeHistoryListItem => ({
  id: item.id,
  timestamp: item.timestamp,
  actor: {
    name: item.user.name,
    ...(item.user.profileId ? { profileId: item.user.profileId } : {}),
  },
  action: item.action,
  ...(isCurrent ? { isCurrent: true } : {}),
  ...(item.version != null ? { metadata: { version: item.version } } : {}),
});

export const mapWorkflowHistoryItemToDetail = (
  item: WorkflowHistoryItem,
  options: MapWorkflowHistoryItemOptions = {}
): ChangeHistoryDetail => ({
  ...mapWorkflowHistoryItemToListItem(item, options),
  snapshot: {
    workflow: {
      yaml: item.workflow.yaml,
    },
  },
});
