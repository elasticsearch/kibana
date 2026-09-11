/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { coreMock } from '@kbn/core/public/mocks';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';

import { EpisodeAssigneePanel } from './episode_assignee_panel';

const mockProfile = (uid: string, email: string): UserProfileWithAvatar => ({
  uid,
  enabled: true,
  user: { username: email, email },
  data: {},
});

const mockJoana = mockProfile('uid-joana', 'joana.cardoso@elastic.co');
const mockAnt = mockProfile('uid-ant', 'ant.fdjw@elastic.co');

const mockCore = coreMock.createStart();
const mockBulkGet = jest.fn();
const mockSuggest = jest.fn();

const mockServices = {
  ...mockCore,
  userProfile: {
    ...mockCore.userProfile,
    bulkGet: mockBulkGet,
    suggest: mockSuggest,
  },
};

/**
 * `EuiHighlight` splits an option's text around the search term, so query by the
 * stable per-option test subject that `UserProfilesSelectable` derives from the
 * profile username instead.
 */
const findUserOption = (username: string) =>
  screen.findByTestId(`userProfileSelectableOption-${username}`);

const renderPanel = (props: Partial<React.ComponentProps<typeof EpisodeAssigneePanel>> = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0 } },
  });
  const onApply = jest.fn();

  render(
    <KibanaContextProvider services={mockServices}>
      <QueryClientProvider client={queryClient}>
        <EpisodeAssigneePanel assigneeUid={null} onApply={onApply} {...props} />
      </QueryClientProvider>
    </KibanaContextProvider>
  );

  return { onApply };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockBulkGet.mockResolvedValue([]);
  mockSuggest.mockResolvedValue([]);
});

describe('EpisodeAssigneePanel', () => {
  it('disables Apply until the selection differs from the current assignee', async () => {
    mockBulkGet.mockResolvedValue([mockJoana]);
    mockSuggest.mockResolvedValue([mockJoana, mockAnt]);
    renderPanel({ assigneeUid: mockJoana.uid });

    await waitFor(() => {
      expect(screen.getByTestId('alertingV2EditEpisodeAssigneeApply')).toBeDisabled();
    });

    await userEvent.type(screen.getByPlaceholderText('Search users'), 'ant');
    await userEvent.click(await findUserOption(mockAnt.user.email!));

    await waitFor(() => {
      expect(screen.getByTestId('alertingV2EditEpisodeAssigneeApply')).toBeEnabled();
    });
  });

  it('batches the selection into a single onApply call with the picked uid', async () => {
    mockSuggest.mockResolvedValue([mockJoana, mockAnt]);
    const { onApply } = renderPanel();

    await userEvent.click(await findUserOption(mockJoana.user.email!));
    // Selecting a different user before applying must not fan out extra writes.
    await userEvent.click(await findUserOption(mockAnt.user.email!));

    expect(onApply).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('alertingV2EditEpisodeAssigneeApply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(mockAnt.uid);
  });

  it('applies null when the current assignee is deselected', async () => {
    mockBulkGet.mockResolvedValue([mockJoana]);
    const { onApply } = renderPanel({ assigneeUid: mockJoana.uid });

    await userEvent.click(await findUserOption(mockJoana.user.email!));
    await userEvent.click(screen.getByTestId('alertingV2EditEpisodeAssigneeApply'));

    expect(onApply).toHaveBeenCalledWith(null);
  });

  it('keeps Apply enabled with an empty selection in bulk mode so assignees can be cleared', async () => {
    const { onApply } = renderPanel({ assigneeUid: null, episodeCount: 3 });

    await waitFor(() => {
      expect(screen.getByTestId('alertingV2EditEpisodeAssigneeApply')).toBeEnabled();
    });

    await userEvent.click(screen.getByTestId('alertingV2EditEpisodeAssigneeApply'));

    expect(onApply).toHaveBeenCalledWith(null);
  });

  it('pluralises the empty list message for a bulk selection', async () => {
    renderPanel({ episodeCount: 3 });

    // EuiSelectable renders the message twice: once visibly, once in its live region.
    const [message] = await screen.findAllByTestId('alertingV2EditEpisodeAssigneeEmptyList');
    expect(message).toHaveTextContent('The selected episodes do not have any assigned users');
  });
  it('lists suggested users before anything is typed', async () => {
    mockSuggest.mockResolvedValue([mockJoana, mockAnt]);
    renderPanel();

    expect(await findUserOption(mockJoana.user.email!)).toBeInTheDocument();
    expect(await findUserOption(mockAnt.user.email!)).toBeInTheDocument();
    expect(mockSuggest).toHaveBeenCalledWith(expect.any(String), { name: '', size: 20 });
  });

  it('keeps a pending selection visible when the search stops matching it', async () => {
    mockSuggest.mockImplementation((_path: string, { name }: { name: string }) =>
      Promise.resolve(name === 'ant' ? [mockAnt] : [])
    );
    const { onApply } = renderPanel();

    await userEvent.type(screen.getByPlaceholderText('Search users'), 'ant');
    await userEvent.click(await findUserOption(mockAnt.user.email!));

    // Narrow the search to something the pending selection cannot match.
    await userEvent.clear(screen.getByPlaceholderText('Search users'));
    await userEvent.type(screen.getByPlaceholderText('Search users'), 'zzz');

    const pinned = await findUserOption(mockAnt.user.email!);
    expect(pinned).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByTestId('alertingV2EditEpisodeAssigneeApply'));
    expect(onApply).toHaveBeenCalledWith(mockAnt.uid);
  });

  it('keeps the current assignee in the list when the suggestions omit it', async () => {
    mockBulkGet.mockResolvedValue([mockJoana]);
    mockSuggest.mockResolvedValue([mockAnt]);
    const { onApply } = renderPanel({ assigneeUid: mockJoana.uid });

    // Without the merge the assignee would be invisible and impossible to clear.
    const currentOption = await findUserOption(mockJoana.user.email!);
    expect(currentOption).toBeInTheDocument();

    await userEvent.click(currentOption);
    await userEvent.click(screen.getByTestId('alertingV2EditEpisodeAssigneeApply'));

    expect(onApply).toHaveBeenCalledWith(null);
  });
});
