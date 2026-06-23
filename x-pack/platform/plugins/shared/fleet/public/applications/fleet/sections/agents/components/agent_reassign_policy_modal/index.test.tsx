/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { act, fireEvent, waitFor } from '@testing-library/react';

import { createFleetTestRendererMock } from '../../../../../../mock';

import {
  sendPostAgentReassign,
  sendPostBulkAgentReassign,
  useGetAgentPolicies,
  useStartServices,
} from '../../../../hooks';

import { AgentReassignAgentPolicyModal } from '.';

const mockAddSuccess = jest.fn();
const mockAddError = jest.fn();

jest.mock('../../../../hooks', () => ({
  ...jest.requireActual('../../../../hooks'),
  sendPostAgentReassign: jest.fn(),
  sendPostBulkAgentReassign: jest.fn(),
  useGetAgentPolicies: jest.fn(),
  useStartServices: jest.fn().mockReturnValue({
    notifications: {
      toasts: {
        addSuccess: jest.fn(),
        addError: jest.fn(),
      },
    },
  }),
}));

jest.mock('../../../../components', () => ({
  AgentPolicyPackageBadges: () => null,
}));

const mockSendPostAgentReassign = sendPostAgentReassign as jest.Mock;
const mockSendPostBulkAgentReassign = sendPostBulkAgentReassign as jest.Mock;
const mockUseGetAgentPolicies = useGetAgentPolicies as jest.Mock;
const mockUseStartServices = useStartServices as jest.Mock;

const POLICY_A = { id: 'policy-a', name: 'Policy A', is_managed: false };
const POLICY_B = { id: 'policy-b', name: 'Policy B', is_managed: false };

function mockPolicies(policies = [POLICY_A, POLICY_B]) {
  mockUseGetAgentPolicies.mockReturnValue({
    isLoading: false,
    data: { items: policies },
  });
}

function render(props: { agents: any; onClose?: () => void }) {
  const renderer = createFleetTestRendererMock();
  const onClose = props.onClose ?? jest.fn();
  const utils = renderer.render(
    <AgentReassignAgentPolicyModal onClose={onClose} agents={props.agents} />
  );
  return { utils, onClose };
}

describe('AgentReassignAgentPolicyModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPolicies();
    mockUseStartServices.mockReturnValue({
      notifications: {
        toasts: {
          addSuccess: mockAddSuccess,
          addError: mockAddError,
        },
      },
    });
  });

  describe('single agent', () => {
    const singleAgent = [{ id: 'agent-1', policy_id: 'policy-a' } as any];

    it('confirm button is disabled when the same policy is already selected', () => {
      const { utils } = render({ agents: singleAgent });

      // policy-a is pre-selected (matches agent's current policy) — button must be disabled
      expect(utils.getByTestId('confirmModalConfirmButton')).toBeDisabled();
    });

    it('calls sendPostAgentReassign when a different policy is selected', async () => {
      mockSendPostAgentReassign.mockResolvedValue({});
      const { utils } = render({ agents: singleAgent });

      const combobox = utils.getByRole('combobox');
      act(() => {
        fireEvent.change(combobox, { target: { value: 'Policy B' } });
      });
      const optionB = await utils.findByText('Policy B');
      act(() => {
        fireEvent.click(optionB);
      });

      act(() => {
        fireEvent.click(utils.getByTestId('confirmModalConfirmButton'));
      });

      await waitFor(() => {
        expect(mockSendPostAgentReassign).toHaveBeenCalledWith('agent-1', {
          policy_id: 'policy-b',
        });
      });
      expect(mockSendPostBulkAgentReassign).not.toHaveBeenCalled();
    });

    it('shows success toast with single-agent copy', async () => {
      mockSendPostAgentReassign.mockResolvedValue({});
      const { utils } = render({ agents: singleAgent });

      const combobox = utils.getByRole('combobox');
      act(() => {
        fireEvent.change(combobox, { target: { value: 'Policy B' } });
      });
      const optionB = await utils.findByText('Policy B');
      act(() => {
        fireEvent.click(optionB);
      });

      act(() => {
        fireEvent.click(utils.getByTestId('confirmModalConfirmButton'));
      });

      await waitFor(() => {
        expect(mockAddSuccess).toHaveBeenCalledWith('Reassigning agent policy');
      });
    });

    it('shows error toast when request fails', async () => {
      mockSendPostAgentReassign.mockResolvedValue({ error: new Error('Network error') });
      const { utils } = render({ agents: singleAgent });

      const combobox = utils.getByRole('combobox');
      act(() => {
        fireEvent.change(combobox, { target: { value: 'Policy B' } });
      });
      const optionB = await utils.findByText('Policy B');
      act(() => {
        fireEvent.click(optionB);
      });

      act(() => {
        fireEvent.click(utils.getByTestId('confirmModalConfirmButton'));
      });

      await waitFor(() => {
        expect(mockAddError).toHaveBeenCalled();
      });
    });
  });

  describe('bulk — agent array', () => {
    const bulkAgents = [
      { id: 'agent-1', policy_id: 'policy-a' } as any,
      { id: 'agent-2', policy_id: 'policy-a' } as any,
    ];

    it('calls sendPostBulkAgentReassign with agent ids and selected policy', async () => {
      mockSendPostBulkAgentReassign.mockResolvedValue({});
      const { utils, onClose } = render({ agents: bulkAgents });

      act(() => {
        fireEvent.click(utils.getByTestId('confirmModalConfirmButton'));
      });

      await waitFor(() => {
        expect(mockSendPostBulkAgentReassign).toHaveBeenCalledWith(
          expect.objectContaining({
            policy_id: POLICY_A.id,
            agents: ['agent-1', 'agent-2'],
            includeInactive: true,
          })
        );
      });
      expect(mockSendPostAgentReassign).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('shows "in progress" success toast for bulk agent array', async () => {
      mockSendPostBulkAgentReassign.mockResolvedValue({});
      const { utils } = render({ agents: bulkAgents });

      act(() => {
        fireEvent.click(utils.getByTestId('confirmModalConfirmButton'));
      });

      await waitFor(() => {
        expect(mockAddSuccess).toHaveBeenCalledWith('Agent policy reassignment in progress');
      });
    });
  });

  describe('bulk — kuery string', () => {
    const kuery = 'policy_id:policy-a';

    it('passes the kuery string directly to sendPostBulkAgentReassign', async () => {
      mockSendPostBulkAgentReassign.mockResolvedValue({});
      const { utils } = render({ agents: kuery });

      act(() => {
        fireEvent.click(utils.getByTestId('confirmModalConfirmButton'));
      });

      await waitFor(() => {
        expect(mockSendPostBulkAgentReassign).toHaveBeenCalledWith(
          expect.objectContaining({
            agents: kuery,
            includeInactive: true,
          })
        );
      });
    });

    it('shows "in progress" success toast for kuery-based bulk reassignment', async () => {
      mockSendPostBulkAgentReassign.mockResolvedValue({});
      const { utils } = render({ agents: kuery });

      act(() => {
        fireEvent.click(utils.getByTestId('confirmModalConfirmButton'));
      });

      await waitFor(() => {
        expect(mockAddSuccess).toHaveBeenCalledWith('Agent policy reassignment in progress');
      });
    });

    it('does not use single-agent path for kuery string', async () => {
      mockSendPostBulkAgentReassign.mockResolvedValue({});
      const { utils } = render({ agents: kuery });

      act(() => {
        fireEvent.click(utils.getByTestId('confirmModalConfirmButton'));
      });

      await waitFor(() => {
        expect(mockSendPostBulkAgentReassign).toHaveBeenCalled();
      });
      expect(mockSendPostAgentReassign).not.toHaveBeenCalled();
    });
  });
});
