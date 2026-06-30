/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntityAnalyticsHomePage } from './entity_analytics_home_page';
import { TestProviders } from '../../common/mock';
import { useIsExperimentalFeatureEnabled } from '../../common/hooks/use_experimental_features';
import { useEntityStoreStatus } from '../components/entity_store/hooks/use_entity_store';
import { useMissingRiskEnginePrivileges } from '../hooks/use_missing_risk_engine_privileges';
import { useEntityEnginePrivileges } from '../components/entity_store/hooks/use_entity_engine_privileges';
import { useLeadGenerationPrivileges } from '../api/hooks/use_lead_generation_privileges';
import { useHuntingLeads } from '../components/threat_hunting/top_threat_hunting_leads/use_hunting_leads';
import { useEntityStoreDataView } from '../components/home/use_entity_store_data_view';

jest.mock('../../common/components/links/link_props', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mockReact = require('react');
  return {
    withSecuritySolutionLink:
      (WrappedComponent: React.ComponentType<Record<string, unknown>>) =>
      (props: Record<string, unknown>) =>
        mockReact.createElement(WrappedComponent, { ...props, href: '/mocked' }),
    useGetSecuritySolutionLinkProps: jest.fn(() => () => ({ href: '/mocked', onClick: jest.fn() })),
    useSecuritySolutionLinkProps: jest.fn(() => ({ href: '/mocked', onClick: jest.fn() })),
  };
});

jest.mock('../../common/components/link_to', () => ({
  useGetSecuritySolutionUrl:
    () =>
    ({ deepLinkId, path = '' }: { deepLinkId: string; path?: string }) =>
      `/app/security/${deepLinkId}${path}`,
}));

jest.mock('../components/home/dynamic_risk_level_panel', () => ({
  DynamicRiskLevelPanel: () => (
    <div data-test-subj="dynamic-risk-level-panel">{'Dynamic Risk Level Panel'}</div>
  ),
}));

jest.mock('../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn(() => false),
}));

jest.mock('../../common/hooks/use_license');

jest.mock('../../data_view_manager/hooks/use_data_view', () => ({
  useDataView: jest.fn(() => ({
    dataView: { id: 'test', matchedIndices: ['index-1'] },
    status: 'ready',
  })),
}));

jest.mock('../components/home/combined_risk_donut_chart', () => ({
  CombinedRiskDonutChart: () => (
    <div data-test-subj="combined-risk-donut-chart">{'Donut Chart'}</div>
  ),
}));

jest.mock('../components/home/anomalies_panel', () => ({
  EntityAnalyticsRecentAnomalies: () => (
    <div data-test-subj="recent-anomalies-panel">{'Recent anomalies'}</div>
  ),
}));

jest.mock('../components/home/entities_table', () => ({
  EntitiesTableSection: () => (
    <div data-test-subj="entity-analytics-home-entities-table">{'Entities Table'}</div>
  ),
  DataViewContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
  useEntityURLState: jest.fn(() => ({
    sort: [],
    filters: [],
    query: { bool: { filter: [], must: [], must_not: [], should: [] } },
    pageIndex: 0,
    setUrlQuery: jest.fn(),
    pageSize: 25,
    onChangeItemsPerPage: jest.fn(),
    onChangePage: jest.fn(),
    onSort: jest.fn(),
    onResetFilters: jest.fn(),
    getRowsFromPages: jest.fn(() => []),
  })),
}));

jest.mock('../components/home/use_entity_store_data_view', () => ({
  useEntityStoreDataView: jest.fn(() => ({
    dataView: { id: 'test-entity-store', fields: [] },
    isLoading: false,
    error: undefined,
  })),
}));

jest.mock('../components/entity_store/hooks/use_entity_store', () => ({
  useEntityStoreStatus: jest.fn(() => ({
    data: { status: 'running', engines: [] },
  })),
}));

jest.mock('../hooks/use_missing_risk_engine_privileges', () => ({
  useMissingRiskEnginePrivileges: jest.fn(() => ({
    isLoading: false,
    hasAllRequiredPrivileges: true,
  })),
}));

jest.mock('../components/entity_store/hooks/use_entity_engine_privileges', () => ({
  useEntityEnginePrivileges: jest.fn(() => ({
    isLoading: false,
    data: { has_read_permissions: true, privileges: { elasticsearch: { index: {} }, kibana: [] } },
  })),
}));

jest.mock('../api/hooks/use_lead_generation_privileges', () => ({
  useLeadGenerationPrivileges: jest.fn(() => ({
    isLoading: false,
    data: undefined,
  })),
}));

jest.mock('../components/threat_hunting/top_threat_hunting_leads/use_hunting_leads', () => ({
  useHuntingLeads: jest.fn(() => ({
    leads: [],
    totalCount: 0,
    isLoading: false,
    isGenerating: false,
    hasGenerated: false,
    lastRunTimestamp: null,
    generate: jest.fn(),
    refetch: jest.fn(),
    isScheduled: false,
    toggleSchedule: jest.fn(),
    readPermissionError: false,
    writePermissionError: false,
  })),
}));

jest.mock('../components/threat_hunting/top_threat_hunting_leads/use_lead_attachment', () => ({
  useLeadAttachment: jest.fn(() => jest.fn()),
}));

jest.mock('../components/threat_hunting/top_threat_hunting_leads', () => ({
  TopThreatHuntingLeads: () => (
    <div data-test-subj="top-threat-hunting-leads">{'Top Threat Hunting Leads'}</div>
  ),
}));

jest.mock('../../onboarding/components/hooks/use_stored_state', () => ({
  useStoredAssistantConnectorId: jest.fn(() => ['', jest.fn()]),
}));

jest.mock('../../agent_builder/hooks/use_agent_builder_availability', () => ({
  useAgentBuilderAvailability: jest.fn(() => ({ isAgentChatExperienceEnabled: false })),
}));

// useEntityURLState is already mocked inside the entities_table mock above

jest.mock('../../common/hooks/use_space_id', () => ({
  useSpaceId: jest.fn(() => 'default'),
}));

jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutApi: jest.fn(() => ({
    openRightPanel: jest.fn(),
  })),
}));

const mockUseEntityStoreDataView = useEntityStoreDataView as jest.Mock;
const mockUseIsExperimentalFeatureEnabled = useIsExperimentalFeatureEnabled as jest.Mock;
const mockUseEntityStoreStatus = useEntityStoreStatus as jest.Mock;
const mockUseMissingRiskEnginePrivileges = useMissingRiskEnginePrivileges as jest.Mock;
const mockUseEntityEnginePrivileges = useEntityEnginePrivileges as jest.Mock;
const mockUseLeadGenerationPrivileges = useLeadGenerationPrivileges as jest.Mock;
const mockUseHuntingLeads = useHuntingLeads as jest.Mock;

describe('EntityAnalyticsHomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseEntityStoreDataView.mockReturnValue({
      dataView: { id: 'test-entity-store', fields: [], matchedIndices: ['index-1'] },
      isLoading: false,
      error: undefined,
    });

    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'running', engines: [] },
    });

    mockUseMissingRiskEnginePrivileges.mockReturnValue({
      isLoading: false,
      hasAllRequiredPrivileges: true,
    });

    mockUseEntityEnginePrivileges.mockReturnValue({
      isLoading: false,
      data: {
        has_read_permissions: true,
        privileges: { elasticsearch: { index: {} }, kibana: [] },
      },
    });

    mockUseLeadGenerationPrivileges.mockReturnValue({
      isLoading: false,
      data: undefined,
    });

    mockUseHuntingLeads.mockReturnValue({
      leads: [],
      totalCount: 0,
      isLoading: false,
      isGenerating: false,
      hasGenerated: false,
      lastRunTimestamp: null,
      generate: jest.fn(),
      refetch: jest.fn(),
      isScheduled: false,
      toggleSchedule: jest.fn(),
      readPermissionError: false,
      writePermissionError: false,
    });
  });

  it('renders the page title', () => {
    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByText('Entity analytics')).toBeInTheDocument();
  });

  it('renders the KQL search bar', () => {
    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    // The SiemSearchBar should be rendered within FiltersGlobal
    expect(screen.getByTestId('entityAnalyticsHomePage')).toBeInTheDocument();
  });

  it('renders the dynamic risk level panel', () => {
    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByTestId('dynamic-risk-level-panel')).toBeInTheDocument();
  });

  it('renders the anomalies placeholder panel', () => {
    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByTestId('recent-anomalies-panel')).toBeInTheDocument();
  });

  it('renders the entities table', () => {
    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByTestId('entity-analytics-home-entities-table')).toBeInTheDocument();
  });

  it('renders the watchlists settings button', () => {
    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByRole('link', { name: 'Watchlists settings' })).toBeInTheDocument();
  });

  it('renders empty prompt when indices do not exist', () => {
    mockUseEntityStoreDataView.mockReturnValue({
      dataView: { id: 'test', matchedIndices: [] },
      status: 'ready',
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    // EmptyPrompt should be rendered; main content should not
    expect(screen.queryByTestId('entity-analytics-home-entities-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dynamic-risk-level-panel')).not.toBeInTheDocument();
  });

  it("renders entity store disabled empty prompt when status is 'not_installed'", () => {
    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'not_installed', engines: [] },
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByTestId('entityStoreDisabledEmptyPrompt')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entity analytics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enable Entity analytics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read the docs/ })).toBeInTheDocument();
    expect(screen.queryByTestId('entity-analytics-home-entities-table')).not.toBeInTheDocument();
  });

  it("renders entity store disabled empty prompt when status is 'stopped'", () => {
    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'stopped', engines: [] },
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByTestId('entityStoreDisabledEmptyPrompt')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entity analytics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enable Entity analytics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read the docs/ })).toBeInTheDocument();
    expect(screen.queryByTestId('entity-analytics-home-entities-table')).not.toBeInTheDocument();
  });

  it("does not render disabled empty prompt when status is 'running'", () => {
    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'running', engines: [] },
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.queryByTestId('entityStoreDisabledEmptyPrompt')).not.toBeInTheDocument();
    expect(screen.getByTestId('entityAnalyticsHomePage')).toBeInTheDocument();
  });

  it("does not render disabled empty prompt when status is 'installing'", () => {
    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'installing', engines: [] },
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.queryByTestId('entityStoreDisabledEmptyPrompt')).not.toBeInTheDocument();
    expect(screen.getByTestId('entityAnalyticsHomePage')).toBeInTheDocument();
  });

  it('disabled empty prompt footer renders a Read the docs link to the entity analytics docs', () => {
    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'not_installed', engines: [] },
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByText('Want to learn more?', { exact: false })).toBeInTheDocument();
    const docsLink = screen.getByRole('link', { name: /Read the docs/ });
    expect(docsLink).toBeInTheDocument();
    expect(docsLink).toHaveAttribute('href', expect.stringContaining('entity-risk-scoring'));
    expect(docsLink).toHaveAttribute('target', '_blank');
  });

  it('renders full-page loader when entity engine privileges are loading', () => {
    mockUseEntityEnginePrivileges.mockReturnValue({ isLoading: true, data: undefined });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByTestId('entityAnalyticsHomePage')).not.toBeInTheDocument();
  });

  it('renders full-page loader when risk engine privileges are loading', () => {
    mockUseMissingRiskEnginePrivileges.mockReturnValue({ isLoading: true });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByTestId('entityAnalyticsHomePage')).not.toBeInTheDocument();
  });

  it('renders NoPrivileges when user lacks entity engine read permissions', () => {
    mockUseEntityEnginePrivileges.mockReturnValue({
      isLoading: false,
      data: {
        has_read_permissions: false,
        privileges: { elasticsearch: { index: {} }, kibana: [] },
      },
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByTestId('noPrivilegesPage')).toBeInTheDocument();
    expect(screen.queryByTestId('entity-analytics-home-entities-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dynamic-risk-level-panel')).not.toBeInTheDocument();
  });

  it('does not render NoPrivileges when entity engine privileges query errors', () => {
    mockUseEntityEnginePrivileges.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.queryByTestId('noPrivilegesPage')).not.toBeInTheDocument();
    expect(screen.getByTestId('entityAnalyticsHomePage')).toBeInTheDocument();
  });

  it('shows privileges callout and hides leads section when lead generation read access is missing', () => {
    const leadsIndex = '.entity_analytics.entity-leads-*';
    mockUseIsExperimentalFeatureEnabled.mockImplementation((flag: string) => {
      if (flag === 'leadGenerationEnabled') return true;
      if (flag === 'newDataViewPickerEnabled') return false;
      return false;
    });
    mockUseLeadGenerationPrivileges.mockReturnValue({
      isLoading: false,
      data: {
        has_all_required: false,
        has_read_permissions: false,
        privileges: {
          elasticsearch: {
            index: { [leadsIndex]: { read: false, view_index_metadata: true } },
          },
        },
      },
    });
    mockUseHuntingLeads.mockReturnValue({
      leads: [],
      totalCount: 0,
      isLoading: false,
      isGenerating: false,
      hasGenerated: false,
      lastRunTimestamp: null,
      generate: jest.fn(),
      refetch: jest.fn(),
      isScheduled: false,
      toggleSchedule: jest.fn(),
      readPermissionError: true,
      writePermissionError: false,
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByText('Insufficient privileges')).toBeInTheDocument();
    expect(screen.getByText(leadsIndex)).toBeInTheDocument();
    expect(screen.queryByTestId('top-threat-hunting-leads')).not.toBeInTheDocument();
  });

  it('renders Privileges Callout when user lacks risk engine read permissions', () => {
    mockUseMissingRiskEnginePrivileges.mockReturnValue({
      isLoading: false,
      hasAllRequiredPrivileges: false,
      missingPrivileges: {
        indexPrivileges: [['risk-score-index-pattern', ['read']]],
        clusterPrivileges: { enable: [], run: [] },
      },
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByText('Insufficient privileges')).toBeInTheDocument();
    expect(screen.queryByTestId('entity-analytics-home-entities-table')).toBeInTheDocument();
    expect(screen.queryByTestId('dynamic-risk-level-panel')).toBeInTheDocument();
  });

  it('indicesExist=false still wins over entity store disabled state', () => {
    mockUseEntityStoreDataView.mockReturnValue({
      dataView: { id: 'test', matchedIndices: [] },
      status: 'ready',
    });

    mockUseEntityStoreStatus.mockReturnValue({
      data: { status: 'not_installed', engines: [] },
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.queryByTestId('entityStoreDisabledEmptyPrompt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('entity-analytics-home-entities-table')).not.toBeInTheDocument();
  });

  it('renders leads section without callout when lead generation privileges are present', () => {
    mockUseIsExperimentalFeatureEnabled.mockImplementation((flag: string) => {
      if (flag === 'leadGenerationEnabled') return true;
      if (flag === 'newDataViewPickerEnabled') return false;
      return false;
    });
    mockUseLeadGenerationPrivileges.mockReturnValue({
      isLoading: false,
      data: {
        has_all_required: true,
        has_read_permissions: true,
        privileges: { elasticsearch: { index: {} } },
      },
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsHomePage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.queryByText('Insufficient privileges')).not.toBeInTheDocument();
    expect(screen.getByTestId('top-threat-hunting-leads')).toBeInTheDocument();
  });
});
