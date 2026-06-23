/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { AgentType, AgentAccessControlMode } from '@kbn/agent-builder-common';
import type { AgentDefinition } from '@kbn/agent-builder-common';
import { AgentAccessControlModeBadge } from './agent_access_control_mode_badge';

const renderWithIntl = (ui: React.ReactElement) =>
  render(<IntlProvider locale="en">{ui}</IntlProvider>);

const baseAgent: AgentDefinition = {
  id: 'agent-1',
  type: AgentType.chat,
  name: 'Test Agent',
  description: 'Description',
  readonly: false,
  configuration: { tools: [] },
};

describe('AgentAccessControlModeBadge', () => {
  it('shows Read-only badge when agent is readonly', () => {
    renderWithIntl(<AgentAccessControlModeBadge agent={{ ...baseAgent, readonly: true }} />);

    expect(
      screen.getByTestId('agentBuilderAgentsListAccessControlModeBuiltInBadge')
    ).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
  });

  it('shows Private access control mode badge when access mode is private', () => {
    renderWithIntl(
      <AgentAccessControlModeBadge
        agent={{
          ...baseAgent,
          access_control: { access_mode: AgentAccessControlMode.Private, entries: [] },
        }}
      />
    );

    expect(
      screen.getByTestId('agentBuilderAgentsListAccessControlMode-private')
    ).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('shows Shared access control mode badge when access mode is shared', () => {
    renderWithIntl(
      <AgentAccessControlModeBadge
        agent={{
          ...baseAgent,
          access_control: { access_mode: AgentAccessControlMode.Shared, entries: [] },
        }}
      />
    );

    expect(
      screen.getByTestId('agentBuilderAgentsListAccessControlMode-shared')
    ).toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
  });

  it('shows Public access control mode badge when access mode is public', () => {
    renderWithIntl(
      <AgentAccessControlModeBadge
        agent={{
          ...baseAgent,
          access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
        }}
      />
    );

    expect(
      screen.getByTestId('agentBuilderAgentsListAccessControlMode-public')
    ).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('defaults to Public when access control mode is undefined', () => {
    renderWithIntl(<AgentAccessControlModeBadge agent={baseAgent} />);

    expect(
      screen.getByTestId('agentBuilderAgentsListAccessControlMode-public')
    ).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
  });
});
