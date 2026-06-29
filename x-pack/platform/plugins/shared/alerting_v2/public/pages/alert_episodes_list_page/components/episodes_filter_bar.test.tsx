/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { createMockServices } from '@kbn/alerting-v2-episodes-ui/hooks/test_utils';
import { useFetchEpisodeTagOptions } from '@kbn/alerting-v2-episodes-ui/hooks/use_fetch_episode_tag_options';
import { useBulkGetProfiles } from '@kbn/alerting-v2-episodes-ui/hooks/use_bulk_get_profiles';
import { fetchRulesSearch } from '@kbn/alerting-v2-episodes-ui/apis/fetch_rules_search';
import { TestProviders } from '../../../test_utils/test_providers';
import { EpisodesFilterBar } from './episodes_filter_bar';

jest.mock('react-use/lib/useDebounce', () => jest.fn());

jest.mock('@kbn/alerting-v2-episodes-ui/hooks/use_fetch_episode_tag_options', () => ({
  useFetchEpisodeTagOptions: jest.fn(),
}));

jest.mock('@kbn/alerting-v2-episodes-ui/apis/fetch_rules_search', () => ({
  fetchRulesSearch: jest.fn(),
}));

jest.mock('@kbn/alerting-v2-episodes-ui/hooks/use_bulk_get_profiles', () => ({
  useBulkGetProfiles: jest.fn(),
}));

const mockUseFetchEpisodeTagOptions = jest.mocked(useFetchEpisodeTagOptions);
const mockFetchRulesSearch = jest.mocked(fetchRulesSearch);
const mockUseBulkGetProfiles = jest.mocked(useBulkGetProfiles);

const mockEpisodeServices = createMockServices();

const defaultProps = {
  filterState: { status: 'active' as const },
  onFilterChange: jest.fn(),
  timeRange: { from: 'now-24h', to: 'now' },
  onTimeChange: jest.fn(),
  ruleOptions: [],
  assigneeUids: [],
  services: {
    http: mockEpisodeServices.http,
    expressions: mockEpisodeServices.expressions,
    spaces: mockEpisodeServices.spaces,
  },
};

const renderFilterBar = () =>
  render(
    <TestProviders>
      <EpisodesFilterBar {...defaultProps} />
    </TestProviders>
  );

describe('EpisodesFilterBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFetchEpisodeTagOptions.mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useFetchEpisodeTagOptions>);
    mockFetchRulesSearch.mockResolvedValue([]);
    mockUseBulkGetProfiles.mockReturnValue({
      data: [],
      isFetching: false,
    } as unknown as ReturnType<typeof useBulkGetProfiles>);
  });

  it('renders search and all episode filters', () => {
    renderFilterBar();

    expect(screen.getByTestId('episodesFilterBar-search')).toBeInTheDocument();
    expect(screen.getByTestId('episodesFilterBar-status-button')).toBeInTheDocument();
    expect(screen.getByTestId('episodesFilterBar-severity-button')).toBeInTheDocument();
    expect(screen.getByTestId('episodesFilterBar-rule-button')).toBeInTheDocument();
    expect(screen.getByTestId('episodesFilterBar-tags-button')).toBeInTheDocument();
    expect(screen.getByTestId('episodesFilterBar-assignee-button')).toBeInTheDocument();
  });
});
