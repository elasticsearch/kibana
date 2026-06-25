/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ChangeHistoryDocument } from '@kbn/change-history';

import { mapWorkflowHistoryItem } from './map_workflow_history_item';
import { WORKFLOW_CHANGE_HISTORY_SYSTEM_USER } from '../../common/lib/workflow_change_history/constants';

const createDocument = (overrides: Partial<ChangeHistoryDocument> = {}): ChangeHistoryDocument => ({
  '@timestamp': '2026-06-17T10:00:00.000Z',
  ecs: { version: '9.3.0' },
  user: { name: 'alice', id: 'profile-1' },
  event: {
    id: 'event-1',
    module: 'stack',
    dataset: 'workflows',
    action: 'workflow_update',
    type: 'change',
  },
  object: {
    id: 'wf-1',
    type: 'workflow',
    hash: 'abc',
    sequence: 3,
    fields: { hashed: [] },
    snapshot: {
      name: 'My workflow',
      description: 'desc',
      enabled: true,
      tags: ['a', 'b'],
      yaml: 'name: My workflow',
      version: 3,
      valid: true,
    },
  },
  service: { type: 'kibana', version: '9.4.0' },
  ...overrides,
});

describe('mapWorkflowHistoryItem', () => {
  it('maps change-history document fields to WorkflowHistoryItem', () => {
    const result = mapWorkflowHistoryItem(createDocument());

    expect(result).toEqual({
      timestamp: '2026-06-17T10:00:00.000Z',
      id: 'event-1',
      user: { profileId: 'profile-1', name: 'alice' },
      action: 'workflow_update',
      version: 3,
      workflow: {
        yaml: 'name: My workflow',
      },
    });
  });

  it('omits optional fields when absent', () => {
    const result = mapWorkflowHistoryItem(
      createDocument({
        user: { name: '' },
        object: {
          id: 'wf-1',
          type: 'workflow',
          hash: 'abc',
          fields: { hashed: [] },
          snapshot: {
            name: 'W',
            enabled: false,
            tags: [],
            yaml: '',
            valid: false,
          },
        },
      })
    );

    expect(result.version).toBeUndefined();
    expect(result.user).toEqual({ name: WORKFLOW_CHANGE_HISTORY_SYSTEM_USER });
    expect(result.workflow).toEqual({ yaml: '' });
  });
});
