/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConversationSettingsManagement } from '.';
import { useFetchCurrentUserConversations, useFetchPrompts } from '../../api';
import { useAssistantContext } from '../../../assistant_context';
import { useConversationsUpdater } from '../../settings/use_settings_updater/use_conversations_updater';
import { alertConvo, MOCK_CURRENT_USER, welcomeConvo } from '../../../mock/conversation';
import * as i18n from './translations';

const mockChangeSharing = 'Change sharing';

jest.mock('../../api');
jest.mock('../../../assistant_context');
jest.mock('../../settings/use_settings_updater/use_conversations_updater');
jest.mock('../conversation_settings/conversation_settings_editor', () => ({
  ConversationSettingsEditor: ({
    selectedConversation,
    setConversationsSettingsBulkActions,
  }: {
    selectedConversation: typeof alertConvo;
    setConversationsSettingsBulkActions: jest.Mock;
  }) => (
    <button
      data-test-subj="change-sharing"
      onClick={() =>
        setConversationsSettingsBulkActions({
          update: {
            [selectedConversation.id]: {
              id: selectedConversation.id,
              users: [],
            },
          },
        })
      }
      type="button"
    >
      {mockChangeSharing}
    </button>
  ),
}));

const mockSaveConversationsSettings = jest.fn().mockResolvedValue(true);
const mockSetConversationsSettingsBulkActions = jest.fn();
const mockConversations = {
  [alertConvo.id]: alertConvo,
  [welcomeConvo.id]: welcomeConvo,
};
const defaultProps = {
  connectors: [],
};

describe('ConversationSettingsManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveConversationsSettings.mockResolvedValue(true);
    (useAssistantContext as jest.Mock).mockReturnValue({
      actionTypeRegistry: {
        get: jest.fn(),
        has: jest.fn().mockReturnValue(false),
        list: jest.fn().mockReturnValue([]),
        register: jest.fn(),
      },
      assistantAvailability: { isAssistantEnabled: true },
      currentUser: MOCK_CURRENT_USER,
      http: { fetch: jest.fn() },
      nameSpace: 'default',
      toasts: { addSuccess: jest.fn() },
    });
    (useFetchPrompts as jest.Mock).mockReturnValue({
      data: { data: [] },
      refetch: jest.fn(),
    });
    (useFetchCurrentUserConversations as jest.Mock).mockReturnValue({
      data: mockConversations,
      isFetched: true,
      refetch: jest.fn(),
    });
    (useConversationsUpdater as jest.Mock).mockReturnValue({
      assistantStreamingEnabled: true,
      conversationsSettingsBulkActions: { update: { [alertConvo.id]: { id: alertConvo.id } } },
      onConversationsBulkDeleted: jest.fn(),
      onConversationDeleted: jest.fn(),
      resetConversationsSettings: jest.fn(),
      saveConversationsSettings: mockSaveConversationsSettings,
      setConversationSettings: jest.fn(),
      setConversationsSettingsBulkActions: mockSetConversationsSettingsBulkActions,
      setUpdatedAssistantStreamingEnabled: jest.fn(),
    });
  });

  it('saves selected conversation edits without delete-all params', async () => {
    render(<ConversationSettingsManagement {...defaultProps} />);

    fireEvent.click(screen.getByTestId('selectAllConversations'));
    fireEvent.click(screen.getByText(alertConvo.title));
    fireEvent.click(screen.getByTestId('change-sharing'));
    fireEvent.click(screen.getByTestId('save-button'));

    await waitFor(() =>
      expect(mockSaveConversationsSettings).toHaveBeenCalledWith({ isDeleteAll: false })
    );
  });

  it('keeps delete-all params for confirmed select-all deletion', async () => {
    render(<ConversationSettingsManagement {...defaultProps} />);

    fireEvent.click(screen.getByTestId('selectAllConversations'));
    fireEvent.click(screen.getAllByRole('button', { name: i18n.DELETE_SELECTED_CONVERSATIONS })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: i18n.DELETE_SELECTED_CONVERSATIONS })[1]);

    await waitFor(() =>
      expect(mockSaveConversationsSettings).toHaveBeenCalledWith({
        excludedIds: [],
        isDeleteAll: true,
      })
    );
  });
});
