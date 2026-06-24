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
import { AgentConnectors } from './agent_connectors';

jest.mock('../../../hooks/use_kibana', () => ({
  useKibana: () => ({
    services: {
      plugins: {
        triggersActionsUi: {
          actionTypeRegistry: { has: () => false, get: () => ({}) },
        },
      },
    },
  }),
}));

jest.mock('../../../hooks/use_navigation', () => ({
  useNavigation: () => ({ createAgentBuilderUrl: () => '#' }),
}));

jest.mock('../../../hooks/use_flyout_state', () => ({
  useFlyoutState: () => ({ isOpen: false, openFlyout: jest.fn(), closeFlyout: jest.fn() }),
}));

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

jest.mock('./active_connector_row', () => ({
  ActiveConnectorRow: () => <div data-test-subj="activeConnectorRow" />,
}));

jest.mock('./connector_detail_panel', () => ({
  ConnectorDetailPanel: jest.fn(() => <div data-test-subj="connectorDetailPanel" />),
}));

jest.mock('./connector_library_panel', () => ({
  ConnectorLibraryPanel: () => <div data-test-subj="connectorLibraryPanel" />,
}));

jest.mock('./connectors_customize_empty_state', () => ({
  ConnectorsCustomizeEmptyState: () => <div data-test-subj="connectorsCustomizeEmptyState" />,
}));

jest.mock('../../../hooks/agents/use_agent_by_id');
jest.mock('../../../hooks/agents/use_can_update_agent');
jest.mock('../../../hooks/connectors/use_agent_connectors');
jest.mock('../../../hooks/use_has_connectors_all_privileges');
jest.mock('../../../context/connectors_provider');

const { useAgentBuilderAgentById } = jest.requireMock('../../../hooks/agents/use_agent_by_id');
const { useCanUpdateAgent } = jest.requireMock('../../../hooks/agents/use_can_update_agent');
const { useAgentConnectors } = jest.requireMock('../../../hooks/connectors/use_agent_connectors');
const { useHasConnectorsAllPrivileges } = jest.requireMock(
  '../../../hooks/use_has_connectors_all_privileges'
);
const { useConnectorsActions } = jest.requireMock('../../../context/connectors_provider');
const { useQueryState } = jest.requireMock('../../../hooks/use_query_state');
const { ConnectorDetailPanel } = jest.requireMock('./connector_detail_panel');

const openCreateFlyout = jest.fn();

const renderComponent = () =>
  render(
    <EuiProvider>
      <IntlProvider locale="en">
        <AgentConnectors agentId="agent-1" />
      </IntlProvider>
    </EuiProvider>
  );

describe('AgentConnectors', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useQueryState.mockReturnValue([undefined, jest.fn()]);

    ConnectorDetailPanel.mockImplementation(() => <div data-test-subj="connectorDetailPanel" />);

    useAgentBuilderAgentById.mockReturnValue({
      agent: {
        id: 'agent-1',
        name: 'Test Agent',
        configuration: { connector_ids: ['c1'] },
      },
      isLoading: false,
      error: null,
    });

    useCanUpdateAgent.mockReturnValue(true);

    useAgentConnectors.mockReturnValue({
      assignedConnectors: [{ id: 'c1', name: 'Connector 1', actionTypeId: '.test' }],
      allConnectors: [{ id: 'c1', name: 'Connector 1', actionTypeId: '.test' }],
      activeConnectorIdSet: new Set(['c1']),
      isLoading: false,
      assign: jest.fn(),
      unassign: jest.fn(),
    });

    useHasConnectorsAllPrivileges.mockReturnValue(true);

    useConnectorsActions.mockReturnValue({ openCreateFlyout });
  });

  it('calls openCreateFlyout when "Create new connector" is clicked', async () => {
    const user = userEvent.setup();

    renderComponent();

    await user.click(screen.getByTestId('agentBuilderAddConnectorButton'));
    await user.click(screen.getByText('Create new connector'));

    expect(openCreateFlyout).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no connectors are assigned', () => {
    useAgentBuilderAgentById.mockReturnValue({
      agent: { id: 'agent-1', name: 'Test Agent', configuration: { connector_ids: [] } },
      isLoading: false,
      error: null,
    });
    useAgentConnectors.mockReturnValue({
      assignedConnectors: [],
      allConnectors: [],
      activeConnectorIdSet: new Set(),
      isLoading: false,
      assign: jest.fn(),
      unassign: jest.fn(),
    });

    renderComponent();

    expect(screen.getByTestId('connectorsCustomizeEmptyState')).toBeInTheDocument();
    expect(screen.queryByTestId('agentBuilderAddConnectorButton')).not.toBeInTheDocument();
  });

  it('shows detail panel when a connector is selected', () => {
    useQueryState.mockReturnValue(['c1', jest.fn()]);

    renderComponent();

    expect(screen.getByTestId('connectorDetailPanel')).toBeInTheDocument();
  });

  it('clears selection when the selected connector is removed', () => {
    const setSelectedConnectorId = jest.fn();
    useQueryState.mockReturnValue(['c1', setSelectedConnectorId]);
    const unassign = jest.fn();
    useAgentConnectors.mockReturnValue({
      assignedConnectors: [{ id: 'c1', name: 'Connector 1', actionTypeId: '.test' }],
      allConnectors: [{ id: 'c1', name: 'Connector 1', actionTypeId: '.test' }],
      activeConnectorIdSet: new Set(['c1']),
      isLoading: false,
      assign: jest.fn(),
      unassign,
    });

    renderComponent();

    const { onRemove } = ConnectorDetailPanel.mock.calls[0][0];
    onRemove({ id: 'c1', name: 'Connector 1', actionTypeId: '.test' });

    expect(unassign).toHaveBeenCalledWith({ id: 'c1', name: 'Connector 1', actionTypeId: '.test' });
    expect(setSelectedConnectorId).toHaveBeenCalledWith(null);
  });

  it('disables "From library" but not the main button when connector_ids is undefined', async () => {
    const user = userEvent.setup();

    useAgentBuilderAgentById.mockReturnValue({
      agent: { id: 'agent-1', name: 'Test Agent', configuration: {} },
      isLoading: false,
      error: null,
    });

    renderComponent();

    const mainButton = screen.getByTestId('agentBuilderAddConnectorButton');
    expect(mainButton).not.toBeDisabled();

    await user.click(mainButton);

    expect(screen.getByText('From library').closest('button')).toBeDisabled();
    expect(screen.getByText('Create new connector').closest('button')).not.toBeDisabled();
  });
});
