/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { HttpSetup } from '@kbn/core/public';
import { createWorkflowChangeHistoryAdapter } from './workflow_change_history_adapter';
import { INTERNAL_API_VERSION } from '../../../common/lib/api_constants';
import {
  WORKFLOW_CHANGE_HISTORY_SYSTEM_USER,
  WorkflowChangeHistoryAction,
} from '../../../common/lib/workflow_change_history/constants';
import type {
  WorkflowChangesHistoryResponse,
  WorkflowHistoryItem,
} from '../../../common/lib/workflow_change_history/types';

const SAMPLE_WORKFLOW_ID = 'workflow-1';

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

const sampleWorkflowHistoryResponse: WorkflowChangesHistoryResponse = {
  page: 1,
  perPage: 20,
  total: 2,
  items: [currentHistoryItem, previousHistoryItem],
};

const createHttpMock = (get: jest.Mock): Pick<HttpSetup, 'get'> => ({
  get,
});

describe('createWorkflowChangeHistoryAdapter', () => {
  it('fetches paginated history with 1-based API page numbers', async () => {
    const http = createHttpMock(jest.fn().mockResolvedValue(sampleWorkflowHistoryResponse));

    const adapter = createWorkflowChangeHistoryAdapter(http as HttpSetup);

    const result = await adapter.listChanges({
      objectId: SAMPLE_WORKFLOW_ID,
      page: { index: 0, size: 20 },
    });

    expect(http.get).toHaveBeenCalledWith(
      `/internal/workflows/workflow/${SAMPLE_WORKFLOW_ID}/history`,
      {
        query: { page: 1, per_page: 20 },
        version: INTERNAL_API_VERSION,
        signal: undefined,
      }
    );
    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({
      id: 'evt-current',
      isCurrent: true,
      metadata: { version: 3 },
    });
    expect(result.items[1]?.isCurrent).toBeUndefined();
  });

  it('does not mark isCurrent on page 2 and appends to cache without clearing', async () => {
    const pageTwoItem: WorkflowHistoryItem = {
      ...previousHistoryItem,
      id: 'evt-older',
      version: 0,
    };
    const http = createHttpMock(
      jest.fn().mockImplementation((_url, options) => {
        const page = options?.query?.page;

        if (page === 1) {
          return Promise.resolve({
            page: 1,
            perPage: 1,
            total: 3,
            items: [currentHistoryItem],
          });
        }

        return Promise.resolve({
          page: 2,
          perPage: 1,
          total: 3,
          items: [pageTwoItem],
        });
      })
    );

    const adapter = createWorkflowChangeHistoryAdapter(http as HttpSetup);

    await adapter.listChanges({
      objectId: SAMPLE_WORKFLOW_ID,
      page: { index: 0, size: 1 },
    });

    const pageTwoResult = await adapter.listChanges({
      objectId: SAMPLE_WORKFLOW_ID,
      page: { index: 1, size: 1 },
    });

    expect(pageTwoResult.items[0]?.isCurrent).toBeUndefined();
    await expect(
      adapter.getChange({
        objectId: SAMPLE_WORKFLOW_ID,
        changeId: 'evt-current',
      })
    ).resolves.toMatchObject({ id: 'evt-current' });
    await expect(
      adapter.getChange({
        objectId: SAMPLE_WORKFLOW_ID,
        changeId: 'evt-older',
      })
    ).resolves.toMatchObject({ id: 'evt-older' });
  });

  it('namespaces cache by objectId so colliding change ids do not leak across workflows', async () => {
    const http = createHttpMock(jest.fn().mockResolvedValue(sampleWorkflowHistoryResponse));
    const adapter = createWorkflowChangeHistoryAdapter(http as HttpSetup);

    await adapter.listChanges({
      objectId: 'workflow-a',
      page: { index: 0, size: 20 },
    });

    await expect(
      adapter.getChange({
        objectId: 'workflow-b',
        changeId: 'evt-current',
      })
    ).rejects.toThrow('Workflow change "evt-current" is not loaded');
  });

  it('returns cached detail from list rows without a dedicated detail route', async () => {
    const http = createHttpMock(jest.fn().mockResolvedValue(sampleWorkflowHistoryResponse));
    const adapter = createWorkflowChangeHistoryAdapter(http as HttpSetup);

    await adapter.listChanges({
      objectId: SAMPLE_WORKFLOW_ID,
      page: { index: 0, size: 20 },
    });

    await expect(
      adapter.getChange({
        objectId: SAMPLE_WORKFLOW_ID,
        changeId: 'evt-previous',
      })
    ).resolves.toMatchObject({
      id: 'evt-previous',
      snapshot: {
        workflow: {
          yaml: 'name: original\n',
        },
      },
    });
  });

  it('clears only the current workflow cache on page-0 refetch', async () => {
    const http = createHttpMock(
      jest.fn().mockImplementation((_url, options) => {
        const page = options?.query?.page;

        if (page === 1) {
          return Promise.resolve({
            page: 1,
            perPage: 20,
            total: 1,
            items: [currentHistoryItem],
          });
        }

        return Promise.resolve({
          page: 1,
          perPage: 20,
          total: 1,
          items: [{ ...previousHistoryItem, id: 'evt-other-workflow' }],
        });
      })
    );
    const adapter = createWorkflowChangeHistoryAdapter(http as HttpSetup);

    await adapter.listChanges({
      objectId: 'workflow-a',
      page: { index: 0, size: 20 },
    });

    await adapter.listChanges({
      objectId: 'workflow-b',
      page: { index: 0, size: 20 },
    });

    await expect(
      adapter.getChange({
        objectId: 'workflow-a',
        changeId: 'evt-current',
      })
    ).resolves.toMatchObject({ id: 'evt-current' });
  });

  it('throws when getChange is called before the row was loaded', async () => {
    const adapter = createWorkflowChangeHistoryAdapter(createHttpMock(jest.fn()) as HttpSetup);

    await expect(
      adapter.getChange({
        objectId: SAMPLE_WORKFLOW_ID,
        changeId: 'missing-event',
      })
    ).rejects.toThrow('Workflow change "missing-event" is not loaded');
  });
});
