/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ChangeHistoryDocument } from '@kbn/change-history';
import { WorkflowNotFoundError } from '@kbn/workflows/common/errors';

import {
  assertWorkflowChangeHistoryEnabled,
  getHistoryForWorkflow,
} from './get_workflow_change_history';
import { WorkflowChangeHistoryDisabledError } from './workflow_change_history_disabled_error';
import type { IWorkflowChangeHistoryService } from '../services/workflow_change_history_types';

const createHistoryDocument = (eventId: string, sequence: number): ChangeHistoryDocument => ({
  '@timestamp': '2026-06-17T10:00:00.000Z',
  ecs: { version: '9.3.0' },
  user: { name: 'alice' },
  event: {
    id: eventId,
    module: 'stack',
    dataset: 'workflows',
    action: 'workflow_update',
    type: 'change',
  },
  object: {
    id: 'wf-1',
    type: 'workflow',
    hash: 'abc',
    sequence,
    fields: { hashed: [], redacted: [] },
    snapshot: {
      name: 'My workflow',
      enabled: true,
      tags: [],
      yaml: 'name: My workflow',
      version: sequence,
      valid: true,
    },
  },
  service: { type: 'kibana', version: '9.4.0' },
});

describe('get_workflow_change_history', () => {
  const workflow = {
    id: 'wf-1',
    name: 'My workflow',
    enabled: true,
    createdAt: '2026-06-17T10:00:00.000Z',
    createdBy: 'alice',
    lastUpdatedAt: '2026-06-17T10:00:00.000Z',
    lastUpdatedBy: 'alice',
    definition: null,
    yaml: 'name: My workflow',
    valid: true,
  };

  const createDeps = ({
    initialized = true,
    versioningEnabled = true,
    historyResult = { total: 0, items: [] as ChangeHistoryDocument[] },
    workflowResult = workflow,
  }: {
    initialized?: boolean;
    versioningEnabled?: boolean;
    historyResult?: { total: number; items: ChangeHistoryDocument[] };
    workflowResult?: typeof workflow | null;
  } = {}) => {
    const changeHistoryService = {
      isInitialized: jest.fn().mockReturnValue(initialized),
      getHistory: jest.fn().mockResolvedValue(historyResult),
    } as unknown as IWorkflowChangeHistoryService;

    return {
      deps: {
        changeHistoryService,
        getWorkflow: jest.fn().mockResolvedValue(workflowResult),
        workflowVersioningEnabled: versioningEnabled,
      },
      changeHistoryService,
    };
  };

  describe('assertWorkflowChangeHistoryEnabled', () => {
    it('throws when change history is not initialized', () => {
      const { deps } = createDeps({ initialized: false });

      expect(() =>
        assertWorkflowChangeHistoryEnabled(
          deps.changeHistoryService,
          deps.workflowVersioningEnabled
        )
      ).toThrow(WorkflowChangeHistoryDisabledError);
    });

    it('throws when versioning uiSetting is disabled', () => {
      const { deps } = createDeps({ versioningEnabled: false });

      expect(() =>
        assertWorkflowChangeHistoryEnabled(
          deps.changeHistoryService,
          deps.workflowVersioningEnabled
        )
      ).toThrow(WorkflowChangeHistoryDisabledError);
    });
  });

  describe('getHistoryForWorkflow', () => {
    it('returns mapped history entries with page/perPage and matching version', async () => {
      const historyDocument = createHistoryDocument('event-1', 2);
      const { deps, changeHistoryService } = createDeps({
        historyResult: { total: 1, items: [historyDocument] },
      });

      const result = await getHistoryForWorkflow(deps, {
        workflowId: 'wf-1',
        spaceId: 'default',
        page: 2,
        perPage: 10,
      });

      expect(changeHistoryService.getHistory).toHaveBeenCalledWith('default', 'wf-1', {
        from: 10,
        size: 10,
      });
      expect(result).toEqual({
        page: 2,
        perPage: 10,
        total: 1,
        items: [
          expect.objectContaining({
            id: 'event-1',
            version: 2,
            workflow: { yaml: 'name: My workflow' },
          }),
        ],
      });
    });

    it('uses default pagination when omitted', async () => {
      const { deps, changeHistoryService } = createDeps();

      await getHistoryForWorkflow(deps, {
        workflowId: 'wf-1',
        spaceId: 'default',
      });

      expect(changeHistoryService.getHistory).toHaveBeenCalledWith('default', 'wf-1', {
        from: 0,
        size: 20,
      });
    });

    it('throws WorkflowNotFoundError when workflow does not exist', async () => {
      const { deps } = createDeps({ workflowResult: null });

      await expect(
        getHistoryForWorkflow(deps, { workflowId: 'missing', spaceId: 'default' })
      ).rejects.toBeInstanceOf(WorkflowNotFoundError);
    });

    it('throws WorkflowChangeHistoryDisabledError when versioning is disabled', async () => {
      const { deps } = createDeps({ versioningEnabled: false });

      await expect(
        getHistoryForWorkflow(deps, { workflowId: 'wf-1', spaceId: 'default' })
      ).rejects.toBeInstanceOf(WorkflowChangeHistoryDisabledError);
    });

    it('returns empty list when no history exists', async () => {
      const { deps } = createDeps();

      const result = await getHistoryForWorkflow(deps, {
        workflowId: 'wf-1',
        spaceId: 'default',
      });

      expect(result).toEqual({ page: 1, perPage: 20, total: 0, items: [] });
    });
  });
});
