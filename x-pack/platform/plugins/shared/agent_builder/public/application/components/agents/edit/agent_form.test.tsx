/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { AgentAccessControlMode } from '@kbn/agent-builder-common';
import { AgentForm } from './agent_form';
import type { AgentEditState } from '../../../hooks/agents/use_agent_edit';

const mockSubmit = jest.fn();

const editModeState: AgentEditState = {
  id: 'test-agent-id',
  name: 'Test Agent',
  description: 'Test description',
  access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
  labels: [],
  avatar_color: '',
  avatar_symbol: '',
  configuration: {
    instructions: '',
    tools: [{ tool_ids: [] }],
    workflow_ids: [],
  },
};

/** State used for create mode (no editingAgentId): empty id, name, description */
const createModeState: AgentEditState = {
  ...editModeState,
  id: '',
  name: '',
  description: '',
};

jest.mock('../../../hooks/agents/use_agent_edit', () => ({
  useAgentEdit: jest.fn(),
}));

jest.mock('../../../hooks/use_kibana', () => ({
  useKibana: () => ({
    services: {
      uiSettings: { get: () => false },
      notifications: { toasts: { addSuccess: jest.fn(), addDanger: jest.fn() } },
      http: {},
      overlays: { openConfirm: jest.fn().mockResolvedValue(true) },
      application: { navigateToUrl: jest.fn() },
      appParams: { history: { replace: jest.fn(), push: jest.fn() } },
    },
  }),
}));

jest.mock('../../../hooks/use_navigation', () => ({
  useNavigation: () => ({
    navigateToAgentBuilderUrl: jest.fn(),
  }),
}));

jest.mock('../../../hooks/use_agent_builder_service', () => ({
  useAgentBuilderServices: () => ({
    docLinksService: { agentBuilderAgents: 'https://docs.example.com/agents' },
    agentService: { list: jest.fn().mockResolvedValue([]) },
  }),
}));

jest.mock('../../../hooks/use_ui_privileges', () => ({
  useUiPrivileges: () => ({ manageAgents: true, isAdmin: false }),
}));

jest.mock('../../../hooks/tools/use_tools', () => ({
  useToolsService: () => ({ tools: [], isLoading: false, error: undefined }),
}));

jest.mock('../../../hooks/use_experimental_features', () => ({
  useExperimentalFeatures: () => false,
}));

jest.mock('@kbn/unsaved-changes-prompt', () => ({
  useUnsavedChangesPrompt: () => {},
}));

const { useAgentEdit } = jest.requireMock('../../../hooks/agents/use_agent_edit');

const renderWithIntl = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en">{ui}</IntlProvider>
    </QueryClientProvider>
  );
};

describe('AgentForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAgentEdit as jest.Mock).mockImplementation(
      ({ editingAgentId }: { editingAgentId?: string }) => {
        const state: AgentEditState = !editingAgentId ? createModeState : { ...editModeState };
        return {
          state,
          isLoading: false,
          isSubmitting: false,
          submit: mockSubmit,
          tools: [],
          skills: [],
          plugins: [],
          error: undefined,
        };
      }
    );
  });

  it('displays owner name in edit mode when agent has created_by with username', () => {
    (useAgentEdit as jest.Mock).mockReturnValue({
      state: {
        ...editModeState,
        created_by: { id: 'user-1', username: 'test-owner' },
      },
      isLoading: false,
      isSubmitting: false,
      submit: mockSubmit,
      tools: [],
      skills: [],
      plugins: [],
      error: undefined,
    });

    renderWithIntl(<AgentForm editingAgentId="test-agent-id" onDelete={jest.fn()} />);

    expect(screen.getByTestId('agentFormOwnerLabel')).toBeInTheDocument();
    expect(screen.getByText('Owner: test-owner')).toBeInTheDocument();
  });

  it('does not display owner label in edit mode when agent has no created_by username', () => {
    (useAgentEdit as jest.Mock).mockReturnValue({
      state: editModeState,
      isLoading: false,
      isSubmitting: false,
      submit: mockSubmit,
      tools: [],
      skills: [],
      plugins: [],
      error: undefined,
    });

    renderWithIntl(<AgentForm editingAgentId="test-agent-id" onDelete={jest.fn()} />);

    expect(screen.queryByTestId('agentFormOwnerLabel')).not.toBeInTheDocument();
  });

  it('does not display owner label in create mode', () => {
    (useAgentEdit as jest.Mock).mockReturnValue({
      state: {
        ...createModeState,
        created_by: { id: 'user-1', username: 'current-user' },
      },
      isLoading: false,
      isSubmitting: false,
      submit: mockSubmit,
      tools: [],
      skills: [],
      plugins: [],
      error: undefined,
    });

    renderWithIntl(<AgentForm />);

    expect(screen.queryByTestId('agentFormOwnerLabel')).not.toBeInTheDocument();
  });
});
