/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@kbn/react-query';
import type { ConversationAttachment } from '@kbn/agent-builder-common/attachments';
import { AGENT_BUILDER_EVENT_TYPES } from '@kbn/agent-builder-common';
import { ConversationContext } from './conversation_context';
import type { LocationState } from '../../hooks/use_navigation';
import { appPaths } from '../../utils/app_paths';
import { useNavigation } from '../../hooks/use_navigation';
import { useAgentBuilderServices } from '../../hooks/use_agent_builder_service';
import { useKibana } from '../../hooks/use_kibana';
import { useConversationActions } from './use_conversation_actions';
import { upsertAttachmentsIntoList } from './upsert_attachments_into_list';
import { removeAttachmentFromList } from './remove_attachment_from_list';
import { ConversationChangeNotifier } from './conversation_change_notifier';

interface RoutedConversationsProviderProps {
  children: React.ReactNode;
}

export const RoutedConversationsProvider: React.FC<RoutedConversationsProviderProps> = ({
  children,
}) => {
  const queryClient = useQueryClient();
  const { conversationsService } = useAgentBuilderServices();
  const {
    services: { analytics },
  } = useKibana();
  const { conversationId: conversationIdParam, agentId: agentIdParam } = useParams<{
    conversationId?: string;
    agentId?: string;
  }>();

  const conversationId = useMemo(() => {
    return conversationIdParam === 'new' ? undefined : conversationIdParam;
  }, [conversationIdParam]);

  const agentIdFromPath = agentIdParam;

  const location = useLocation<LocationState>();
  const shouldStickToBottom = location.state?.shouldStickToBottom ?? true;
  const initialMessage = location.state?.initialMessage;
  // Defaults to true so existing deep-link auto-send keeps working; the abort bounce-back
  // passes false to prefill the input without sending.
  const autoSendInitialMessage = location.state?.autoSendInitialMessage ?? true;
  const entryPointSource = location.state?.entryPointSource ?? 'direct';

  const hasFiredEntryPointRef = useRef(false);
  useEffect(() => {
    if (!conversationId || !agentIdFromPath) return;
    if (hasFiredEntryPointRef.current) return;
    hasFiredEntryPointRef.current = true;
    analytics.reportEvent(AGENT_BUILDER_EVENT_TYPES.FullscreenEntryPoint, {
      agent_id: agentIdFromPath,
      conversation_id: conversationId,
      source: entryPointSource,
    });
  }, [analytics, agentIdFromPath, conversationId, entryPointSource]);

  const { navigateToAgentBuilderUrl } = useNavigation();

  const onDeleteConversation = useCallback(
    ({ isCurrentConversation }: { isCurrentConversation: boolean }) => {
      if (isCurrentConversation) {
        // If deleting current conversation, navigate to root (redirects to last used agent)
        navigateToAgentBuilderUrl(appPaths.root, undefined, { shouldStickToBottom: true });
      }
    },
    [navigateToAgentBuilderUrl]
  );

  const [attachments, setAttachments] = useState<ConversationAttachment[] | undefined>(
    location.state?.attachments
  );

  // Clear attachments when navigating to a different conversation, but not on initial mount.
  // Skipping initial mount prevents the parent effect from racing with child effects (e.g.
  // stale-attachments checks in conversation.tsx) that set attachments during the same render.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    setAttachments(undefined);
  }, [conversationId]);

  const conversationActions = useConversationActions({
    conversationId,
    queryClient,
    conversationsService,
    onDeleteConversation,
  });

  const upsertAttachments = useCallback((nextAttachments: ConversationAttachment[]) => {
    if (nextAttachments.length === 0) {
      return;
    }
    setAttachments((prev) => upsertAttachmentsIntoList(prev, nextAttachments));
  }, []);

  const resetAttachments = useCallback(() => {
    setAttachments(undefined);
  }, []);

  const removeAttachment = useCallback((attachmentIndex: number) => {
    setAttachments((prev) => {
      if (!prev) return prev;
      return removeAttachmentFromList(prev, attachmentIndex);
    });
  }, []);

  const contextValue = useMemo(
    () => ({
      conversationId,
      shouldStickToBottom,
      isEmbeddedContext: false,
      conversationActions,
      initialMessage,
      autoSendInitialMessage,
      agentId: agentIdFromPath,
      attachments,
      upsertAttachments,
      resetAttachments,
      removeAttachment,
    }),
    [
      conversationId,
      shouldStickToBottom,
      conversationActions,
      initialMessage,
      autoSendInitialMessage,
      agentIdFromPath,
      attachments,
      upsertAttachments,
      resetAttachments,
      removeAttachment,
    ]
  );

  return (
    <ConversationContext.Provider value={contextValue}>
      <ConversationChangeNotifier />
      {children}
    </ConversationContext.Provider>
  );
};
