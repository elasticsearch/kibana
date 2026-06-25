/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { ALERT_EPISODE_STATUS } from '@kbn/alerting-v2-schemas';
import { runEsqlAsyncSearch } from '../../utils/run_esql_async_search';
import {
  createMockRule,
  createMockServices,
  createQueryClientWrapper,
  createTestQueryClient,
} from '../../hooks/test_utils';
import { AlertEpisodeRuleOverviewPanelSection } from './rule_overview_panel_section';

jest.mock('../../utils/run_esql_async_search');

const runEsqlAsyncSearchMock = jest.mocked(runEsqlAsyncSearch);

const mockHttp = httpServiceMock.createStartContract();
const mockServices = createMockServices({ http: mockHttp });

const mockRule = createMockRule();

const queryClient = createTestQueryClient();
const wrapper = createQueryClientWrapper(queryClient);

describe('AlertEpisodeRuleOverviewPanelSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('renders the rule overview panel once the rule loads', async () => {
    runEsqlAsyncSearchMock.mockResolvedValue({
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: 'episode.status', type: 'keyword' },
        { name: 'rule.id', type: 'keyword' },
        { name: 'group_hash', type: 'keyword' },
      ],
      values: [['2024-01-01T00:00:00.000Z', ALERT_EPISODE_STATUS.ACTIVE, 'rule-1', 'gh-1']],
    });
    mockHttp.get.mockResolvedValueOnce(mockRule);

    render(
      <I18nProvider>
        <AlertEpisodeRuleOverviewPanelSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    expect(
      await screen.findByTestId('alertingV2EpisodeDetailsRuleOverviewPanel')
    ).toBeInTheDocument();
  });

  it('renders a loading spinner while data is loading', () => {
    runEsqlAsyncSearchMock.mockImplementation(() => new Promise(() => {}));

    render(
      <I18nProvider>
        <AlertEpisodeRuleOverviewPanelSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    expect(
      screen.getByTestId('alertingV2EpisodeRuleOverviewPanelSectionLoading')
    ).toBeInTheDocument();
  });

  it('renders an error state when the rule fails to load', async () => {
    runEsqlAsyncSearchMock.mockResolvedValue({
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: 'episode.status', type: 'keyword' },
        { name: 'rule.id', type: 'keyword' },
        { name: 'group_hash', type: 'keyword' },
      ],
      values: [['2024-01-01T00:00:00.000Z', ALERT_EPISODE_STATUS.ACTIVE, 'rule-1', 'gh-1']],
    });
    mockHttp.get.mockRejectedValueOnce({
      response: { status: 500 },
      body: { code: 'INTERNAL_ERROR', error: 'Internal Server Error', message: 'Failed' },
    });

    render(
      <I18nProvider>
        <AlertEpisodeRuleOverviewPanelSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    expect(
      await screen.findByTestId('alertingV2EpisodeRuleOverviewPanelSectionError')
    ).toBeInTheDocument();
  });

  it('renders nothing when the rule returns 404', async () => {
    runEsqlAsyncSearchMock.mockResolvedValue({
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: 'episode.status', type: 'keyword' },
        { name: 'rule.id', type: 'keyword' },
        { name: 'group_hash', type: 'keyword' },
      ],
      values: [['2024-01-01T00:00:00.000Z', ALERT_EPISODE_STATUS.ACTIVE, 'rule-1', 'gh-1']],
    });
    mockHttp.get.mockRejectedValueOnce({
      response: { status: 404 },
      body: { code: 'RULE_NOT_FOUND', error: 'Not Found', message: 'Rule not found' },
    });

    render(
      <I18nProvider>
        <AlertEpisodeRuleOverviewPanelSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId('alertingV2EpisodeRuleOverviewPanelSectionDeleted')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('alertingV2EpisodeDetailsRuleOverviewPanel')
      ).not.toBeInTheDocument();
    });
  });
});
