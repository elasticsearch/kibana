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
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { runEsqlAsyncSearch } from '../../utils/run_esql_async_search';
import { fetchEpisodeActions } from '../../apis/fetch_episode_actions';
import { fetchGroupActions } from '../../apis/fetch_group_actions';
import {
  createMockServices,
  createQueryClientWrapper,
  createTestQueryClient,
} from '../../hooks/test_utils';
import { AlertEpisodeDetailsHeaderSection } from './details_header_section';

jest.mock('../../utils/run_esql_async_search');
jest.mock('../../apis/fetch_episode_actions');
jest.mock('../../apis/fetch_group_actions');

const runEsqlAsyncSearchMock = jest.mocked(runEsqlAsyncSearch);
const fetchEpisodeActionsMock = jest.mocked(fetchEpisodeActions);
const fetchGroupActionsMock = jest.mocked(fetchGroupActions);

const mockHttp = httpServiceMock.createStartContract();
const mockServices = createMockServices({ http: mockHttp });

const mockRule = {
  id: 'rule-1',
  metadata: { name: 'My rule', description: 'A description' },
} as unknown as RuleResponse;

const queryClient = createTestQueryClient();
const wrapper = createQueryClientWrapper(queryClient);

describe('AlertEpisodeDetailsHeaderSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('renders the header with rule title, tags and status badges on success', async () => {
    runEsqlAsyncSearchMock.mockResolvedValue({
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: 'episode.status', type: 'keyword' },
        { name: 'rule.id', type: 'keyword' },
        { name: 'group_hash', type: 'keyword' },
      ],
      values: [['2024-01-01T00:00:00.000Z', ALERT_EPISODE_STATUS.ACTIVE, 'rule-1', 'gh-1']],
    });
    fetchEpisodeActionsMock.mockResolvedValue([]);
    fetchGroupActionsMock.mockResolvedValue([
      {
        group_hash: 'gh-1',
        rule_id: 'rule-1',
        last_deactivate_action: null,
        last_snooze_action: null,
        snooze_expiry: null,
        tags: ['tag-a'],
        last_snooze_actor: null,
        last_deactivate_actor: null,
      },
    ]);
    mockHttp.get.mockResolvedValueOnce(mockRule);

    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeaderSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    await waitFor(() =>
      expect(screen.getByTestId('alertingV2EpisodeDetailsHeaderTitle')).toHaveTextContent('My rule')
    );
    await waitFor(() =>
      expect(screen.getByTestId('alertingV2EpisodeDetailsHeaderTags')).toBeInTheDocument()
    );
  });

  it('surfaces episode severity in the header after status', async () => {
    runEsqlAsyncSearchMock.mockResolvedValue({
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: 'episode.status', type: 'keyword' },
        { name: 'rule.id', type: 'keyword' },
        { name: 'group_hash', type: 'keyword' },
        { name: 'severity', type: 'keyword' },
      ],
      values: [
        ['2024-01-01T00:00:00.000Z', ALERT_EPISODE_STATUS.ACTIVE, 'rule-1', 'gh-1', 'critical'],
      ],
    });
    fetchEpisodeActionsMock.mockResolvedValue([]);
    fetchGroupActionsMock.mockResolvedValue([]);
    mockHttp.get.mockResolvedValueOnce(mockRule);

    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeaderSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    await waitFor(() =>
      expect(screen.getByTestId('alertingV2EpisodeSeverityBadge-critical')).toHaveTextContent(
        'Critical'
      )
    );
  });

  it('renders the loading title fallback while data is loading', () => {
    runEsqlAsyncSearchMock.mockImplementation(() => new Promise(() => {}));
    fetchEpisodeActionsMock.mockImplementation(() => new Promise(() => {}));
    fetchGroupActionsMock.mockImplementation(() => new Promise(() => {}));

    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeaderSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    expect(screen.getByTestId('alertingV2EpisodeDetailsHeaderTitle')).toHaveTextContent('Loading…');
  });

  it('renders the episode fallback title when the rule fetch returns 404', async () => {
    runEsqlAsyncSearchMock.mockResolvedValue({
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: 'episode.status', type: 'keyword' },
        { name: 'rule.id', type: 'keyword' },
        { name: 'group_hash', type: 'keyword' },
      ],
      values: [['2024-01-01T00:00:00.000Z', ALERT_EPISODE_STATUS.ACTIVE, 'deleted-rule', 'gh-1']],
    });
    fetchEpisodeActionsMock.mockResolvedValue([]);
    fetchGroupActionsMock.mockResolvedValue([]);
    mockHttp.get.mockRejectedValueOnce({
      response: { status: 404 },
      body: { code: 'RULE_NOT_FOUND', error: 'Not Found', message: 'Rule not found' },
    });

    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeaderSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    await waitFor(() =>
      expect(screen.getByTestId('alertingV2EpisodeDetailsHeaderTitle')).toHaveTextContent(
        'Alert episode'
      )
    );
    expect(
      screen.queryByTestId('alertingV2EpisodeDetailsHeaderDeletedRuleId')
    ).not.toBeInTheDocument();
  });
});
