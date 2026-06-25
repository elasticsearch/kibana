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
import {
  createMockServices,
  createQueryClientWrapper,
  createTestQueryClient,
} from '../../hooks/test_utils';
import { AlertEpisodesRelatedSection } from './related_section';
import { RuleStateStatus } from '../../types/rule_state';

jest.mock('../../utils/run_esql_async_search');

jest.mock('./related/related', () => ({
  AlertEpisodesRelated: jest.fn(() => <div data-test-subj="alertEpisodesRelatedStub" />),
}));

const { AlertEpisodesRelated } = jest.requireMock('./related/related') as {
  AlertEpisodesRelated: jest.Mock;
};

const runEsqlAsyncSearchMock = jest.mocked(runEsqlAsyncSearch);

const mockHttp = httpServiceMock.createStartContract();
const mockServices = createMockServices({ http: mockHttp });

const mockRule = {
  id: 'rule-1',
  metadata: { name: 'My rule' },
  query: { format: 'standalone', breach: { query: 'FROM logs' } },
} as unknown as RuleResponse;

const mockEpisodeEventsResponse = {
  columns: [
    { name: '@timestamp', type: 'date' },
    { name: 'episode.status', type: 'keyword' },
    { name: 'rule.id', type: 'keyword' },
    { name: 'group_hash', type: 'keyword' },
  ],
  values: [['2024-01-01T00:00:00.000Z', ALERT_EPISODE_STATUS.ACTIVE, 'rule-1', 'gh-1']],
};

const queryClient = createTestQueryClient();
const wrapper = createQueryClientWrapper(queryClient);

describe('AlertEpisodesRelatedSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('renders the related-episodes stub once events and rule load', async () => {
    runEsqlAsyncSearchMock.mockResolvedValue(mockEpisodeEventsResponse);
    mockHttp.get.mockResolvedValueOnce(mockRule);

    render(
      <I18nProvider>
        <AlertEpisodesRelatedSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    await waitFor(() => expect(screen.getByTestId('alertEpisodesRelatedStub')).toBeInTheDocument());

    expect(AlertEpisodesRelated).toHaveBeenCalledWith(
      expect.objectContaining({
        currentEpisodeId: 'ep-1',
        groupHash: 'gh-1',
        ruleState: {
          status: RuleStateStatus.loaded,
          ruleId: 'rule-1',
          rule: mockRule,
        },
        getEpisodeDetailsHref: expect.any(Function),
      }),
      expect.anything()
    );
  });

  it('renders related episodes when the rule was deleted', async () => {
    runEsqlAsyncSearchMock.mockResolvedValue(mockEpisodeEventsResponse);
    mockHttp.get.mockRejectedValueOnce({
      response: { status: 404 },
      body: { code: 'RULE_NOT_FOUND', error: 'Not Found', message: 'Rule not found' },
    });

    render(
      <I18nProvider>
        <AlertEpisodesRelatedSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    await waitFor(() => expect(screen.getByTestId('alertEpisodesRelatedStub')).toBeInTheDocument());

    expect(AlertEpisodesRelated).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleState: { status: RuleStateStatus.not_found, ruleId: 'rule-1' },
      }),
      expect.anything()
    );
  });

  it('renders the loading state while events are loading', () => {
    runEsqlAsyncSearchMock.mockImplementation(() => new Promise(() => {}));

    render(
      <I18nProvider>
        <AlertEpisodesRelatedSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    expect(screen.getByTestId('alertingV2EpisodesRelatedSectionLoading')).toBeInTheDocument();
  });

  it('renders the error state when the episode fails to load', async () => {
    runEsqlAsyncSearchMock.mockRejectedValueOnce(new Error('boom'));

    render(
      <I18nProvider>
        <AlertEpisodesRelatedSection episodeId="ep-1" services={mockServices} />
      </I18nProvider>,
      { wrapper }
    );

    await waitFor(() =>
      expect(screen.getByTestId('alertingV2EpisodesRelatedSectionError')).toBeInTheDocument()
    );
  });
});
