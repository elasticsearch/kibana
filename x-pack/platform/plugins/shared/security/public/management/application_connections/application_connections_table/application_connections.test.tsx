/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import React from 'react';

import { coreMock } from '@kbn/core/public/mocks';

import { mockAuthenticatedUser } from '../../../../common/model/authenticated_user.mock';
import { securityMock } from '../../../mocks';
import { Providers } from '../application_connections_management_app';
import { ApplicationConnectionsPage } from '../application_connections_page';

jest.mock('../assets/illustration_empty_state.svg', () => 'illustration-empty-state-mock.svg', {
  virtual: true,
});

type CoreStartMock = ReturnType<typeof coreMock.createStart>;

interface GetResponses {
  clients?: unknown;
  connections?: unknown;
}

function setupHttpResponses(coreStart: CoreStartMock, responses: GetResponses) {
  coreStart.http.get.mockImplementation(((path: string) => {
    if (path.endsWith('/oauth/clients')) {
      return Promise.resolve(responses.clients ?? { clients: [] });
    }
    if (path.endsWith('/oauth/connections')) {
      return Promise.resolve(responses.connections ?? { connections: [] });
    }
    return Promise.resolve({});
  }) as typeof coreStart.http.get);
}

function renderPage(coreStart: CoreStartMock) {
  const history = createMemoryHistory({ initialEntries: ['/'] });
  const { authc } = securityMock.createSetup();
  authc.getCurrentUser.mockResolvedValue(
    mockAuthenticatedUser({ username: 'current_user', full_name: 'Current User' })
  );
  return render(
    coreStart.rendering.addContext(
      <Providers services={coreStart} authc={authc} history={history}>
        <ApplicationConnectionsPage http={coreStart.http} />
      </Providers>
    )
  );
}

describe('ApplicationConnections', () => {
  let coreStart: CoreStartMock;

  beforeEach(() => {
    coreStart = coreMock.createStart();
  });

  it('renders the empty prompt inside the table noItemsMessage when there are no clients', async () => {
    setupHttpResponses(coreStart, {
      clients: { clients: [] },
      connections: { connections: [] },
    });
    coreStart.application.getUrlForApp.mockImplementation((appId, options) => {
      return `/mock/app/${appId}${options?.path ?? ''}`;
    });

    const { findByText, findByTestId, getByTestId, getByPlaceholderText } = renderPage(coreStart);

    expect(await findByText(/No application connections/)).toBeInTheDocument();
    expect(await findByText(/Get started by creating MCP clients/)).toBeInTheDocument();
    const addButton = await findByTestId('applicationConnectionsEmptyPromptAddButton');
    expect(addButton).toBeInTheDocument();
    expect(addButton).toHaveAttribute(
      'href',
      '/mock/app/agent_builder/manage/tools/mcp_clients/new'
    );
    expect(
      await findByTestId('applicationConnectionsEmptyPromptLearnMoreLink')
    ).toBeInTheDocument();

    const manageClientsLink = getByTestId('applicationConnectionsManageClientsLink');
    expect(manageClientsLink).toBeInTheDocument();
    expect(manageClientsLink).toHaveAttribute(
      'href',
      '/mock/app/agent_builder/manage/tools/mcp_clients'
    );

    expect(getByPlaceholderText('Search')).toBeInTheDocument();
    expect(getByTestId('applicationConnectionsTable')).toBeInTheDocument();
  }, 15_000);

  it('hides clients that have zero connections (falls back to the empty prompt when all clients are empty)', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [
          {
            id: 'client-without-conn',
            client_name: 'Unused MCP app',
            resource: 'cluster:elastic',
          },
        ],
      },
      connections: { connections: [] },
    });

    const { findByText, queryByText, queryByTestId } = renderPage(coreStart);

    expect(await findByText(/No application connections/)).toBeInTheDocument();
    expect(queryByText('Unused MCP app')).not.toBeInTheDocument();
    expect(
      queryByTestId('applicationConnectionsListRow-client-without-conn')
    ).not.toBeInTheDocument();
  });

  it('renders clients grouped with their connections', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [
          {
            id: 'client-a',
            client_name: 'My MCP app',
            resource: 'cluster:elastic',
            creation: '2026-04-01T10:00:00.000Z',
          },
        ],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
            creation: '2026-04-10T10:00:00.000Z',
          },
          {
            id: 'conn-2',
            client_id: 'client-a',
            name: 'Phone session',
            resource: 'cluster:elastic',
            creation: '2026-04-11T10:00:00.000Z',
            revoked: true,
          },
        ],
      },
    });

    const { findByText, findByTestId, queryByTestId } = renderPage(coreStart);

    expect(await findByText('My MCP app')).toBeInTheDocument();
    const badge = await findByTestId('applicationConnectionsCount-client-a');
    expect(badge).toHaveTextContent('2');
    expect(queryByTestId('revokeClientAction-client-a')).not.toBeInTheDocument();
  });

  it('filters by status without leaking the filter syntax into the free-text search', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [
          { id: 'client-active', client_name: 'Active app', resource: 'cluster:elastic' },
          { id: 'client-revoked', client_name: 'Revoked app', resource: 'cluster:elastic' },
        ],
      },
      connections: {
        connections: [
          { id: 'conn-a', client_id: 'client-active', resource: 'cluster:elastic' },
          {
            id: 'conn-b',
            client_id: 'client-revoked',
            resource: 'cluster:elastic',
            revoked: true,
          },
        ],
      },
    });

    const { findByText, findByRole, getByRole, getByText, queryByText } = renderPage(coreStart);

    expect(await findByText('Active app')).toBeInTheDocument();
    expect(await findByText('Revoked app')).toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: /Status Selection/ }));
    fireEvent.click(await findByRole('option', { name: /Connected/ }));

    await waitFor(() => {
      expect(queryByText('Revoked app')).not.toBeInTheDocument();
    });
    expect(getByText('Active app')).toBeInTheDocument();
  });

  function setupMixedStatusFixture() {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [{ id: 'client-a', client_name: 'Mixed app', resource: 'cluster:elastic' }],
      },
      connections: {
        connections: [
          {
            id: 'conn-active',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
          },
          {
            id: 'conn-revoked',
            client_id: 'client-a',
            name: 'Desktop session',
            resource: 'cluster:elastic',
            revoked: true,
          },
        ],
      },
    });
  }

  it('filters by "Connected" inside a mixed-status grouped row', async () => {
    setupMixedStatusFixture();
    const { findByRole, findByTestId, findByText, getByRole, getByTestId, queryByText } =
      renderPage(coreStart);

    expect(await findByTestId('applicationConnectionsCount-client-a')).toHaveTextContent('2');

    fireEvent.click(getByRole('button', { name: /Status Selection/ }));
    fireEvent.click(await findByRole('option', { name: /Connected/ }));

    await waitFor(() => {
      expect(getByTestId('applicationConnectionsCount-client-a')).toHaveTextContent('1');
    });
    fireEvent.click(getByTestId('expandRow-client-a'));
    expect(await findByText('Laptop session')).toBeInTheDocument();
    expect(queryByText('Desktop session')).not.toBeInTheDocument();
  }, 15_000);

  it('filters by "Revoked" inside a mixed-status grouped row', async () => {
    setupMixedStatusFixture();
    const { findByRole, findByTestId, findByText, getByRole, getByTestId, queryByText } =
      renderPage(coreStart);

    expect(await findByTestId('applicationConnectionsCount-client-a')).toHaveTextContent('2');

    fireEvent.click(getByRole('button', { name: /Status Selection/ }));
    fireEvent.click(await findByRole('option', { name: /Revoked/ }));

    await waitFor(() => {
      expect(getByTestId('applicationConnectionsCount-client-a')).toHaveTextContent('1');
    });
    fireEvent.click(getByTestId('expandRow-client-a'));
    expect(await findByText('Desktop session')).toBeInTheDocument();
    expect(queryByText('Laptop session')).not.toBeInTheDocument();
  }, 15_000);

  it('renders the expanded connection table with the Figma-aligned columns (no Scopes, no Select-all)', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [
          {
            id: 'client-a',
            client_name: 'My MCP app',
            resource: 'cluster:elastic',
          },
        ],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
            creation: '2026-04-10T10:00:00.000Z',
          },
        ],
      },
    });

    const { findByTestId, findByText, getByTestId, queryByText } = renderPage(coreStart);

    await findByText('My MCP app');
    fireEvent.click(getByTestId('expandRow-client-a'));

    expect(await findByText('Connection name')).toBeInTheDocument();
    expect(await findByText('Authorization date')).toBeInTheDocument();
    expect(await findByText('Connected')).toBeInTheDocument();
    expect(await findByText('Connected by')).toBeInTheDocument();
    expect(await findByTestId('applicationConnectionConnectedBy-conn-1')).toHaveTextContent('—');
    expect(queryByText('Scopes')).not.toBeInTheDocument();
  });

  it('renders the current user display name when "Connected by" matches the signed-in user', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [
          {
            id: 'client-a',
            client_name: 'My MCP app',
            resource: 'cluster:elastic',
          },
        ],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
            user_id: 'current_user',
          },
        ],
      },
    });

    const { findByTestId, getByTestId } = renderPage(coreStart);

    await findByTestId('expandRow-client-a');
    fireEvent.click(getByTestId('expandRow-client-a'));

    await waitFor(() => {
      expect(getByTestId('applicationConnectionConnectedBy-conn-1')).toHaveTextContent(
        'Current User'
      );
    });
  });

  it('falls back to the raw user_id when "Connected by" does not match the signed-in user', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [
          {
            id: 'client-a',
            client_name: 'My MCP app',
            resource: 'cluster:elastic',
          },
        ],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
            user_id: 'other_cloud_user_id',
          },
        ],
      },
    });

    const { findByTestId, getByTestId } = renderPage(coreStart);

    await findByTestId('expandRow-client-a');
    fireEvent.click(getByTestId('expandRow-client-a'));

    await waitFor(() => {
      expect(getByTestId('applicationConnectionConnectedBy-conn-1')).toHaveTextContent(
        'other_cloud_user_id'
      );
    });
  });

  it('shows the bulk revoke toolbar when a per-row checkbox is selected', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [
          {
            id: 'client-a',
            client_name: 'My MCP app',
            resource: 'cluster:elastic',
          },
        ],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
          },
        ],
      },
    });

    const { findByText, findByTestId, getByTestId, queryByTestId } = renderPage(coreStart);

    await findByText('My MCP app');
    fireEvent.click(getByTestId('expandRow-client-a'));
    const innerTable = await findByTestId('applicationConnectionsChildTable-client-a');
    await findByText('Laptop session');

    expect(queryByTestId('applicationConnectionsBulkRevokeButton')).not.toBeInTheDocument();

    const rowCheckbox = within(innerTable).getByLabelText(/Select connection 'Laptop session'/);
    fireEvent.click(rowCheckbox);

    expect(await findByTestId('applicationConnectionsBulkRevokeButton')).toHaveTextContent(
      'Revoke 1 connection'
    );
  });

  it('renders the "Connected by" column in the revoke modal with current-user resolution', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [
          {
            id: 'client-a',
            client_name: 'My MCP app',
            resource: 'cluster:elastic',
          },
        ],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
            user_id: 'current_user',
          },
          {
            id: 'conn-2',
            client_id: 'client-a',
            name: 'Desktop session',
            resource: 'cluster:elastic',
            user_id: 'other_cloud_user_id',
          },
          {
            id: 'conn-3',
            client_id: 'client-a',
            name: 'Server session',
            resource: 'cluster:elastic',
          },
        ],
      },
    });

    const { findByText, findByTestId, getByTestId } = renderPage(coreStart);

    await findByText('My MCP app');
    fireEvent.click(getByTestId('expandRow-client-a'));

    const revokeLink = await findByTestId('revokeConnection-conn-1');
    fireEvent.click(revokeLink);
    let modal = await findByTestId('applicationConnectionsRevokeModal');
    expect(within(modal).getByText('Connected by')).toBeInTheDocument();
    expect(within(modal).getByText('Current User')).toBeInTheDocument();
    fireEvent.click(within(modal).getByTestId('applicationConnectionsRevokeCancelButton'));

    fireEvent.click(await findByTestId('revokeConnection-conn-2'));
    modal = await findByTestId('applicationConnectionsRevokeModal');
    expect(within(modal).getByText('other_cloud_user_id')).toBeInTheDocument();
    fireEvent.click(within(modal).getByTestId('applicationConnectionsRevokeCancelButton'));

    fireEvent.click(await findByTestId('revokeConnection-conn-3'));
    modal = await findByTestId('applicationConnectionsRevokeModal');
    expect(within(modal).getByText('—')).toBeInTheDocument();
  });

  it('opens the confirm modal for a single connection revoke and calls the bulk-revoke API', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [
          {
            id: 'client-a',
            client_name: 'My MCP app',
            resource: 'cluster:elastic',
          },
        ],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
          },
        ],
      },
    });
    coreStart.http.post.mockResolvedValue({
      results: [{ client_id: 'client-a', connection_id: 'conn-1', status: 'revoked' }],
    });

    const { findByText, getByTestId, findByTestId } = renderPage(coreStart);

    await findByText('My MCP app');

    fireEvent.click(getByTestId('expandRow-client-a'));

    const revokeLink = await findByTestId('revokeConnection-conn-1');
    fireEvent.click(revokeLink);

    const modal = await findByTestId('applicationConnectionsRevokeModal');
    fireEvent.click(within(modal).getByTestId('applicationConnectionsRevokeConfirmButton'));

    await waitFor(() => {
      expect(coreStart.http.post).toHaveBeenCalledWith(
        '/internal/security/oauth/connections/_bulk_revoke',
        {
          body: JSON.stringify({
            connections: [{ client_id: 'client-a', connection_id: 'conn-1' }],
            reason: undefined,
          }),
        }
      );
    });
  });

  it('renames a connection inline and PATCHes the update endpoint', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [{ id: 'client-a', client_name: 'My MCP app', resource: 'cluster:elastic' }],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
          },
        ],
      },
    });
    coreStart.http.patch.mockResolvedValue({
      id: 'conn-1',
      client_id: 'client-a',
      name: 'Renamed session',
      resource: 'cluster:elastic',
    });

    const { findByText, findByTestId, getByTestId } = renderPage(coreStart);

    await findByText('My MCP app');
    fireEvent.click(getByTestId('expandRow-client-a'));
    await findByText('Laptop session');

    const inlineEdit = getByTestId('inlineEditConnectionName-conn-1');
    fireEvent.click(within(inlineEdit).getByTestId('euiInlineReadModeButton'));

    const input = await findByTestId('inlineEditConnectionNameInput-conn-1');
    fireEvent.change(input, { target: { value: 'Renamed session' } });
    fireEvent.click(getByTestId('inlineEditConnectionNameSave-conn-1'));

    await waitFor(() => {
      expect(coreStart.http.patch).toHaveBeenCalledWith(
        '/internal/security/oauth/clients/client-a/connections/conn-1',
        { body: JSON.stringify({ name: 'Renamed session' }) }
      );
    });
    expect(coreStart.notifications.toasts.addSuccess).toHaveBeenCalledWith({
      title: "Renamed connection to 'Renamed session'",
    });
  });

  it('blocks the inline rename when the input is empty', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [{ id: 'client-a', client_name: 'My MCP app', resource: 'cluster:elastic' }],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
          },
        ],
      },
    });

    const { findByText, findByTestId, getByTestId } = renderPage(coreStart);

    await findByText('My MCP app');
    fireEvent.click(getByTestId('expandRow-client-a'));
    await findByText('Laptop session');

    const inlineEdit = getByTestId('inlineEditConnectionName-conn-1');
    fireEvent.click(within(inlineEdit).getByTestId('euiInlineReadModeButton'));

    const input = await findByTestId('inlineEditConnectionNameInput-conn-1');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(getByTestId('inlineEditConnectionNameSave-conn-1'));

    expect(await findByText(/Connection name cannot be empty/)).toBeInTheDocument();
    expect(coreStart.http.patch).not.toHaveBeenCalled();
  });

  it('blocks the inline rename when the name exceeds the max length', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [{ id: 'client-a', client_name: 'My MCP app', resource: 'cluster:elastic' }],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
          },
        ],
      },
    });

    const { findByText, findByTestId, getByTestId } = renderPage(coreStart);

    await findByText('My MCP app');
    fireEvent.click(getByTestId('expandRow-client-a'));
    await findByText('Laptop session');

    const inlineEdit = getByTestId('inlineEditConnectionName-conn-1');
    fireEvent.click(within(inlineEdit).getByTestId('euiInlineReadModeButton'));

    const input = await findByTestId('inlineEditConnectionNameInput-conn-1');
    fireEvent.change(input, { target: { value: 'a'.repeat(129) } });
    fireEvent.click(getByTestId('inlineEditConnectionNameSave-conn-1'));

    expect(await findByText(/Connection name must be 128 characters or fewer/)).toBeInTheDocument();
    expect(coreStart.http.patch).not.toHaveBeenCalled();
  });

  it('renders the view mode toggle in the search bar with "Group by client" selected by default', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [{ id: 'client-a', client_name: 'My MCP app', resource: 'cluster:elastic' }],
      },
      connections: {
        connections: [{ id: 'conn-1', client_id: 'client-a', resource: 'cluster:elastic' }],
      },
    });

    const { findByTestId, queryByTestId } = renderPage(coreStart);

    const toggle = await findByTestId('applicationConnectionsViewModeToggle');
    expect(toggle).toBeInTheDocument();
    expect(within(toggle).getByTestId('applicationConnectionsViewModeGrouped')).toBeInTheDocument();
    expect(within(toggle).getByTestId('applicationConnectionsViewModeList')).toBeInTheDocument();
    expect(await findByTestId('applicationConnectionsInMemoryTable')).toBeInTheDocument();
    expect(queryByTestId('applicationConnectionsListView')).not.toBeInTheDocument();
  });

  it('switches to the flat list view when the user clicks "List view"', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [
          { id: 'client-a', client_name: 'My MCP app', resource: 'cluster:elastic' },
          { id: 'client-b', client_name: 'Other MCP app', resource: 'cluster:elastic' },
        ],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
            creation: '2026-04-10T10:00:00.000Z',
          },
          {
            id: 'conn-2',
            client_id: 'client-b',
            name: 'Phone session',
            resource: 'cluster:elastic',
            creation: '2026-04-11T10:00:00.000Z',
          },
        ],
      },
    });

    const { findByText, findByTestId, queryByTestId, getByTestId } = renderPage(coreStart);

    expect(await findByText('My MCP app')).toBeInTheDocument();
    expect(queryByTestId('applicationConnectionsListView')).not.toBeInTheDocument();

    fireEvent.click(getByTestId('applicationConnectionsViewModeList'));

    expect(await findByTestId('applicationConnectionsListView')).toBeInTheDocument();
    expect(await findByTestId('applicationConnectionsListViewRow-conn-1')).toBeInTheDocument();
    expect(await findByTestId('applicationConnectionsListViewRow-conn-2')).toBeInTheDocument();
    expect(queryByTestId('applicationConnectionsInMemoryTable')).not.toBeInTheDocument();
  });

  it('shows the bulk revoke toolbar when a row is selected in the list view', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [{ id: 'client-a', client_name: 'My MCP app', resource: 'cluster:elastic' }],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
            creation: '2026-04-10T10:00:00.000Z',
          },
        ],
      },
    });

    const { findByText, findByTestId, getByTestId, queryByTestId } = renderPage(coreStart);

    await findByText('My MCP app');
    fireEvent.click(getByTestId('applicationConnectionsViewModeList'));

    const listView = await findByTestId('applicationConnectionsListView');
    await within(listView).findByText('Laptop session');
    expect(queryByTestId('applicationConnectionsBulkRevokeButton')).not.toBeInTheDocument();

    const rowCheckbox = within(listView).getByLabelText(/Select connection 'Laptop session'/);
    fireEvent.click(rowCheckbox);

    expect(await findByTestId('applicationConnectionsBulkRevokeButton')).toHaveTextContent(
      'Revoke 1 connection'
    );
  });

  it('clears the bulk selection after a fully successful bulk revoke', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [{ id: 'client-a', client_name: 'My MCP app', resource: 'cluster:elastic' }],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
          },
          {
            id: 'conn-2',
            client_id: 'client-a',
            name: 'Phone session',
            resource: 'cluster:elastic',
          },
        ],
      },
    });
    coreStart.http.post.mockResolvedValue({
      results: [
        { client_id: 'client-a', connection_id: 'conn-1', status: 'revoked' },
        { client_id: 'client-a', connection_id: 'conn-2', status: 'revoked' },
      ],
    });

    const { findByText, findByTestId, getByTestId, queryByTestId } = renderPage(coreStart);

    await findByText('My MCP app');
    fireEvent.click(getByTestId('expandRow-client-a'));
    const innerTable = await findByTestId('applicationConnectionsChildTable-client-a');

    fireEvent.click(within(innerTable).getByLabelText(/Select connection 'Laptop session'/));
    fireEvent.click(within(innerTable).getByLabelText(/Select connection 'Phone session'/));

    expect(await findByTestId('applicationConnectionsBulkRevokeButton')).toHaveTextContent(
      'Revoke 2 connections'
    );

    fireEvent.click(getByTestId('applicationConnectionsBulkRevokeButton'));
    const modal = await findByTestId('applicationConnectionsRevokeModal');
    fireEvent.click(within(modal).getByTestId('applicationConnectionsRevokeConfirmButton'));

    await waitFor(() => {
      expect(queryByTestId('applicationConnectionsBulkRevokeButton')).not.toBeInTheDocument();
    });
  });

  it('keeps only the failed connections selected after a partially successful bulk revoke', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [{ id: 'client-a', client_name: 'My MCP app', resource: 'cluster:elastic' }],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'cluster:elastic',
          },
          {
            id: 'conn-2',
            client_id: 'client-a',
            name: 'Phone session',
            resource: 'cluster:elastic',
          },
        ],
      },
    });
    coreStart.http.post.mockResolvedValue({
      results: [
        { client_id: 'client-a', connection_id: 'conn-1', status: 'revoked' },
        {
          client_id: 'client-a',
          connection_id: 'conn-2',
          status: 'error',
          status_code: 500,
          message: 'boom',
        },
      ],
    });

    const { findByText, findByTestId, getByTestId } = renderPage(coreStart);

    await findByText('My MCP app');
    fireEvent.click(getByTestId('expandRow-client-a'));
    const innerTable = await findByTestId('applicationConnectionsChildTable-client-a');

    fireEvent.click(within(innerTable).getByLabelText(/Select connection 'Laptop session'/));
    fireEvent.click(within(innerTable).getByLabelText(/Select connection 'Phone session'/));

    expect(await findByTestId('applicationConnectionsBulkRevokeButton')).toHaveTextContent(
      'Revoke 2 connections'
    );

    fireEvent.click(getByTestId('applicationConnectionsBulkRevokeButton'));
    const modal = await findByTestId('applicationConnectionsRevokeModal');
    fireEvent.click(within(modal).getByTestId('applicationConnectionsRevokeConfirmButton'));

    await waitFor(() => {
      expect(getByTestId('applicationConnectionsBulkRevokeButton')).toHaveTextContent(
        'Revoke 1 connection'
      );
    });
  });

  it('opens the client details flyout when the client name is clicked in the list view', async () => {
    setupHttpResponses(coreStart, {
      clients: {
        clients: [
          {
            id: 'client-a',
            client_name: 'My MCP app',
            resource: 'https://cluster.example.com',
          },
        ],
      },
      connections: {
        connections: [
          {
            id: 'conn-1',
            client_id: 'client-a',
            name: 'Laptop session',
            resource: 'https://cluster.example.com',
          },
        ],
      },
    });

    const { findByText, findByTestId, getByTestId } = renderPage(coreStart);

    await findByText('My MCP app');
    fireEvent.click(getByTestId('applicationConnectionsViewModeList'));

    const listView = await findByTestId('applicationConnectionsListView');
    const link = await within(listView).findByTestId('viewClientDetailsLink-client-a');
    fireEvent.click(link);

    const flyout = await findByTestId('mcpClientDetailsFlyout');
    expect(within(flyout).getByText('My MCP app')).toBeInTheDocument();
    expect(within(flyout).getByText('client-a')).toBeInTheDocument();
    expect(
      within(flyout).getByText('https://cluster.example.com/api/agent_builder/mcp')
    ).toBeInTheDocument();
  });
});
