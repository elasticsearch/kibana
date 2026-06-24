/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { useParams } from 'react-router-dom';
import { useFetchEpisodeQuery } from '@kbn/alerting-v2-episodes-ui/hooks/use_fetch_episode_query';
import { useFetchRule } from '@kbn/alerting-v2-episodes-ui/hooks/use_fetch_rule';
import { TestProviders } from '../../test_utils/test_providers';
import { EpisodeDetailsPage } from './episode_details_page';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => ({ push: jest.fn() }),
  useParams: jest.fn(),
}));

jest.mock('@kbn/alerting-v2-episodes-ui/hooks/use_fetch_episode_query', () => ({
  useFetchEpisodeQuery: jest.fn(),
}));

jest.mock('@kbn/alerting-v2-episodes-ui/hooks/use_fetch_rule', () => ({
  useFetchRule: jest.fn(),
}));

jest.mock('@kbn/alerting-v2-episodes-ui/hooks/use_fetch_episode_actions', () => ({
  useFetchEpisodeActions: () => ({ data: new Map(), isLoading: false }),
}));

jest.mock('@kbn/alerting-v2-episodes-ui/hooks/use_fetch_group_actions', () => ({
  useFetchGroupActions: () => ({ data: new Map(), isLoading: false }),
}));

jest.mock('@kbn/app-header', () => jest.requireActual('../../test_utils/mock_app_header'));

// Sections that call useFetchEpisodeQuery independently are mocked to keep the
// test focused on the page-level layout and sidebar.
jest.mock('@kbn/alerting-v2-episodes-ui/components/details/overview_list_section', () => ({
  AlertEpisodeOverviewListSection: () => <div data-test-subj="stubOverviewListSection" />,
}));

jest.mock('@kbn/alerting-v2-episodes-ui/components/details/related_section', () => ({
  AlertEpisodesRelatedSection: () => null,
}));

jest.mock('@kbn/alerting-v2-episodes-ui/components/details/details_header_section', () => ({
  AlertEpisodeDetailsHeaderSection: () => <div data-test-subj="stubDetailsHeaderSection" />,
}));

jest.mock('@kbn/alerting-v2-episodes-ui/components/details/rule_overview_panel_section', () => ({
  AlertEpisodeRuleOverviewPanelSection: () => <div data-test-subj="stubRuleOverviewPanelSection" />,
}));

jest.mock('@kbn/alerting-v2-episodes-ui/components/details/runbook_section', () => ({
  AlertEpisodeRunbookSection: () => <div data-test-subj="stubRunbookSection" />,
}));

jest.mock('@kbn/alerting-v2-episodes-ui/components/details/lifecycle_heatmap_section', () => ({
  AlertEpisodeLifecycleHeatmapSection: () => <div data-test-subj="stubLifecycleHeatmapSection" />,
}));

jest.mock('@kbn/alerting-v2-episodes-ui/components/details/severity_heatmap_section', () => ({
  AlertEpisodeSeverityHeatmapSection: () => <div data-test-subj="stubSeverityHeatmapSection" />,
}));

jest.mock('@kbn/alerting-v2-episodes-ui/components/details/metadata_section', () => ({
  AlertEpisodeMetadataSection: () => <div data-test-subj="stubMetadataSection" />,
}));

jest.mock('../../hooks/use_breadcrumbs', () => ({
  useBreadcrumbs: jest.fn(),
}));

const mockUseParams = jest.mocked(useParams);
const mockUseFetchEpisodeQuery = jest.mocked(useFetchEpisodeQuery);
const mockUseFetchRule = jest.mocked(useFetchRule);

type EpisodeQueryResult = ReturnType<typeof useFetchEpisodeQuery>;
type FetchRuleResult = ReturnType<typeof useFetchRule>;

const mockEpisode = {
  '@timestamp': '2026-05-08T08:00:00.000Z',
  'episode.id': 'ep-1',
  'episode.status': 'active' as const,
  'rule.id': 'rule-1',
  group_hash: 'group-1',
  first_timestamp: '2026-05-08T08:00:00.000Z',
  last_timestamp: '2026-05-08T08:05:00.000Z',
  triggered_at: '2026-05-08T08:00:00.000Z',
  duration: 300000,
  last_tags: ['tag-a'],
  last_assignee_uid: 'u-1',
};

const episodeQuery = {
  data: mockEpisode,
  isLoading: false,
  isError: false,
  fetchStatus: 'idle',
} as unknown as EpisodeQueryResult;

const fetchRuleResult = {
  data: {
    id: 'rule-1',
    kind: 'alerting',
    enabled: true,
    metadata: { name: 'Rule A', description: 'Rule description' },
    grouping: { fields: ['host.name'] },
    query: { format: 'standalone', breach: 'from index-*' },
    artifacts: [],
  },
  isLoading: false,
} as unknown as FetchRuleResult;

const episodeId = 'ep-1';
mockUseParams.mockReturnValue({ episodeId });
mockUseFetchEpisodeQuery.mockReturnValue(episodeQuery);
mockUseFetchRule.mockReturnValue(fetchRuleResult);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseParams.mockReturnValue({ episodeId });
  mockUseFetchEpisodeQuery.mockReturnValue(episodeQuery);
  mockUseFetchRule.mockReturnValue(fetchRuleResult);
});

describe('EpisodeDetailsPage', () => {
  it('renders the page structure once the episode loads', () => {
    render(
      <TestProviders>
        <EpisodeDetailsPage />
      </TestProviders>
    );

    expect(screen.getByTestId('alertingV2EpisodeDetailsPage')).toBeInTheDocument();
    expect(screen.getByTestId('alertingV2EpisodeDetailsSidebar')).toBeInTheDocument();
    expect(screen.getByTestId('stubLifecycleHeatmapSection')).toBeInTheDocument();
    expect(screen.getByTestId('stubSeverityHeatmapSection')).toBeInTheDocument();
  });

  it('renders the not-found prompt when there is no episode', () => {
    mockUseFetchEpisodeQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      fetchStatus: 'idle',
    } as unknown as EpisodeQueryResult);

    render(
      <TestProviders>
        <EpisodeDetailsPage />
      </TestProviders>
    );

    expect(screen.getByTestId('episodeDetailsErrorPrompt')).toBeInTheDocument();
  });

  it('renders the error prompt when the episode query errors', () => {
    mockUseFetchEpisodeQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      fetchStatus: 'idle',
    } as unknown as EpisodeQueryResult);

    render(
      <TestProviders>
        <EpisodeDetailsPage />
      </TestProviders>
    );

    expect(screen.getByTestId('episodeDetailsErrorPrompt')).toBeInTheDocument();
  });
});
