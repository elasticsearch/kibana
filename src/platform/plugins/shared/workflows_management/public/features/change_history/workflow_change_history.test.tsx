/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { WorkflowDetailDto } from '@kbn/workflows';
import {
  WorkflowChangeHistoryListItem,
  WorkflowChangeHistoryProvider,
} from './workflow_change_history';
import { INTERNAL_API_VERSION } from '../../../common/lib/api_constants';
import {
  WORKFLOW_CHANGE_HISTORY_SYSTEM_USER,
  WorkflowChangeHistoryAction,
} from '../../../common/lib/workflow_change_history/constants';
import type { WorkflowChangesHistoryResponse } from '../../../common/lib/workflow_change_history/types';
import { createMockStore } from '../../entities/workflows/store/__mocks__/store.mock';
import { setWorkflow } from '../../entities/workflows/store/workflow_detail/slice';
import { TestWrapper } from '../../shared/test_utils';

const restorableWorkflow: WorkflowDetailDto = {
  id: 'workflow-1',
  name: 'My workflow',
  yaml: 'name: current\n',
  enabled: true,
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBy: 'user-1',
  lastUpdatedAt: '2026-06-16T00:00:00.000Z',
  lastUpdatedBy: 'user-1',
  definition: null,
  valid: true,
};

const createStoreWithWorkflow = (workflow: WorkflowDetailDto = restorableWorkflow) => {
  const store = createMockStore();
  store.dispatch(setWorkflow(workflow));
  return store;
};

const sampleWorkflowHistoryResponse: WorkflowChangesHistoryResponse = {
  page: 1,
  perPage: 20,
  total: 2,
  items: [
    {
      id: 'evt-current',
      timestamp: '2026-06-16T12:00:00.000Z',
      user: { profileId: 'user-1', name: 'Alice' },
      action: WorkflowChangeHistoryAction.workflowUpdate,
      version: 3,
      workflow: { yaml: 'name: current\n' },
    },
    {
      id: 'evt-previous',
      timestamp: '2026-06-15T12:00:00.000Z',
      user: { name: WORKFLOW_CHANGE_HISTORY_SYSTEM_USER },
      action: WorkflowChangeHistoryAction.workflowCreate,
      version: 1,
      workflow: { yaml: 'name: original\n' },
    },
  ],
};

class IntersectionObserverMock {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
}

beforeAll(() => {
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: IntersectionObserverMock,
  });
});

jest.mock('./use_workflow_change_history', () => ({
  ...jest.requireActual('./use_workflow_change_history'),
  useWorkflowChangeHistoryEnabled: jest.fn(),
}));

jest.mock('../../hooks/use_kibana', () => ({
  useKibana: jest.fn(),
}));

jest.mock('@kbn/workflows-ui', () => {
  const actual = jest.requireActual('@kbn/workflows-ui');
  return {
    ...actual,
    useWorkflowsCapabilities: jest.fn(() => ({
      canReadWorkflow: true,
      canUpdateWorkflow: true,
    })),
  };
});

const mockLoadWorkflowSpy = jest.fn();

jest.mock('../../entities/workflows/store/workflow_detail/thunks/load_workflow_thunk', () => {
  const { createAsyncThunk } = jest.requireActual('@reduxjs/toolkit');
  return {
    loadWorkflowThunk: createAsyncThunk(
      'detail/loadWorkflowThunk/test',
      async (params: { id: string }) => {
        mockLoadWorkflowSpy(params);
        return { id: params.id, yaml: 'name: restored\n' };
      }
    ),
  };
});

const { useWorkflowChangeHistoryEnabled } = jest.requireMock('./use_workflow_change_history');
const { useKibana } = jest.requireMock('../../hooks/use_kibana');
const { useWorkflowsCapabilities } = jest.requireMock('@kbn/workflows-ui');

const openHistoryModal = async () => {
  fireEvent.click(screen.getByTestId('changeHistoryListGroupItem'));

  await waitFor(() => {
    expect(screen.getByTestId('changeHistoryModal')).toBeInTheDocument();
  });
};

const selectHistoricalVersion = async (changeId = 'evt-previous') => {
  fireEvent.click(screen.getByTestId(`changeHistoryItem-${changeId}`));

  await waitFor(() => {
    expect(screen.getByTestId('changeHistoryPreview')).toBeInTheDocument();
  });
};

describe('WorkflowChangeHistoryListItem', () => {
  beforeEach(() => {
    mockLoadWorkflowSpy.mockClear();
    useWorkflowChangeHistoryEnabled.mockReturnValue(true);
    useWorkflowsCapabilities.mockReturnValue({
      canReadWorkflow: true,
      canUpdateWorkflow: true,
    });
    useKibana.mockReturnValue({
      services: {
        http: {
          get: jest.fn().mockResolvedValue(sampleWorkflowHistoryResponse),
          post: jest.fn().mockResolvedValue({}),
        },
      },
    });
  });

  it('renders nothing when change history is disabled', () => {
    useWorkflowChangeHistoryEnabled.mockReturnValue(false);

    const { container } = render(
      <TestWrapper>
        <WorkflowChangeHistoryProvider workflowId="workflow-1" workflowName="My workflow">
          <WorkflowChangeHistoryListItem />
        </WorkflowChangeHistoryProvider>
      </TestWrapper>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('opens modal and loads workflow yaml preview through the real change history UI', async () => {
    const http = {
      get: jest.fn().mockResolvedValue(sampleWorkflowHistoryResponse),
      post: jest.fn().mockResolvedValue({}),
    };
    useKibana.mockReturnValue({ services: { http } });

    render(
      <TestWrapper>
        <WorkflowChangeHistoryProvider workflowId="workflow-1" workflowName="My workflow">
          <WorkflowChangeHistoryListItem />
        </WorkflowChangeHistoryProvider>
      </TestWrapper>
    );

    fireEvent.click(screen.getByTestId('changeHistoryListGroupItem'));

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryModal')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryPreview')).toBeInTheDocument();
    });

    expect(screen.getByTestId('workflowChangeHistoryYamlPreview')).toHaveTextContent(
      'name: current'
    );
    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('/internal/workflows/workflow/workflow-1/history'),
      expect.objectContaining({
        query: { page: 1, per_page: 20 },
        version: INTERNAL_API_VERSION,
      })
    );
  });

  it('restores a historical version and reloads the workflow', async () => {
    const http = {
      get: jest.fn().mockResolvedValue(sampleWorkflowHistoryResponse),
      post: jest.fn().mockResolvedValue({ id: 'workflow-1' }),
    };
    useKibana.mockReturnValue({ services: { http } });

    render(
      <TestWrapper store={createStoreWithWorkflow()}>
        <WorkflowChangeHistoryProvider workflowId="workflow-1" workflowName="My workflow">
          <WorkflowChangeHistoryListItem />
        </WorkflowChangeHistoryProvider>
      </TestWrapper>
    );

    await openHistoryModal();
    await selectHistoricalVersion();

    fireEvent.click(screen.getByTestId('changeHistoryRestoreButton'));

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryRestoreConfirmModal')).toBeInTheDocument();
    });

    fireEvent.click(
      within(screen.getByTestId('changeHistoryRestoreConfirmModal')).getByText('Restore')
    );

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledWith(
        '/internal/workflows/workflow/workflow-1/history/evt-previous/restore',
        expect.objectContaining({
          version: INTERNAL_API_VERSION,
        })
      );
    });

    await waitFor(() => {
      expect(mockLoadWorkflowSpy).toHaveBeenCalledWith({ id: 'workflow-1' });
    });

    expect(http.get.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the confirm modal visible when restore fails', async () => {
    const http = {
      get: jest.fn().mockResolvedValue(sampleWorkflowHistoryResponse),
      post: jest.fn().mockRejectedValue({
        response: { status: 409 },
        body: { message: 'Workflow was updated by another user.' },
        message: 'Conflict',
      }),
    };
    useKibana.mockReturnValue({ services: { http } });

    render(
      <TestWrapper store={createStoreWithWorkflow()}>
        <WorkflowChangeHistoryProvider workflowId="workflow-1" workflowName="My workflow">
          <WorkflowChangeHistoryListItem />
        </WorkflowChangeHistoryProvider>
      </TestWrapper>
    );

    await openHistoryModal();
    await selectHistoricalVersion();

    fireEvent.click(screen.getByTestId('changeHistoryRestoreButton'));

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryRestoreConfirmModal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

    await waitFor(() => {
      expect(screen.getByText('Workflow was updated by another user.')).toBeInTheDocument();
    });
    expect(screen.getByTestId('changeHistoryRestoreConfirmModal')).toBeInTheDocument();
    expect(mockLoadWorkflowSpy).not.toHaveBeenCalled();
  });

  it('hides restore for managed workflows', async () => {
    const http = {
      get: jest.fn().mockResolvedValue(sampleWorkflowHistoryResponse),
      post: jest.fn().mockResolvedValue({ id: 'workflow-1' }),
    };
    useKibana.mockReturnValue({ services: { http } });

    render(
      <TestWrapper
        store={createStoreWithWorkflow({
          ...restorableWorkflow,
          managed: true,
        })}
      >
        <WorkflowChangeHistoryProvider workflowId="workflow-1" workflowName="My workflow">
          <WorkflowChangeHistoryListItem />
        </WorkflowChangeHistoryProvider>
      </TestWrapper>
    );

    await openHistoryModal();
    await selectHistoricalVersion();

    expect(screen.queryByTestId('changeHistoryRestoreButton')).not.toBeInTheDocument();
  });
});
