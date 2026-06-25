/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  mapWorkflowHistoryItemToDetail,
  mapWorkflowHistoryItemToListItem,
} from './map_workflow_history_item';
import {
  WORKFLOW_CHANGE_HISTORY_SYSTEM_USER,
  WorkflowChangeHistoryAction,
} from '../../../common/lib/workflow_change_history/constants';
import type { WorkflowHistoryItem } from '../../../common/lib/workflow_change_history/types';

const currentHistoryItem: WorkflowHistoryItem = {
  id: 'evt-current',
  timestamp: '2026-06-16T12:00:00.000Z',
  user: { profileId: 'user-1', name: 'Alice' },
  action: WorkflowChangeHistoryAction.workflowUpdate,
  version: 3,
  workflow: { yaml: 'name: current\n' },
};

const previousHistoryItem: WorkflowHistoryItem = {
  id: 'evt-previous',
  timestamp: '2026-06-15T12:00:00.000Z',
  user: { name: WORKFLOW_CHANGE_HISTORY_SYSTEM_USER },
  action: WorkflowChangeHistoryAction.workflowCreate,
  version: 1,
  workflow: { yaml: 'name: original\n' },
};

describe('mapWorkflowHistoryItem', () => {
  it('maps list rows with actor, action, version metadata, and current flag', () => {
    expect(mapWorkflowHistoryItemToListItem(currentHistoryItem, { isCurrent: true })).toEqual({
      id: 'evt-current',
      timestamp: '2026-06-16T12:00:00.000Z',
      actor: { name: 'Alice', profileId: 'user-1' },
      action: WorkflowChangeHistoryAction.workflowUpdate,
      isCurrent: true,
      metadata: { version: 3 },
    });

    expect(mapWorkflowHistoryItemToListItem(previousHistoryItem)).toEqual({
      id: 'evt-previous',
      timestamp: '2026-06-15T12:00:00.000Z',
      actor: { name: WORKFLOW_CHANGE_HISTORY_SYSTEM_USER },
      action: WorkflowChangeHistoryAction.workflowCreate,
      metadata: { version: 1 },
    });
  });

  it('maps detail with workflow yaml snapshot', () => {
    const detail = mapWorkflowHistoryItemToDetail(currentHistoryItem, {
      isCurrent: true,
    });

    expect(detail.snapshot).toEqual({
      workflow: {
        yaml: 'name: current\n',
      },
    });
    expect(detail.action).toBe(WorkflowChangeHistoryAction.workflowUpdate);
  });

  it('passes through unknown action values', () => {
    expect(
      mapWorkflowHistoryItemToListItem({
        ...currentHistoryItem,
        action: 'custom-action' as WorkflowHistoryItem['action'],
      }).action
    ).toBe('custom-action');
  });
});
