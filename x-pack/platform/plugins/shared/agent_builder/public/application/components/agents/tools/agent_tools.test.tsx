/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { EuiProvider } from '@elastic/eui';
import { AgentTools } from './agent_tools';

jest.mock('react-router-dom', () => ({
  useParams: () => ({ agentId: 'agent-1' }),
}));

jest.mock('../../../hooks/use_navigation', () => ({
  useNavigation: () => ({ createAgentBuilderUrl: () => '#' }),
}));

jest.mock('../../../hooks/use_flyout_state');

jest.mock('../../../hooks/use_query_state');

jest.mock('../common/page_wrapper', () => ({
  PageWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../common/styles', () => ({
  useListDetailPageStyles: () => ({
    loadingSpinner: {},
    header: {},
    body: {},
    searchColumn: {},
    searchInputWrapper: {},
    scrollableList: {},
    detailPanelWrapper: {},
    noSelectionPlaceholder: {},
  }),
}));

jest.mock('./tool_library_panel', () => ({
  ToolLibraryPanel: () => <div data-test-subj="toolLibraryPanel" />,
}));

jest.mock('./tool_detail_panel', () => ({
  ToolDetailPanel: () => <div data-test-subj="toolDetailPanel" />,
}));

jest.mock('./tools_customize_empty_state', () => ({
  ToolsCustomizeEmptyState: () => <div data-test-subj="toolsCustomizeEmptyState" />,
}));

jest.mock('../common/active_item_row', () => ({
  ActiveItemRow: () => <div data-test-subj="activeItemRow" />,
}));

jest.mock('../../../hooks/agents/use_agent_by_id');
jest.mock('../../../hooks/agents/use_can_update_agent');
jest.mock('../../../hooks/tools/use_tools');
jest.mock('./use_tools_mutation');

const { useAgentBuilderAgentById } = jest.requireMock('../../../hooks/agents/use_agent_by_id');
const { useCanUpdateAgent } = jest.requireMock('../../../hooks/agents/use_can_update_agent');
const { useToolsService } = jest.requireMock('../../../hooks/tools/use_tools');
const { useToolsMutation } = jest.requireMock('./use_tools_mutation');
const { useQueryState } = jest.requireMock('../../../hooks/use_query_state');
const { useFlyoutState } = jest.requireMock('../../../hooks/use_flyout_state');

const renderComponent = () =>
  render(
    <EuiProvider>
      <IntlProvider locale="en">
        <AgentTools />
      </IntlProvider>
    </EuiProvider>
  );

describe('AgentTools', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useQueryState.mockReturnValue([undefined, jest.fn()]);

    useFlyoutState.mockReturnValue({
      isOpen: false,
      openFlyout: jest.fn(),
      closeFlyout: jest.fn(),
    });

    useAgentBuilderAgentById.mockReturnValue({
      agent: {
        id: 'agent-1',
        name: 'Test Agent',
        configuration: { tools: [{ tool_ids: ['tool-1'] }] },
      },
      isLoading: false,
      error: null,
    });

    useCanUpdateAgent.mockReturnValue(true);

    useToolsService.mockReturnValue({
      tools: [{ id: 'tool-1', description: 'Tool 1', tags: [] }],
      isLoading: false,
    });

    useToolsMutation.mockReturnValue({
      handleAddTool: jest.fn(),
      handleRemoveTool: jest.fn(),
    });
  });

  it('renders the Add tool button', () => {
    renderComponent();
    expect(screen.getByTestId('agentBuilderAddToolButton')).toBeInTheDocument();
  });

  it('opens dropdown with two menu items when Add tool is clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderComponent();

    await user.click(screen.getByTestId('agentBuilderAddToolButton'));

    expect(screen.getByText('Create new tool')).toBeInTheDocument();
    expect(screen.getByText('From library')).toBeInTheDocument();
  });

  it('opens library flyout when "Add from library" is clicked', async () => {
    const openFlyout = jest.fn();
    useFlyoutState.mockReturnValue({ isOpen: false, openFlyout, closeFlyout: jest.fn() });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderComponent();

    await user.click(screen.getByTestId('agentBuilderAddToolButton'));
    await user.click(screen.getByText('From library'));

    expect(openFlyout).toHaveBeenCalledTimes(1);
  });

  it('closes dropdown when "Create new tool" is clicked (no-op stub)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderComponent();

    await user.click(screen.getByTestId('agentBuilderAddToolButton'));
    expect(screen.getByText('Create new tool')).toBeInTheDocument();

    await user.click(screen.getByText('Create new tool'));

    expect(screen.queryByText('Create new tool')).not.toBeInTheDocument();
  });

  it('hides the Add tool button when canEditAgent is false', () => {
    useCanUpdateAgent.mockReturnValue(false);
    renderComponent();
    expect(screen.queryByTestId('agentBuilderAddToolButton')).not.toBeInTheDocument();
  });
});
