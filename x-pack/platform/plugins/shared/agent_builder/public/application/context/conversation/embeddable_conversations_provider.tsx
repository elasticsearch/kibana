/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useEffect, useCallback, useState, useRef } from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { agentBuilderDefaultAgentId, AGENT_BUILDER_EVENT_TYPES } from '@kbn/agent-builder-common';
import type { ConversationAttachment } from '@kbn/agent-builder-common/attachments';
import type {
  EmbeddableConversationInternalProps,
  EmbeddableConversationProps,
} from '../../../embeddable/types';
import { ConversationContext } from './conversation_context';
import { upsertAttachmentsIntoList } from './upsert_attachments_into_list';
import { removeAttachmentFromList } from './remove_attachment_from_list';
import { removeAttachmentById } from './remove_attachment_by_id';
import { AgentBuilderServicesContext } from '../agent_builder_services_context';
import { StreamingProvider } from '../streaming/streaming_context';
import { ConversationStreamService } from '../../../services';
import { useConversationActions } from './use_conversation_actions';
import { ConversationChangeNotifier } from './conversation_change_notifier';
import { usePersistedConversationId } from '../../hooks/use_persisted_conversation_id';
import { AppLeaveContext } from '../app_leave_context';
import { useEffectiveSpaceDefaultAgent } from '../../hooks/use_space_default_agent';
import { RedirectLoading } from '../../components/redirects/redirect_loading';

const noopOnAppLeave = () => {};

/**
 * Pins restricted (non-`manageAgents`) users to their space's default agent.
 */
export const PinnedConversationProvider: React.FC<
  React.PropsWithChildren<{ baseValue: NonNullable<React.ContextType<typeof ConversationContext>> }>
> = ({ baseValue, children }) => {
  const { effectiveDefaultAgentId, isRestricted, isReady } = useEffectiveSpaceDefaultAgent();
  const value = useMemo(
    () =>
      isRestricted && effectiveDefaultAgentId
        ? { ...baseValue, agentId: effectiveDefaultAgentId }
        : baseValue,
    [baseValue, isRestricted, effectiveDefaultAgentId]
  );
  return (
    <ConversationContext.Provider value={value}>
      <ConversationChangeNotifier />
      {isReady ? children : <RedirectLoading />}
    </ConversationContext.Provider>
  );
};
interface EmbeddableConversationsProviderProps extends EmbeddableConversationInternalProps {
  children: React.ReactNode;
}

export const EmbeddableConversationsProvider: React.FC<EmbeddableConversationsProviderProps> = ({
  children,
  coreStart,
  services,
  ...contextProps
}) => {
  // Track current props, starting with initial props
  const [currentProps, setCurrentProps] = useState<EmbeddableConversationProps>(contextProps);

  // Register callbacks to allow parent to update props and clear browserApiTools
  const onRegisterCallbacks = contextProps.onRegisterCallbacks;
  useEffect(() => {
    if (onRegisterCallbacks) {
      onRegisterCallbacks({
        updateProps: (newProps) => setCurrentProps(newProps),
        resetBrowserApiTools: () =>
          setCurrentProps((prevProps) => ({ ...prevProps, browserApiTools: undefined })),
        addAttachment: (attachment) =>
          setCurrentProps((prevProps) => ({
            ...prevProps,
            attachments: upsertAttachmentsIntoList(prevProps.attachments, [attachment]),
          })),
        removeAttachmentById: (attachmentId) =>
          setCurrentProps((prevProps) => ({
            ...prevProps,
            attachments: prevProps.attachments
              ? removeAttachmentById(prevProps.attachments, attachmentId)
              : prevProps.attachments,
          })),
      });
    }
  }, [onRegisterCallbacks]);

  // Create a QueryClient per instance to ensure cache isolation between multiple embeddable conversations
  const queryClient = useMemo(() => new QueryClient(), []);
  const conversationStreamService = useMemo(
    () => new ConversationStreamService(services.eventsService),
    [services.eventsService]
  );

  const kibanaServices = useMemo(
    () => ({
      ...coreStart,
      plugins: {
        ...services.startDependencies,
      },
    }),
    [coreStart, services.startDependencies]
  );

  const { persistedConversationId, updatePersistedConversationId } = usePersistedConversationId({
    sessionTag: currentProps.sessionTag,
    agentId: currentProps.agentId,
  });

  const hasFiredChatOpenRef = useRef(false);
  useEffect(() => {
    if (hasFiredChatOpenRef.current) return;
    hasFiredChatOpenRef.current = true;

    let kibanaApp: string | undefined;
    const sub = coreStart.application.currentAppId$.subscribe((appId) => {
      kibanaApp = appId;
    });
    sub.unsubscribe();

    const agentId = currentProps.agentId ?? agentBuilderDefaultAgentId;
    void services.agentService
      .list()
      .then((agents) => {
        coreStart.analytics.reportEvent(AGENT_BUILDER_EVENT_TYPES.InappChatOpen, {
          agent_id: agentId,
          kibana_app: kibanaApp ?? 'unknown',
          agent_count: agents.length,
        });
      })
      .catch(() => {
        coreStart.analytics.reportEvent(AGENT_BUILDER_EVENT_TYPES.InappChatOpen, {
          agent_id: agentId,
          kibana_app: kibanaApp ?? 'unknown',
        });
      });
  }, [
    coreStart.analytics,
    coreStart.application.currentAppId$,
    currentProps.agentId,
    services.agentService,
  ]);

  const hasInitializedConversationIdRef = useRef(false);

  const setConversationId = useCallback(
    (id?: string) => {
      if (id !== persistedConversationId) {
        updatePersistedConversationId(id);
      }
      // Functional updater prevents stale closure capture of currentProps.
      setCurrentProps((prevProps) => ({
        ...prevProps,
        // reset new conversation flag when a valid id is assigned
        ...(prevProps.newConversation && id ? { newConversation: undefined } : {}),
      }));
    },
    [persistedConversationId, updatePersistedConversationId]
  );

  const validateAndSetConversationId = useCallback(
    async (id: string) => {
      try {
        const conversation = await services.conversationsService.get({ conversationId: id });
        setConversationId(conversation.id ?? undefined);
      } catch {
        setConversationId(undefined);
      }
    },
    [services.conversationsService, setConversationId]
  );

  // One-time initialization per provider instance:
  // - If newConversation flag is set, clears the conversation ID to start fresh.
  // - Otherwise, if there's a persisted conversation ID, validates and restores it.
  // - Otherwise, clears the conversation ID.
  // Guarded by hasInitializedConversationIdRef to prevent re-running on subsequent renders.
  useEffect(() => {
    if (hasInitializedConversationIdRef.current) return;

    if (contextProps.newConversation) {
      setConversationId(undefined);
    } else if (persistedConversationId) {
      validateAndSetConversationId(persistedConversationId);
    } else {
      setConversationId(undefined);
    }
    hasInitializedConversationIdRef.current = true;
  }, [
    contextProps.newConversation,
    persistedConversationId,
    setConversationId,
    validateAndSetConversationId,
  ]);

  const onDeleteConversation = useCallback(() => {
    setConversationId(undefined);
  }, [setConversationId]);

  // Derived conversation ID
  const conversationId = useMemo(() => {
    if (currentProps.newConversation) {
      return undefined;
    }
    // After initialization, always use persisted ID
    return persistedConversationId;
  }, [currentProps, persistedConversationId]);

  const conversationActions = useConversationActions({
    conversationId,
    queryClient,
    conversationsService: services.conversationsService,
    onDeleteConversation,
  });

  // Resets the {initialMessage} and {autoSendInitialMessage} flags after an initial message has been sent or set in the {ConversationInput} component
  const resetInitialMessage = useCallback(() => {
    setCurrentProps((prevProps) => ({
      ...prevProps,
      initialMessage: undefined,
      autoSendInitialMessage: false,
    }));
  }, []);

  // Resets the {attachments} array after attachment(s) have been sent as part of a Conversation Round.
  const resetAttachments = useCallback(() => {
    setCurrentProps((prevProps) => ({ ...prevProps, attachments: undefined }));
  }, []);

  const upsertAttachments = useCallback((attachments: ConversationAttachment[]) => {
    if (attachments.length === 0) {
      return;
    }
    setCurrentProps((prevProps) => ({
      ...prevProps,
      attachments: upsertAttachmentsIntoList(prevProps.attachments, attachments),
    }));
  }, []);

  const removeAttachment = useCallback((attachmentIndex: number) => {
    setCurrentProps((prevProps) => {
      if (!prevProps.attachments) return prevProps;
      return {
        ...prevProps,
        attachments: removeAttachmentFromList(prevProps.attachments, attachmentIndex),
      };
    });
  }, []);

  const setAgentId = useCallback((id: string) => {
    setCurrentProps((prev) => ({ ...prev, agentId: id, newConversation: true }));
  }, []);

  const conversationContextValue = useMemo(
    () => ({
      conversationId,
      isEmbeddedContext: true,
      sessionTag: currentProps.sessionTag,
      agentId: currentProps.agentId ?? agentBuilderDefaultAgentId,
      initialMessage: currentProps.initialMessage,
      autoSendInitialMessage: currentProps.autoSendInitialMessage ?? false,
      greetingMessage: currentProps.greetingMessage,
      resetInitialMessage,
      browserApiTools: currentProps.browserApiTools,
      setConversationId,
      setAgentId,
      attachments: currentProps.attachments,
      upsertAttachments,
      resetAttachments,
      removeAttachment,
      conversationActions,
    }),
    [
      conversationId,
      currentProps.sessionTag,
      currentProps.agentId,
      currentProps.initialMessage,
      currentProps.autoSendInitialMessage,
      currentProps.greetingMessage,
      currentProps.browserApiTools,
      currentProps.attachments,
      upsertAttachments,
      resetInitialMessage,
      setConversationId,
      setAgentId,
      resetAttachments,
      removeAttachment,
      conversationActions,
    ]
  );

  return (
    <KibanaContextProvider services={kibanaServices}>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <AgentBuilderServicesContext.Provider value={services}>
            <AppLeaveContext.Provider value={noopOnAppLeave}>
              <StreamingProvider conversationStreamService={conversationStreamService}>
                <PinnedConversationProvider baseValue={conversationContextValue}>
                  {children}
                </PinnedConversationProvider>
              </StreamingProvider>
            </AppLeaveContext.Provider>
          </AgentBuilderServicesContext.Provider>
        </QueryClientProvider>
      </I18nProvider>
    </KibanaContextProvider>
  );
};
