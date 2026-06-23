/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import type { CoreStart } from '@kbn/core/public';
import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import type { ConversationAttachment } from '@kbn/agent-builder-common/attachments';
import type {
  EmbeddableConversationInputRef,
  PublicEmbeddableConversationInputProps,
} from '@kbn/agent-builder-browser';
import type { AgentBuilderInternalService } from '../services';
import { EmbeddableConversationsProvider } from '../application/context/conversation/embeddable_conversations_provider';
import { ConversationInput } from '../application/components/conversations/conversation_input/conversation_input';
import { useConversationContext } from '../application/context/conversation/conversation_context';
import { useNavigation } from '../application/hooks/use_navigation';
import { appPaths } from '../application/utils/app_paths';
import type { EmbeddableConversationCallbacks } from './types';

export interface EmbeddableConversationInputInternalProps
  extends PublicEmbeddableConversationInputProps {
  services: AgentBuilderInternalService;
  coreStart: CoreStart;
}

/**
 * Rendered inside the embeddable provider stack. Reads attachments from
 * context and on submit navigates to the Agent Builder app with the message
 * and attachments preserved in location state, where the message auto-sends.
 */
const SubmitInterceptor: React.FC<{ agentId: string }> = ({ agentId }) => {
  const { attachments } = useConversationContext();
  const { navigateToAgentBuilderUrl } = useNavigation();

  const handleSubmit = useCallback(
    (message: string) => {
      navigateToAgentBuilderUrl(appPaths.agent.conversations.new({ agentId }), undefined, {
        initialMessage: message,
        attachments: attachments ?? [],
      });
    },
    [attachments, agentId, navigateToAgentBuilderUrl]
  );

  return <ConversationInput onSubmitOverride={handleSubmit} />;
};

export const EmbeddableConversationInputInternal = forwardRef<
  EmbeddableConversationInputRef,
  EmbeddableConversationInputInternalProps
>(({ agentId, services, coreStart }, ref) => {
  const targetAgentId = agentId ?? agentBuilderDefaultAgentId;
  // Captures the callbacks the provider registers on mount so we can invoke
  // them imperatively from outside the provider tree (i.e. via `ref`).
  const callbacksRef = useRef<EmbeddableConversationCallbacks | null>(null);

  const handleRegisterCallbacks = useCallback((callbacks: EmbeddableConversationCallbacks) => {
    callbacksRef.current = callbacks;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      addAttachment: (attachment: ConversationAttachment) => {
        callbacksRef.current?.addAttachment(attachment);
      },
    }),
    []
  );

  return (
    <EmbeddableConversationsProvider
      services={services}
      coreStart={coreStart}
      agentId={targetAgentId}
      newConversation
      ariaLabelledBy="agent-builder-embeddable-conversation-input"
      onRegisterCallbacks={handleRegisterCallbacks}
    >
      <SubmitInterceptor agentId={targetAgentId} />
    </EmbeddableConversationsProvider>
  );
});
