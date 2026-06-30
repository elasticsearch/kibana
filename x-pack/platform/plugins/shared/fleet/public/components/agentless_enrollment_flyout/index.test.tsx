/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { waitFor } from '@testing-library/react';

import { sendGetAgents, useGetPackageInfoByKeyQuery } from '../../hooks';
import { usePollingIncomingData } from '../agent_enrollment_flyout/use_get_agent_incoming_data';
import { createIntegrationsTestRendererMock } from '../../mock';

import { AGENTS_PREFIX } from '../../constants';

import { AgentlessEnrollmentFlyout } from '.';

jest.mock('../../hooks', () => ({
  ...jest.requireActual('../../hooks'),
  useGetPackageInfoByKeyQuery: jest.fn(),
  sendGetAgents: jest.fn(),
}));

jest.mock('../agent_enrollment_flyout/use_get_agent_incoming_data', () => ({
  usePollingIncomingData: jest.fn(),
}));

const mockSendGetAgents = sendGetAgents as jest.Mock;
const mockUseGetPackageInfoByKeyQuery = useGetPackageInfoByKeyQuery as jest.Mock;
const mockUsePollingIncomingData = usePollingIncomingData as jest.Mock;

// FLAKY: https://github.com/elastic/kibana/issues/201738
describe.skip('AgentlessEnrollmentFlyout', () => {
  const onClose = jest.fn();
  const flyoutProps = {
    onClose,
    policyId: 'test-policy-id',
    policyName: 'test-package-policy',
    packageInfo: { name: 'test-package', version: '1.0.0' },
  };

  beforeEach(() => {
    mockSendGetAgents.mockResolvedValue({ data: { items: [] } });
    mockUseGetPackageInfoByKeyQuery.mockReturnValue({ data: { item: { title: 'Test Package' } } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the flyout with initial loading state', async () => {
    const renderer = createIntegrationsTestRendererMock();
    const { getByText } = renderer.render(<AgentlessEnrollmentFlyout {...flyoutProps} />);
    await waitFor(async () => {
      expect(getByText('Confirm agentless enrollment')).toBeInTheDocument();
      expect(getByText('Step 1 is loading')).toBeInTheDocument();
      expect(
        getByText('Listening for agentless connection... this could take several minutes')
      ).toBeInTheDocument();
      expect(getByText('Confirm incoming data')).toBeInTheDocument();
      expect(getByText('Step 2 is disabled')).toBeInTheDocument();
    });
  });

  it('updates step statuses when agent deployment fails', async () => {
    const renderer = createIntegrationsTestRendererMock();
    const agentData = { status: 'error' };
    mockSendGetAgents.mockResolvedValueOnce({ data: { items: [agentData] } });

    const { getByText } = renderer.render(<AgentlessEnrollmentFlyout {...flyoutProps} />);

    await waitFor(() => {
      expect(getByText('Confirm agentless enrollment')).toBeInTheDocument();
      expect(getByText('Step 1 has errors')).toBeInTheDocument();
      expect(getByText('Agentless deployment failed')).toBeInTheDocument();
      expect(getByText('Confirm incoming data')).toBeInTheDocument();
      expect(getByText('Step 2 is disabled')).toBeInTheDocument();
    });
  });

  it('fetches agents data on mount and sets step statuses when agent deployment succeeds', async () => {
    const renderer = createIntegrationsTestRendererMock();
    const agentData = { status: 'online' };
    mockSendGetAgents.mockResolvedValueOnce({ data: { items: [agentData] } });
    mockUsePollingIncomingData.mockReturnValue({ incomingData: [], hasReachedTimeout: false });

    const { getByText } = renderer.render(<AgentlessEnrollmentFlyout {...flyoutProps} />);

    await waitFor(() => {
      expect(mockSendGetAgents).toHaveBeenCalledWith({
        kuery: `${AGENTS_PREFIX}.policy_id: "test-policy-id"`,
      });
      expect(getByText('Confirm agentless enrollment')).toBeInTheDocument();
      expect(getByText('Step 1 is complete')).toBeInTheDocument();
      expect(getByText('Agentless deployment was successful')).toBeInTheDocument();
      expect(getByText('Confirm incoming data')).toBeInTheDocument();
      expect(getByText('Step 2 is loading')).toBeInTheDocument();
    });
  });

  it('shows confirm data step as failed when timeout has been reached', async () => {
    const renderer = createIntegrationsTestRendererMock();
    mockSendGetAgents.mockResolvedValueOnce({ data: { items: [{ status: 'online' }] } });
    mockUsePollingIncomingData.mockReturnValue({ incomingData: [], hasReachedTimeout: true });

    const { getByText } = renderer.render(<AgentlessEnrollmentFlyout {...flyoutProps} />);

    await waitFor(() => {
      expect(getByText('Step 1 is complete')).toBeInTheDocument();
      expect(getByText('Confirm incoming data')).toBeInTheDocument();
      expect(getByText('Step 2 has errors')).toBeInTheDocument();
      expect(getByText('No incoming data received from agentless integration')).toBeInTheDocument();
    });
  });

  it('shows confirm data step as successful when incoming data is received', async () => {
    const renderer = createIntegrationsTestRendererMock();
    mockSendGetAgents.mockResolvedValueOnce({ data: { items: [{ status: 'online' }] } });
    mockUsePollingIncomingData.mockReturnValue({ incomingData: [{ data: 'test-data' }] });

    const { getByText } = renderer.render(<AgentlessEnrollmentFlyout {...flyoutProps} />);

    await waitFor(() => {
      expect(getByText('Step 1 is complete')).toBeInTheDocument();
      expect(getByText('Confirm incoming data')).toBeInTheDocument();
      expect(getByText('Step 2 is complete')).toBeInTheDocument();
      expect(getByText('Incoming data received from agentless integration')).toBeInTheDocument();
    });
  });
});
