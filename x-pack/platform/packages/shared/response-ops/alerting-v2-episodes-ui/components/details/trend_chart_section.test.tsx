/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFetchEpisodeQuery } from '../../hooks/use_fetch_episode_query';
import { useFetchRule } from '../../hooks/use_fetch_rule';
import { useFetchEpisodeTrendQuery } from '../../hooks/use_fetch_episode_trend_query';
import { AlertEpisodeTrendChartSection } from './trend_chart_section';

jest.mock('../../hooks/use_fetch_episode_query');
jest.mock('../../hooks/use_fetch_rule');
jest.mock('../../hooks/use_fetch_episode_trend_query');
jest.mock('./trend_chart', () => ({
  AlertEpisodeTrendChart: ({ series }: { series: { label: string } }) => (
    <div data-test-subj="trend-chart-stub" data-metric={series.label} />
  ),
}));

const mockUseFetchEpisodeQuery = jest.mocked(useFetchEpisodeQuery);
const mockUseFetchRule = jest.mocked(useFetchRule);
const mockUseFetchEpisodeTrendQuery = jest.mocked(useFetchEpisodeTrendQuery);

const mockServices = { data: {}, http: {}, spaces: {} } as never;

const episode = { 'rule.id': 'rule1' } as never;

// Rule with one threshold metric (count).
const singleMetricRule = {
  version: '1',
  query: {
    format: 'composed',
    base: 'FROM logs-* | STATS count = COUNT(*) BY `host.name`',
    breach: { segment: '| WHERE count > 100' },
  },
} as never;

// Rule with two threshold metrics (errors, error_rate).
const multiMetricRule = {
  version: '1',
  query: {
    format: 'composed',
    base: 'FROM logs-* | STATS errors = COUNT(*), total = COUNT(*) | EVAL error_rate = errors / total * 100',
    breach: { segment: '| WHERE errors > 10 AND error_rate > 5' },
  },
} as never;

const trendRows = [
  {
    '@timestamp': '2026-06-18T00:00:00.000Z',
    'episode.status': 'active',
    metrics: { count: 150, errors: 20, error_rate: 8 },
  },
] as never;

const asQuery = (data: unknown, extra: object = {}) =>
  ({ data, isLoading: false, isError: false, ...extra } as never);

describe('AlertEpisodeTrendChartSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing for a non-threshold rule', () => {
    mockUseFetchEpisodeQuery.mockReturnValue(asQuery(episode));
    mockUseFetchRule.mockReturnValue(
      asQuery({
        version: '1',
        query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 1' } },
      })
    );
    mockUseFetchEpisodeTrendQuery.mockReturnValue(asQuery([]));

    const { container } = render(
      <AlertEpisodeTrendChartSection episodeId="ep1" services={mockServices} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the panel with the title', async () => {
    mockUseFetchEpisodeQuery.mockReturnValue(asQuery(episode));
    mockUseFetchRule.mockReturnValue(asQuery(singleMetricRule));
    mockUseFetchEpisodeTrendQuery.mockReturnValue(asQuery(trendRows));

    render(<AlertEpisodeTrendChartSection episodeId="ep1" services={mockServices} />);
    expect(screen.getByTestId('alertingV2EpisodeTrendChart')).toBeInTheDocument();
    expect(screen.getByText('Trend')).toBeInTheDocument();
  });

  it('renders one badge per metric group', async () => {
    mockUseFetchEpisodeQuery.mockReturnValue(asQuery(episode));
    mockUseFetchRule.mockReturnValue(asQuery(multiMetricRule));
    mockUseFetchEpisodeTrendQuery.mockReturnValue(asQuery(trendRows));

    render(<AlertEpisodeTrendChartSection episodeId="ep1" services={mockServices} />);
    expect(screen.getByText('errors')).toBeInTheDocument();
    expect(screen.getByText('error_rate')).toBeInTheDocument();
  });

  it('shows the first metric chart by default', async () => {
    mockUseFetchEpisodeQuery.mockReturnValue(asQuery(episode));
    mockUseFetchRule.mockReturnValue(asQuery(multiMetricRule));
    mockUseFetchEpisodeTrendQuery.mockReturnValue(asQuery(trendRows));

    render(<AlertEpisodeTrendChartSection episodeId="ep1" services={mockServices} />);
    await waitFor(() => {
      expect(screen.getByTestId('trend-chart-stub')).toHaveAttribute('data-metric', 'errors');
    });
  });

  it('switches chart when a different badge is clicked', async () => {
    mockUseFetchEpisodeQuery.mockReturnValue(asQuery(episode));
    mockUseFetchRule.mockReturnValue(asQuery(multiMetricRule));
    mockUseFetchEpisodeTrendQuery.mockReturnValue(asQuery(trendRows));

    render(<AlertEpisodeTrendChartSection episodeId="ep1" services={mockServices} />);
    await waitFor(() => screen.getByTestId('trend-chart-stub'));

    await userEvent.click(screen.getByText('error_rate'));
    expect(screen.getByTestId('trend-chart-stub')).toHaveAttribute('data-metric', 'error_rate');
  });

  it('renders the chart on the happy path', async () => {
    mockUseFetchEpisodeQuery.mockReturnValue(asQuery(episode));
    mockUseFetchRule.mockReturnValue(asQuery(singleMetricRule));
    mockUseFetchEpisodeTrendQuery.mockReturnValue(asQuery(trendRows));

    render(<AlertEpisodeTrendChartSection episodeId="ep1" services={mockServices} />);
    await waitFor(() => expect(screen.getByTestId('trend-chart-stub')).toBeInTheDocument());
  });

  it('shows an error message when the trend query errors', () => {
    mockUseFetchEpisodeQuery.mockReturnValue(asQuery(episode));
    mockUseFetchRule.mockReturnValue(asQuery(singleMetricRule));
    mockUseFetchEpisodeTrendQuery.mockReturnValue(asQuery(undefined, { isError: true }));

    render(<AlertEpisodeTrendChartSection episodeId="ep1" services={mockServices} />);
    expect(screen.getByTestId('alertingV2EpisodeTrendChartSectionError')).toBeInTheDocument();
  });
});
