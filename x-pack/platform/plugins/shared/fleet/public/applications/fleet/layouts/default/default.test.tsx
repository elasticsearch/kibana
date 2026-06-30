/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { MockAppHeaderProvider } from '@kbn/app-header/mocks';

import { DefaultLayout, FLEET_TAB_IDS } from './default';

jest.mock('../../../../layouts', () => ({
  WithoutHeaderLayout: ({
    header,
    children,
  }: {
    header?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      {header}
      {children}
    </div>
  ),
}));

jest.mock('../../../../hooks/use_dismissable_tour', () => ({
  useDismissableTour: () => ({ isOpen: false, isHidden: true, dismiss: jest.fn() }),
}));

jest.mock('../../../../hooks/use_tour_manager', () => ({
  TourManagerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../../../hooks/use_can_enable_auto_upgrades', () => ({
  useCanEnableAutomaticAgentUpgrades: () => false,
}));

jest.mock('../../services', () => ({
  ExperimentalFeaturesService: { get: () => ({ enableOtelUI: false }) },
}));

const mockUseAuthz = jest.fn();
const mockUseConfig = jest.fn();
const mockUseLink = jest.fn();
const mockUseStartServices = jest.fn();

jest.mock('../../hooks', () => ({
  useAuthz: () => mockUseAuthz(),
  useConfig: () => mockUseConfig(),
  useLink: () => mockUseLink(),
  useStartServices: () => mockUseStartServices(),
}));

const defaultAuthz = {
  fleet: {
    all: true,
    readAgents: true,
    allAgents: true,
    readAgentPolicies: true,
    allAgentPolicies: true,
    allSettings: true,
    readSettings: true,
  },
};

const setupMocks = (options?: { authz?: Record<string, any>; config?: Record<string, any> }) => {
  mockUseAuthz.mockReturnValue({
    fleet: { ...defaultAuthz.fleet, ...options?.authz },
  });
  mockUseConfig.mockReturnValue({ agents: { enabled: true }, ...options?.config });
  mockUseLink.mockReturnValue({ getHref: () => '/mock-href' });
  mockUseStartServices.mockReturnValue({
    docLinks: { links: { fleet: { guide: 'https://docs', roleAndPrivileges: 'https://docs' } } },
  });
};

const renderLayout = (section?: React.ComponentProps<typeof DefaultLayout>['section']) =>
  render(
    <I18nProvider>
      <MockAppHeaderProvider>
        <DefaultLayout section={section} />
      </MockAppHeaderProvider>
    </I18nProvider>
  );

describe('DefaultLayout', () => {
  describe('read-only badge', () => {
    it('shows read-only badge for agents section without allAgents', () => {
      setupMocks({ authz: { allAgents: false } });
      renderLayout('agents');

      expect(screen.getByText('Read-only')).toBeInTheDocument();
    });

    it('shows read-only badge for agent_policies section without allAgentPolicies', () => {
      setupMocks({ authz: { allAgentPolicies: false } });
      renderLayout('agent_policies');

      expect(screen.getByText('Read-only')).toBeInTheDocument();
    });

    it('shows read-only badge for settings section without allSettings', () => {
      setupMocks({ authz: { allSettings: false } });
      renderLayout('settings');

      expect(screen.getByText('Read-only')).toBeInTheDocument();
    });

    it('does not show read-only badge when user has full privileges', () => {
      setupMocks();
      renderLayout('agents');

      expect(screen.queryByText('Read-only')).not.toBeInTheDocument();
    });
  });

  describe('tab visibility', () => {
    it('hides agents tab when readAgents is false', () => {
      setupMocks({ authz: { readAgents: false } });
      renderLayout('settings');

      expect(screen.queryByTestId(FLEET_TAB_IDS.agents)).not.toBeInTheDocument();
    });

    it('hides settings tab when readSettings is false', () => {
      setupMocks({ authz: { readSettings: false } });
      renderLayout('agents');

      expect(screen.queryByTestId(FLEET_TAB_IDS.settings)).not.toBeInTheDocument();
    });

    it('shows all standard tabs with full privileges', () => {
      setupMocks();
      renderLayout('agents');

      expect(screen.getByTestId(FLEET_TAB_IDS.agents)).toBeInTheDocument();
      expect(screen.getByTestId(FLEET_TAB_IDS.agentPolicies)).toBeInTheDocument();
      expect(screen.getByTestId(FLEET_TAB_IDS.enrollmentTokens)).toBeInTheDocument();
      expect(screen.getByTestId(FLEET_TAB_IDS.uninstallTokens)).toBeInTheDocument();
      expect(screen.getByTestId(FLEET_TAB_IDS.dataStreams)).toBeInTheDocument();
      expect(screen.getByTestId(FLEET_TAB_IDS.settings)).toBeInTheDocument();
    });
  });

  describe('agents tab disabled state', () => {
    it('disables the agents tab when agents config is disabled', () => {
      setupMocks({ config: { agents: { enabled: false } } });
      renderLayout('agents');

      expect(screen.getByTestId(FLEET_TAB_IDS.agents)).toBeDisabled();
    });

    it('enables the agents tab when agents config is enabled', () => {
      setupMocks();
      renderLayout('agents');

      expect(screen.getByTestId(FLEET_TAB_IDS.agents)).not.toBeDisabled();
    });
  });
});
