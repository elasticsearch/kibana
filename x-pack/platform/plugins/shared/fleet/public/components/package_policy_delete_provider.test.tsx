/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { fireEvent, waitFor } from '@testing-library/react';

import { EuiContextMenuItem } from '@elastic/eui';

import type { AgentPolicy, PackagePolicy, PackagePolicyPackage } from '../types';
import { createIntegrationsTestRendererMock } from '../mock';

import { sendGetAgents, useMultipleAgentPolicies } from '../hooks';

import { PackagePolicyDeleteProvider } from './package_policy_delete_provider';

jest.mock('../hooks', () => {
  const mutateAsyncMock = jest.fn().mockResolvedValue({ data: [] });

  return {
    ...jest.requireActual('../hooks'),
    useMultipleAgentPolicies: jest.fn(),
    useStartServices: jest.fn().mockReturnValue({
      notifications: {
        toasts: { addSuccess: jest.fn(), addDanger: jest.fn() },
      },
    }),
    sendGetAgents: jest.fn(),
    useConfig: jest.fn().mockReturnValue({
      agents: { enabled: true },
    }),
    useDeletePackagePolicyMutation: jest.fn().mockReturnValue({ mutateAsync: mutateAsyncMock }),
    sendDeleteAgentPolicy: jest.fn().mockResolvedValue({ data: [] }),
  };
});

const useMultipleAgentPoliciesMock = useMultipleAgentPolicies as jest.MockedFunction<
  typeof useMultipleAgentPolicies
>;
const sendGetAgentsMock = sendGetAgents as jest.MockedFunction<typeof sendGetAgents>;

function renderMenu({
  agentPolicies,
  packagePolicyIds,
  packagePolicyPackage,
}: {
  agentPolicies: AgentPolicy[];
  packagePolicyIds: string[];
  packagePolicyPackage?: PackagePolicyPackage;
}) {
  const renderer = createIntegrationsTestRendererMock();

  const utils = renderer.render(
    <PackagePolicyDeleteProvider
      agentPolicies={agentPolicies}
      packagePolicyPackage={packagePolicyPackage}
    >
      {(deletePackagePoliciesPrompt) => {
        return (
          <EuiContextMenuItem
            onClick={() => {
              deletePackagePoliciesPrompt(packagePolicyIds, () => {});
            }}
            data-test-subj="deleteIntegrationBtn"
          >
            Delete integration
          </EuiContextMenuItem>
        );
      }}
    </PackagePolicyDeleteProvider>
  );

  return { utils };
}

function createMockAgentPolicies(
  props: Partial<AgentPolicy> = {},
  multiple?: boolean
): AgentPolicy[] {
  if (!multiple) {
    return [
      {
        id: 'some-uuid1',
        namespace: 'default',
        monitoring_enabled: [],
        name: 'Test Policy',
        description: '',
        is_preconfigured: false,
        status: 'active',
        is_managed: false,
        revision: 1,
        updated_at: '',
        updated_by: 'elastic',
        package_policies: [
          { name: 'integration-0001' } as PackagePolicy,
          { name: 'integration-0002' } as PackagePolicy,
        ],
        is_protected: false,
        ...props,
      },
    ];
  } else {
    return [
      {
        id: 'some-uuid1',
        namespace: 'default',
        monitoring_enabled: [],
        name: 'Test Policy 1',
        description: '',
        is_preconfigured: false,
        status: 'active',
        is_managed: false,
        revision: 1,
        updated_at: '',
        updated_by: 'elastic',
        package_policies: [],
        is_protected: false,
        ...props,
      },
      {
        id: 'some-uuid2',
        namespace: 'default',
        monitoring_enabled: [],
        name: 'Test Policy 2',
        description: '',
        is_preconfigured: false,
        status: 'active',
        is_managed: false,
        revision: 1,
        updated_at: '',
        updated_by: 'elastic',
        package_policies: [
          { name: 'integration-0001' } as PackagePolicy,
          { name: 'integration-0002' } as PackagePolicy,
        ],
        is_protected: false,
        ...props,
      },
    ];
  }
}

describe('PackagePolicyDeleteProvider', () => {
  it('Should show delete integrations action and cancel modal', async () => {
    useMultipleAgentPoliciesMock.mockReturnValue({ canUseMultipleAgentPolicies: false });
    sendGetAgentsMock.mockResolvedValue({
      data: {
        statusSummary: {},
        items: [
          {
            id: 'agent123',
            policy_id: 'agent-policy-1',
          },
        ],
        total: 5,
      },
    } as any);
    const agentPolicies = createMockAgentPolicies();
    const { utils } = renderMenu({
      agentPolicies,
      packagePolicyIds: ['integration-0001'],
    });
    const button = utils.getByTestId('deleteIntegrationBtn');
    fireEvent.click(button);
    await waitFor(() => {
      const calloutText = utils.getByTestId('affectedAgentsCallOut').textContent;
      expect(calloutText).toContain('This action will affect 5 agents.');
      expect(calloutText).toContain('is already in use by some of your agents');
      expect(utils.getByTestId('confirmModalBodyText').textContent).toContain(
        'This action can not be undone. Are you sure you wish to continue?'
      );
    });
  });

  it('When multiple agent policies are present and agents are enrolled show additional warnings', async () => {
    sendGetAgentsMock.mockResolvedValue({
      data: {
        statusSummary: {},
        items: [
          {
            id: 'agent123',
            policy_id: 'agent-policy-1',
          },
        ],
        total: 5,
      },
    } as any);
    useMultipleAgentPoliciesMock.mockReturnValue({ canUseMultipleAgentPolicies: true });
    const agentPolicies = createMockAgentPolicies(undefined, true);
    const { utils } = renderMenu({
      agentPolicies,
      packagePolicyIds: ['integration-0001'],
    });
    const button = utils.getByTestId('deleteIntegrationBtn');
    fireEvent.click(button);

    await waitFor(() => {
      const calloutText = utils.getByTestId('affectedAgentsCallOut').textContent;
      expect(calloutText).toContain('This action will affect 5 agents.');
      expect(utils.getByTestId('sharedAgentPolicyCallOut').textContent).toContain(
        'This integration is shared by multiple agent policies.'
      );
      expect(utils.getByTestId('confirmModalBodyText').textContent).toContain(
        'This action can not be undone. Are you sure you wish to continue?'
      );
    });
  });

  it('When multiple agent policies are present and no agents are enrolled show additional warnings', async () => {
    sendGetAgentsMock.mockResolvedValue({
      data: {
        statusSummary: {},
        items: [],
        total: 0,
      },
    } as any);
    useMultipleAgentPoliciesMock.mockReturnValue({ canUseMultipleAgentPolicies: true });
    const agentPolicies = createMockAgentPolicies(undefined, true);
    const { utils } = renderMenu({
      agentPolicies,
      packagePolicyIds: ['integration-0001'],
    });
    const button = utils.getByTestId('deleteIntegrationBtn');
    fireEvent.click(button);

    await waitFor(() => {
      expect(utils.queryByTestId('affectedAgentsCallOut')).not.toBeInTheDocument();
      expect(utils.getByTestId('sharedAgentPolicyCallOut').textContent).toContain(
        'This integration is shared by multiple agent policies.'
      );
      expect(utils.getByTestId('confirmModalBodyText').textContent).toContain(
        'This action can not be undone. Are you sure you wish to continue?'
      );
    });
  });

  it('When agentless should show a different set of warnings', async () => {
    useMultipleAgentPoliciesMock.mockReturnValue({ canUseMultipleAgentPolicies: false });
    sendGetAgentsMock.mockResolvedValue({
      data: {
        statusSummary: {},
        items: [
          {
            id: 'agent123',
            policy_id: 'agent-policy-1',
          },
        ],
        total: 5,
      },
    } as any);
    const agentPolicies = createMockAgentPolicies({ supports_agentless: true });
    const { utils } = renderMenu({
      agentPolicies,
      packagePolicyIds: ['integration-0001'],
    });
    const button = utils.getByTestId('deleteIntegrationBtn');
    fireEvent.click(button);

    await waitFor(() => {
      expect(utils.getByTestId('affectedAgentsCallOut').textContent).not.toContain(
        'This action will affect 5 agents.'
      );
      expect(utils.getByTestId('confirmModalBodyText').textContent).toContain(
        'This action can not be undone. Are you sure you wish to continue?'
      );
      expect(utils.getByTestId('confirmModalTitleText').textContent).toContain(
        'about to delete an integration'
      );
    });
  });

  it('When deleting the Fleet Server integration show a specific warning', async () => {
    useMultipleAgentPoliciesMock.mockReturnValue({ canUseMultipleAgentPolicies: false });
    sendGetAgentsMock.mockResolvedValue({
      data: { statusSummary: {}, items: [], total: 0 },
    } as any);
    const agentPolicies = createMockAgentPolicies();
    const { utils } = renderMenu({
      agentPolicies,
      packagePolicyIds: ['integration-0001'],
      packagePolicyPackage: { name: 'fleet_server' } as PackagePolicyPackage,
    });
    const button = utils.getByTestId('deleteIntegrationBtn');
    fireEvent.click(button);

    await waitFor(() => {
      expect(utils.getByTestId('fleetServerDeleteCallOut').textContent).toContain(
        'will lose their connection to Fleet'
      );
    });
  });

  it('Shows the Fleet Server warning even when multiple agent policies are present', async () => {
    useMultipleAgentPoliciesMock.mockReturnValue({ canUseMultipleAgentPolicies: true });
    sendGetAgentsMock.mockResolvedValue({
      data: { statusSummary: {}, items: [], total: 0 },
    } as any);
    const agentPolicies = createMockAgentPolicies(undefined, true);
    const { utils } = renderMenu({
      agentPolicies,
      packagePolicyIds: ['integration-0001'],
      packagePolicyPackage: { name: 'fleet_server' } as PackagePolicyPackage,
    });
    const button = utils.getByTestId('deleteIntegrationBtn');
    fireEvent.click(button);

    await waitFor(() => {
      expect(utils.getByTestId('fleetServerDeleteCallOut')).toBeInTheDocument();
      expect(utils.getByTestId('sharedAgentPolicyCallOut')).toBeInTheDocument();
    });
  });

  it('Does not show the Fleet Server warning when deleting a non-Fleet Server integration', async () => {
    useMultipleAgentPoliciesMock.mockReturnValue({ canUseMultipleAgentPolicies: false });
    sendGetAgentsMock.mockResolvedValue({
      data: { statusSummary: {}, items: [], total: 0 },
    } as any);
    const agentPolicies = createMockAgentPolicies();
    const { utils } = renderMenu({
      agentPolicies,
      packagePolicyIds: ['integration-0001'],
      packagePolicyPackage: { name: 'nginx' } as PackagePolicyPackage,
    });
    const button = utils.getByTestId('deleteIntegrationBtn');
    fireEvent.click(button);

    await waitFor(() => {
      expect(utils.getByTestId('confirmModalBodyText')).toBeInTheDocument();
    });
    expect(utils.queryByTestId('fleetServerDeleteCallOut')).not.toBeInTheDocument();
  });
});
