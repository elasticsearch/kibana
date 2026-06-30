/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type React from 'react';
import { useCallback } from 'react';
import type { ApiConfig, User } from '@kbn/elastic-assistant-common';
import type { DataStreamApis } from '../use_data_stream_apis';
import * as i18n from './translations';
import { useAssistantContext } from '../../assistant_context';
import type { Conversation, ClientMessage } from '../../assistant_context/types';
import {
  createConversation as createConversationApi,
  deleteConversation as deleteConversationApi,
  getConversationById,
  updateConversation,
} from '../api/conversations';

interface SetApiConfigProps {
  conversation: Conversation;
  apiConfig: ApiConfig;
}

interface UpdateConversationTitleProps {
  conversationId: string;
  updatedTitle: string;
}

interface UpdateConversationUsersProps {
  conversationId: string;
  updatedUsers: User[];
}

export interface UseConversation {
  clearConversation: (conversation: Conversation) => Promise<Conversation | undefined>;
  copyConversationUrl: (conversation?: Conversation) => Promise<void>;
  duplicateConversation: (args: {
    refetchCurrentUserConversations: DataStreamApis['refetchCurrentUserConversations'];
    selectedConversation?: Conversation;
    setCurrentConversation: React.Dispatch<React.SetStateAction<Conversation | undefined>>;
  }) => Promise<void>;
  deleteConversation: (conversationId: string) => void;
  removeLastMessage: (conversationId: string) => Promise<ClientMessage[] | undefined>;
  setApiConfig: ({
    conversation,
    apiConfig,
  }: SetApiConfigProps) => Promise<Conversation | undefined>;
  createConversation: (conversation: Partial<Conversation>) => Promise<Conversation | undefined>;
  getConversation: (conversationId: string, silent?: boolean) => Promise<Conversation | undefined>;
  updateConversationTitle: ({
    conversationId,
    updatedTitle,
  }: UpdateConversationTitleProps) => Promise<Conversation>;
  updateConversationUsers: ({
    conversationId,
    updatedUsers,
  }: UpdateConversationUsersProps) => Promise<Conversation>;
}

export const useConversation = (): UseConversation => {
  const { http, toasts } = useAssistantContext();

  const getConversation = useCallback(
    async (conversationId: string, silent?: boolean) => {
      return getConversationById({
        http,
        id: conversationId,
        toasts: !silent ? toasts : undefined,
      });
    },
    [http, toasts]
  );

  /**
   * Removes the last message of conversation[] for a given conversationId
   */
  const removeLastMessage = useCallback(
    async (conversationId: string) => {
      let messages: ClientMessage[] = [];
      const prevConversation = await getConversationById({ http, id: conversationId, toasts });
      if (prevConversation != null) {
        messages = prevConversation.messages.slice(0, prevConversation.messages.length - 1);
        await updateConversation({
          http,
          conversationId,
          messages,
          toasts,
        });
      }
      return messages;
    },
    [http, toasts]
  );

  const clearConversation = useCallback(
    async (conversation: Conversation) => {
      if (conversation.apiConfig) {
        return updateConversation({
          http,
          toasts,
          conversationId: conversation.id,
          apiConfig: conversation.apiConfig,
          messages: [],
          replacements: {},
        });
      }
    },
    [http, toasts]
  );

  /**
   * Create a new conversation with the given conversation
   */
  const createConversation = useCallback(
    async (conversation: Partial<Conversation>): Promise<Conversation | undefined> => {
      return createConversationApi({ http, conversation, toasts });
    },
    [http, toasts]
  );

  /**
   * Delete the conversation with the given conversationId
   */
  const deleteConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      await deleteConversationApi({ http, id: conversationId, toasts });
    },
    [http, toasts]
  );

  /**
   * Create/Update the apiConfig for a given conversationId
   */
  const setApiConfig = useCallback(
    async ({ conversation, apiConfig }: SetApiConfigProps) => {
      if (conversation.id === '') {
        // Conversation ID is required to set API config, return empty conversation
        return { ...conversation, apiConfig };
      } else {
        return updateConversation({
          http,
          conversationId: conversation.id,
          apiConfig,
          toasts,
        });
      }
    },
    [http, toasts]
  );

  const updateConversationTitle = useCallback(
    ({ conversationId, updatedTitle }: UpdateConversationTitleProps): Promise<Conversation> =>
      updateConversation({
        http,
        conversationId,
        title: updatedTitle,
      }),
    [http]
  );

  const updateConversationUsers = useCallback(
    ({ conversationId, updatedUsers }: UpdateConversationUsersProps): Promise<Conversation> =>
      updateConversation({
        http,
        conversationId,
        users: updatedUsers,
      }),
    [http]
  );

  /**
   * Duplicates the selected conversation by creating a new conversation
   * Refetches the current user conversations and sets the new conversation as the current one
   */
  const duplicateConversation = useCallback(
    async ({
      refetchCurrentUserConversations,
      selectedConversation,
      setCurrentConversation,
    }: {
      refetchCurrentUserConversations: DataStreamApis['refetchCurrentUserConversations'];
      selectedConversation?: Conversation;
      setCurrentConversation: React.Dispatch<React.SetStateAction<Conversation | undefined>>;
    }) => {
      try {
        if (!selectedConversation || selectedConversation.id === '') {
          throw new Error('No conversation available to duplicate');
        }
        let conversation = selectedConversation;
        if ((selectedConversation.messages ?? []).length === 0) {
          // Fetch conversation details if the messages array is empty
          // This is necessary because conversation lists don't include message content
          const conversationWithMessages = await getConversation(selectedConversation.id, true);
          if (conversationWithMessages) {
            conversation = conversationWithMessages;
          }
        }
        const newConversation = await createConversation({
          title: `[${i18n.DUPLICATE}] ${conversation.title}`,
          apiConfig: conversation.apiConfig,
          messages: conversation.messages,
          replacements: conversation.replacements,
        });
        if (newConversation) {
          await refetchCurrentUserConversations();
          setCurrentConversation(newConversation);
          toasts?.addSuccess({
            title: i18n.DUPLICATE_SUCCESS(newConversation.title),
          });
        } else {
          throw new Error('Failed to duplicate conversation');
        }
      } catch (error) {
        toasts?.addError(error, {
          title: i18n.DUPLICATE_ERROR,
        });
      }
    },
    [createConversation, getConversation, toasts]
  );

  const copyConversationUrl = useCallback(
    async (conversation?: Conversation) => {
      try {
        if (!conversation) {
          throw new Error('No conversation id available to copy');
        }
        const conversationUrl = http?.basePath.prepend(
          `/app/security/get_started?assistant=${conversation.id}`
        );

        if (!conversationUrl) {
          throw new Error('Conversation URL does not exist');
        }

        const urlToCopy = new URL(conversationUrl, window.location.origin).toString();
        navigator.clipboard?.writeText(urlToCopy);

        toasts?.addSuccess({
          title: i18n.COPY_URL_SUCCESS,
        });
      } catch (error) {
        toasts?.addError(error, {
          title: i18n.COPY_URL_ERROR,
        });
      }
    },
    [http?.basePath, toasts]
  );

  return {
    clearConversation,
    deleteConversation,
    removeLastMessage,
    setApiConfig,
    updateConversationTitle,
    createConversation,
    getConversation,
    updateConversationUsers,
    copyConversationUrl,
    duplicateConversation,
  };
};
