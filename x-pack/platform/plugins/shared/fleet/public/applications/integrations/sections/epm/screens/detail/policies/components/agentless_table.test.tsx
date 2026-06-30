/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { fireEvent, act, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';

import { AGENTS_PREFIX } from '../../../../../../../../../common/constants';
import { sendGetAgents } from '../../../../../../hooks';
// The flyout imports sendGetAgents directly from the top-level public/hooks barrel,
// which is a different Jest module instance than the integrations hooks barrel the
// table uses. Import + mock it separately so we can assert the flyout's own agent lookup.
import { sendGetAgents as sendGetAgentsFromFlyout } from '../../../../../../../../hooks';
import { createIntegrationsTestRendererMock } from '../../../../../../../../mock';

import { AgentlessPackagePoliciesTable } from './agentless_table';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: jest.fn(),
}));

jest.mock('../../../../../../hooks', () => ({
  ...jest.requireActual('../../../../../../hooks'),
  useConfirmForceInstall: jest.fn(),
  sendGetAgents: jest.fn(),
}));

jest.mock('../../../../../../../../hooks', () => ({
  ...jest.requireActual('../../../../../../../../hooks'),
  sendGetAgents: jest.fn(),
}));

const mockUseLocation = useLocation as jest.MockedFunction<typeof useLocation>;

describe('AgentlessPackagePoliciesTable', () => {
  const mockSendGetAgents = sendGetAgents as jest.MockedFunction<typeof sendGetAgents>;
  const mockSendGetAgentsFromFlyout = sendGetAgentsFromFlyout as jest.MockedFunction<
    typeof sendGetAgentsFromFlyout
  >;

  beforeEach(() => {
    mockUseLocation.mockReturnValue({
      pathname: '/',
      search: '',
      hash: '',
      state: undefined,
    });

    // The flyout polls for its enrolled agent; return an empty result so it keeps
    // rendering its header without resolving to a healthy agent.
    mockSendGetAgentsFromFlyout.mockResolvedValue({
      data: { items: [], total: 0, page: 1, perPage: 20 },
      error: null,
    });

    mockSendGetAgents.mockResolvedValue({
      data: {
        items: [
          {
            policy_id: 'policy1',
            id: 'agent1',
            packages: ['package'],
            type: 'PERMANENT',
            active: true,
            enrolled_at: '2023-01-01T00:00:00Z',
            local_metadata: {},
            status: 'online',
          },
        ],
        total: 1,
        page: 1,
        perPage: 10000,
      },
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const defaultProps = {
    isLoading: false,
    packagePolicies: [
      {
        agentPolicies: [
          {
            id: 'policy1',
            name: 'Policy 1',
            status: 'active' as const,
            is_managed: false,
            updated_at: '2023-01-01T00:00:00Z',
            updated_by: 'user1',
            namespace: 'default',
            monitoring_enabled: [],
            revision: 1,
            is_protected: false,
          },
        ],
        packagePolicy: {
          id: 'packagePolicy1',
          name: 'Package Policy 1',
          updated_by: 'user1',
          updated_at: '2023-01-01T00:00:00Z',
          inputs: [],
          policy_id: 'policy1',
          namespace: 'default',
          enabled: true,
          package: {
            name: 'package',
            title: 'Package',
            version: '1.0.0',
          },
          hasUpgrade: false,
          revision: 1,
          created_at: '2023-01-01T00:00:00Z',
          created_by: 'user1',
          policy_ids: ['policy1'],
        },
        rowIndex: 0,
      },
    ],
    packagePoliciesTotal: 1,
    refreshPackagePolicies: jest.fn(),
    pagination: {
      pagination: { currentPage: 1, pageSize: 10 },
      setPagination: jest.fn(),
      pageSizeOptions: [10, 20, 50],
    },
  };

  it('shows loading message when isLoading is true', async () => {
    const renderer = createIntegrationsTestRendererMock();
    const result = renderer.render(
      <AgentlessPackagePoliciesTable {...defaultProps} packagePolicies={[]} isLoading={true} />
    );
    await act(async () => {
      expect(result.getByText('Loading integration policies…')).toBeInTheDocument();
    });
  });

  it('shows no items message when there are no package policies', async () => {
    const renderer = createIntegrationsTestRendererMock();
    const result = renderer.render(
      <AgentlessPackagePoliciesTable {...defaultProps} packagePolicies={[]} />
    );
    await act(async () => {
      expect(result.getByText('No agentless integration policies')).toBeInTheDocument();
    });
  });

  it('renders the table with package policies', async () => {
    const renderer = createIntegrationsTestRendererMock();
    const result = renderer.render(<AgentlessPackagePoliciesTable {...defaultProps} />);

    await act(async () => {
      expect(result.getByText('Package Policy 1')).toBeInTheDocument();
      expect(result.getByText('user1')).toBeInTheDocument();
    });
  });

  it('displays agent health status when agents are loaded', async () => {
    const renderer = createIntegrationsTestRendererMock();
    const result = renderer.render(<AgentlessPackagePoliciesTable {...defaultProps} />);
    await waitFor(() => {
      expect(mockSendGetAgents).toHaveBeenCalledWith({
        perPage: 10000,
        kuery: `${AGENTS_PREFIX}.policy_id: "policy1"`,
      });
    });
    expect(await result.findByText('Healthy')).toBeInTheDocument();
  });

  it('opens flyout when status badge is clicked', async () => {
    const renderer = createIntegrationsTestRendererMock();
    const result = renderer.render(<AgentlessPackagePoliciesTable {...defaultProps} />);
    await waitFor(() => {
      expect(mockSendGetAgents).toHaveBeenCalledWith({
        perPage: 10000,
        kuery: `${AGENTS_PREFIX}.policy_id: "policy1"`,
      });
    });
    await act(async () => {
      fireEvent.click(await result.findByText('Healthy'));
    });
    expect(result.getByText('Confirm agentless enrollment')).toBeInTheDocument();
  });

  it('opens flyout when openEnrollmentFlyout query param matches a package policy id', async () => {
    mockUseLocation.mockReturnValue({
      pathname: '/',
      search: '?openEnrollmentFlyout=packagePolicy1',
      hash: '',
      state: undefined,
    });
    const renderer = createIntegrationsTestRendererMock();
    const result = renderer.render(<AgentlessPackagePoliciesTable {...defaultProps} />);
    await waitFor(() => {
      expect(result.getByText('Confirm agentless enrollment')).toBeInTheDocument();
    });
  });

  it('does not open flyout when openEnrollmentFlyout query param does not match any policy', async () => {
    mockUseLocation.mockReturnValue({
      pathname: '/',
      search: '?openEnrollmentFlyout=nonexistent-id',
      hash: '',
      state: undefined,
    });
    const renderer = createIntegrationsTestRendererMock();
    const result = renderer.render(<AgentlessPackagePoliciesTable {...defaultProps} />);
    await waitFor(() => {
      expect(mockSendGetAgents).toHaveBeenCalled();
    });
    expect(result.queryByText('Confirm agentless enrollment')).not.toBeInTheDocument();
  });
});
