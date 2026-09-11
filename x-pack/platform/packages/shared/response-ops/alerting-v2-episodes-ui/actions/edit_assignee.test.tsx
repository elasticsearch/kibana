/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ALERT_EPISODE_STATUS } from '@kbn/alerting-v2-schemas';
import type { AlertEpisode } from '@kbn/alerting-v2-schemas';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { overlayServiceMock } from '@kbn/core-overlays-browser-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import { docLinksServiceMock } from '@kbn/core-doc-links-browser-mocks';
import { renderingServiceMock } from '@kbn/core-rendering-browser-mocks';
import { QueryClient } from '@kbn/react-query';

import { createEditAssigneeAction } from './edit_assignee';
import { bulkAssignEpisodeActions } from './bulk_create_alert_actions';
import { openAssigneeModal } from '../components/assignee_modal';

jest.mock('./bulk_create_alert_actions');
jest.mock('../components/assignee_modal');
jest.mock('../components/actions/edit_episode_assignee_popover_item', () => ({
  EditEpisodeAssigneePopoverItem: ({
    assigneeUid,
    episodeCount,
    onApply,
  }: {
    assigneeUid: string | null;
    episodeCount?: number;
    onApply: (uid: string | null) => void;
  }) => (
    <button
      type="button"
      data-test-subj="mockPopoverItem"
      data-assignee-uid={String(assigneeUid)}
      data-episode-count={episodeCount}
      onClick={() => onApply('uid-picked')}
    >
      {'Edit assignee'}
    </button>
  ),
}));

const mockBulkCreate = jest.mocked(bulkAssignEpisodeActions);
const mockOpenModal = jest.mocked(openAssigneeModal);

const makeEpisode = (id: string, assigneeUid?: string): AlertEpisode => ({
  '@timestamp': '2026-01-01T00:00:00.000Z',
  'episode.id': id,
  'episode.status': ALERT_EPISODE_STATUS.ACTIVE,
  'rule.id': 'rule-1',
  group_hash: `hash-${id}`,
  first_timestamp: '2026-01-01T00:00:00.000Z',
  last_timestamp: '2026-01-01T01:00:00.000Z',
  duration: 3600000,
  last_assignee_uid: assigneeUid,
});

const mockNotifications = notificationServiceMock.createStartContract();
const mockDeps = {
  http: httpServiceMock.createStartContract(),
  overlays: overlayServiceMock.createStartContract(),
  notifications: mockNotifications,
  rendering: renderingServiceMock.create(),
  userProfile: userProfileServiceMock.createStart(),
  docLinks: docLinksServiceMock.createStartContract(),
  queryClient: new QueryClient(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockBulkCreate.mockResolvedValue({ affected_count: 2, errors: [] } as never);
});

describe('createEditAssigneeAction', () => {
  describe('renderMenuItem', () => {
    it('seeds the picker with the episode assignee for a single episode', () => {
      const action = createEditAssigneeAction(mockDeps);
      render(<>{action.renderMenuItem!({ episodes: [makeEpisode('ep-1', 'uid-joana')] })}</>);

      const item = screen.getByTestId('mockPopoverItem');
      expect(item).toHaveAttribute('data-assignee-uid', 'uid-joana');
      expect(item).toHaveAttribute('data-episode-count', '1');
    });

    it('leaves the picker blank for a bulk selection', () => {
      const action = createEditAssigneeAction(mockDeps);
      render(
        <>
          {action.renderMenuItem!({
            episodes: [makeEpisode('ep-1', 'uid-joana'), makeEpisode('ep-2', 'uid-ant')],
          })}
        </>
      );

      const item = screen.getByTestId('mockPopoverItem');
      expect(item).toHaveAttribute('data-assignee-uid', 'null');
      expect(item).toHaveAttribute('data-episode-count', '2');
    });

    it('posts one ASSIGN per episode on apply and refreshes the caller', async () => {
      const onSuccess = jest.fn();
      const action = createEditAssigneeAction(mockDeps);
      render(
        <>
          {action.renderMenuItem!({
            episodes: [makeEpisode('ep-1'), makeEpisode('ep-2')],
            onSuccess,
          })}
        </>
      );

      await userEvent.click(screen.getByTestId('mockPopoverItem'));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      expect(mockBulkCreate).toHaveBeenCalledTimes(1);
      expect(mockBulkCreate).toHaveBeenCalledWith(mockDeps.http, [
        { episode_id: 'ep-1', assignee_uid: 'uid-picked' },
        { episode_id: 'ep-2', assignee_uid: 'uid-picked' },
      ]);
    });

    it('surfaces a danger toast when the bulk request fails', async () => {
      mockBulkCreate.mockRejectedValue(new Error('boom'));
      const onSuccess = jest.fn();
      const action = createEditAssigneeAction(mockDeps);
      render(<>{action.renderMenuItem!({ episodes: [makeEpisode('ep-1')], onSuccess })}</>);

      await userEvent.click(screen.getByTestId('mockPopoverItem'));

      await waitFor(() => expect(mockNotifications.toasts.addDanger).toHaveBeenCalled());
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    it('opens the modal and posts the picked uid', async () => {
      mockOpenModal.mockResolvedValue('uid-picked');
      const action = createEditAssigneeAction(mockDeps);

      await action.execute({ episodes: [makeEpisode('ep-1', 'uid-joana')] });

      expect(mockOpenModal).toHaveBeenCalledWith(
        mockDeps.overlays,
        mockDeps.rendering,
        expect.anything(),
        { assigneeUid: 'uid-joana', episodeCount: 1 }
      );
      expect(mockBulkCreate).toHaveBeenCalledWith(mockDeps.http, [
        expect.objectContaining({ episode_id: 'ep-1', assignee_uid: 'uid-picked' }),
      ]);
    });

    it('posts a null assignee when the picker clears the selection', async () => {
      mockOpenModal.mockResolvedValue(null);
      const action = createEditAssigneeAction(mockDeps);

      await action.execute({ episodes: [makeEpisode('ep-1', 'uid-joana')] });

      expect(mockBulkCreate).toHaveBeenCalledWith(mockDeps.http, [
        expect.objectContaining({ assignee_uid: null }),
      ]);
    });

    it('posts nothing when the modal is dismissed', async () => {
      mockOpenModal.mockResolvedValue(undefined);
      const action = createEditAssigneeAction(mockDeps);

      await action.execute({ episodes: [makeEpisode('ep-1')] });

      expect(mockBulkCreate).not.toHaveBeenCalled();
    });
  });
});
