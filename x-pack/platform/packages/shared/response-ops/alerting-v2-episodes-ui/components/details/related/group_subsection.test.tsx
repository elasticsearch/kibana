/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { AlertEpisode } from '../../../queries/episodes_query';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { RuleStateStatus, type LoadedRuleState } from '../../../types/rule_state';
import { RelatedEpisodesGroupSubsection } from './group_subsection';
import { useFetchSameGroupEpisodesQuery } from '../../../hooks/use_fetch_same_group_episodes_query';
jest.mock('../../../hooks/use_fetch_same_group_episodes_query');

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: () => ({
    services: {
      notifications: { toasts: { addDanger: jest.fn() } },
    },
  }),
}));

jest.mock('../../../hooks/use_fetch_episode_actions', () => ({
  useFetchEpisodeActions: () => ({ data: undefined }),
}));

jest.mock('../../../hooks/use_fetch_group_actions', () => ({
  useFetchGroupActions: () => ({ data: undefined }),
}));

jest.mock('./related_list', () => ({
  RelatedAlertEpisodesList: ({ rows }: { rows: AlertEpisode[] }) => (
    <div data-test-subj="mockEpisodesList">{rows.length} episodes</div>
  ),
}));

const mockUseFetch = jest.mocked(useFetchSameGroupEpisodesQuery);

const loadedRuleState: LoadedRuleState = {
  status: RuleStateStatus.loaded,
  ruleId: 'rule-1',
  rule: { id: 'rule-1', metadata: { name: 'Test Rule' } } as RuleResponse,
};

const mockRuleProps = {
  ruleState: loadedRuleState,
};
const mockGetEpisodeDetailsHref = (id: string) => `/base/${id}`;

describe('RelatedEpisodesGroupSubsection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders as expected when episodes are returned', () => {
    const episode = {
      'episode.id': 'ep-2',
      'episode.status': 'active',
      'rule.id': 'rule-1',
      group_hash: 'gh-1',
    } as AlertEpisode;

    mockUseFetch.mockReturnValue({ data: [episode], isLoading: false } as any);

    render(
      <I18nProvider>
        <RelatedEpisodesGroupSubsection
          currentEpisodeId="ep-1"
          groupHash="gh-1"
          {...mockRuleProps}
          getEpisodeDetailsHref={mockGetEpisodeDetailsHref}
        />
      </I18nProvider>
    );
    expect(screen.getByText('Same alert group')).toBeInTheDocument();
    expect(screen.getByTestId('mockEpisodesList')).toBeInTheDocument();
    expect(screen.getByText('1 episodes')).toBeInTheDocument();
  });

  it('shows a loading spinner while fetching', () => {
    mockUseFetch.mockReturnValue({ data: [], isLoading: true } as any);

    render(
      <I18nProvider>
        <RelatedEpisodesGroupSubsection
          currentEpisodeId="ep-1"
          groupHash="gh-1"
          {...mockRuleProps}
          getEpisodeDetailsHref={mockGetEpisodeDetailsHref}
        />
      </I18nProvider>
    );

    expect(screen.getByTestId('alertingV2RelatedEpisodesGroupLoading')).toBeInTheDocument();
  });

  it('shows the empty state when there are no episodes', () => {
    mockUseFetch.mockReturnValue({ data: [], isLoading: false } as any);

    render(
      <I18nProvider>
        <RelatedEpisodesGroupSubsection
          currentEpisodeId="ep-1"
          groupHash="gh-1"
          {...mockRuleProps}
          getEpisodeDetailsHref={mockGetEpisodeDetailsHref}
        />
      </I18nProvider>
    );

    expect(screen.getByTestId('alertingV2RelatedEpisodesGroupEmpty')).toBeInTheDocument();
    expect(screen.getByText('No other episodes in this group.')).toBeInTheDocument();
  });
});
