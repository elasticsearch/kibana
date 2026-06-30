/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { ALERT_EPISODE_STATUS } from '@kbn/alerting-v2-schemas';
import type { EpisodeEventRow } from '../../queries/episode_events_query';
import type { EpisodeActionHistoryEntry } from '../../queries/episode_actions_history_query';
import { useFetchEpisodeEventsQuery } from '../../hooks/use_fetch_episode_events_query';
import { useFetchEpisodeActionsHistoryQuery } from '../../hooks/use_fetch_episode_actions_history_query';
import { useBulkGetProfiles } from '../../hooks/use_bulk_get_profiles';
import { AlertEpisodeTimelineSection } from './timeline_section';

jest.mock('../../hooks/use_fetch_episode_events_query');
jest.mock('../../hooks/use_fetch_episode_actions_history_query');
jest.mock('../../hooks/use_bulk_get_profiles');

const mockUseFetchEvents = jest.mocked(useFetchEpisodeEventsQuery);
const mockUseFetchActionsHistory = jest.mocked(useFetchEpisodeActionsHistoryQuery);
const mockUseBulkGetProfiles = jest.mocked(useBulkGetProfiles);

const mockServices = {
  data: {} as never,
  spaces: {} as never,
  userProfile: {} as never,
};

const makeRow = (status: string, ts: string): EpisodeEventRow => ({
  '@timestamp': ts,
  'episode.id': 'ep-1',
  'episode.status': status as EpisodeEventRow['episode.status'],
  'rule.id': 'rule-1',
  group_hash: 'hash-1',
});

const mockEventRows = [
  makeRow(ALERT_EPISODE_STATUS.PENDING, '2024-01-01T00:00:00.000Z'),
  makeRow(ALERT_EPISODE_STATUS.ACTIVE, '2024-01-01T00:01:00.000Z'),
];

const mockAction: EpisodeActionHistoryEntry = {
  '@timestamp': '2024-01-01T00:01:30.000Z',
  action_type: 'ack',
  actor: 'user-uid-1',
  episode_id: 'ep-1',
  group_hash: 'hash-1',
  tags: null,
  assignee_uid: null,
  expiry: null,
  reason: null,
};

const renderSection = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AlertEpisodeTimelineSection episodeId="ep-1" groupHash="hash-1" services={mockServices} />
    </QueryClientProvider>
  );
};

const mockEvents = (eventRows: EpisodeEventRow[]) =>
  mockUseFetchEvents.mockReturnValue({ data: eventRows, isLoading: false } as never);

const mockActions = (actions: EpisodeActionHistoryEntry[], isLoading = false) =>
  mockUseFetchActionsHistory.mockReturnValue({ data: actions, isLoading } as never);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseBulkGetProfiles.mockReturnValue({ data: [], isLoading: false } as never);
  mockEvents(mockEventRows);
  mockActions([]);
});

describe('AlertEpisodeTimelineSection', () => {
  it('shows a spinner while loading actions', () => {
    mockActions([], true);
    renderSection();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows empty prompt when there are no events and no actions', () => {
    mockEvents([]);
    mockActions([]);
    renderSection();
    expect(screen.getByTestId('alertingV2TimelineSectionEmpty')).toBeInTheDocument();
  });

  it('renders one EuiComment per merged entry, newest first', () => {
    mockEvents(mockEventRows);
    mockActions([mockAction]);
    renderSection();
    // 2 state-change entries + 1 action entry = 3 comments
    const comments = screen.getAllByTestId('alertingV2TimelineEntry');
    expect(comments).toHaveLength(3);
    expect(comments[0]).toHaveAttribute('data-timestamp', '2024-01-01T00:01:30.000Z');
  });

  it('shows "Episode started" text for the initial state entry', () => {
    mockEvents([makeRow(ALERT_EPISODE_STATUS.PENDING, '2024-01-01T00:00:00.000Z')]);
    mockActions([]);
    renderSection();
    expect(screen.getByText(/Episode started/i)).toBeInTheDocument();
  });

  it('shows "Episode status changed" text for subsequent transitions', () => {
    mockEvents(mockEventRows);
    mockActions([]);
    renderSection();
    expect(screen.getByText(/Episode status changed/i)).toBeInTheDocument();
  });

  it('shows the action label for action entries', () => {
    mockEvents([]);
    mockActions([mockAction]);
    renderSection();
    expect(screen.getByText('acknowledged on')).toBeInTheDocument();
  });

  it('falls back to "system" username when actor is null', () => {
    mockEvents([]);
    mockActions([{ ...mockAction, actor: null }]);
    renderSection();
    expect(screen.getAllByText('system').length).toBeGreaterThan(0);
  });
});
