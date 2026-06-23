/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexItem } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { PropsWithChildren } from 'react';
import React, { useEffect, useMemo } from 'react';
import { ConversationInputShell } from '@kbn/agent-builder-browser';
import { useConversationId } from '../../../context/conversation/use_conversation_id';
import { useConversationStream } from '../../../hooks/use_conversation_stream';
import { useSubmitMessage } from '../../../hooks/use_submit_message';
import { useAgentBuilderAgents } from '../../../hooks/agents/use_agents';
import { useValidateAgentId } from '../../../hooks/agents/use_validate_agent_id';
import {
  useAgentId,
  useConversationTitle,
  useHasActiveConversation,
  useIsAwaitingPrompt,
} from '../../../hooks/use_conversation';
import { MessageEditor, useMessageEditor, CommandBadgeSerializationError } from './message_editor';
import { useToasts } from '../../../hooks/use_toasts';
import { InputActions } from './input_actions';
import { useConversationContext } from '../../../context/conversation/conversation_context';
import { AttachmentPillsRow } from './attachment_pills_row';

const containerAriaLabel = i18n.translate('xpack.agentBuilder.conversationInput.container.label', {
  defaultMessage: 'Message input form',
});

const flexGrowZeroStyles = css`
  flex-grow: 0;
`;

const InputContainer: React.FC<
  PropsWithChildren<{ isDisabled: boolean; isCollapsed: boolean }>
> = ({ children, isDisabled, isCollapsed }) => (
  <ConversationInputShell
    isDisabled={isDisabled}
    isCollapsed={isCollapsed}
    css={flexGrowZeroStyles}
    data-test-subj="agentBuilderConversationInputForm"
    aria-label={containerAriaLabel}
  >
    {children}
  </ConversationInputShell>
);

interface ConversationInputProps {
  onSubmit?: () => void;
  onEditorFocus?: () => void;
  onSubmitOverride?: (message: string) => void;
}

const disabledPlaceholder = (agentId?: string) =>
  i18n.translate('xpack.agentBuilder.conversationInput.textArea.disabledPlaceholder', {
    defaultMessage: 'Agent "{agentId}" has been deleted. Please start a new conversation.',
    values: {
      agentId,
    },
  });
const enabledPlaceholder = i18n.translate(
  'xpack.agentBuilder.conversationInput.textArea.enabledPlaceholder',
  {
    defaultMessage: 'Ask anything',
  }
);

const getMessageEditorAriaLabel = ({
  isNewConversation,
  conversationTitle,
}: {
  isNewConversation: boolean;
  conversationTitle: string;
}): string | undefined => {
  if (isNewConversation) {
    return i18n.translate(
      'xpack.agentBuilder.conversationInput.messageEditor.newConversationLabel',
      { defaultMessage: 'New conversation, Message input' }
    );
  }
  return i18n.translate('xpack.agentBuilder.conversationInput.messageEditor.conversationLabel', {
    defaultMessage: '{title} conversation, Message input',
    values: { title: conversationTitle },
  });
};

export const ConversationInput: React.FC<ConversationInputProps> = ({
  onSubmit,
  onEditorFocus,
  onSubmitOverride,
}) => {
  const { pendingMessage, error, isResuming, isResponseLoading } = useConversationStream();
  const { isFetched } = useAgentBuilderAgents();
  const agentId = useAgentId();
  const conversationId = useConversationId();

  const { messageEditor, controller: messageEditorController } = useMessageEditor({
    onEditorFocus,
  });
  const { addErrorToast } = useToasts();
  const hasActiveConversation = useHasActiveConversation();
  const isAwaitingPrompt = useIsAwaitingPrompt();
  const { attachments, initialMessage, autoSendInitialMessage, resetInitialMessage } =
    useConversationContext();
  const submitMessage = useSubmitMessage();

  const validateAgentId = useValidateAgentId();
  const isAgentIdValid = validateAgentId(agentId);

  const isAgentDeleted = !isAgentIdValid && isFetched && Boolean(agentId);
  const isInputDisabled = isAgentDeleted || isAwaitingPrompt || isResuming;
  const isSubmitDisabled =
    messageEditorController.isEmpty || isResponseLoading || !isAgentIdValid || isAwaitingPrompt;

  const placeholder = isAgentDeleted ? disabledPlaceholder(agentId) : enabledPlaceholder;

  const editorContainerStyles = css`
    display: flex;
    flex-direction: column;
    height: 100%;
  `;
  // Hide attachments if there's an error from current round or if message has been just sent
  const shouldHideAttachments = Boolean(error) || isResponseLoading;

  const shouldCollapseInput = isResponseLoading || hasActiveConversation;

  const visibleAttachments = useMemo(() => {
    if (!attachments || shouldHideAttachments) return [];
    return attachments.filter((attachment) => {
      if ('items' in attachment) return true; // AttachmentGroup — always visible
      return !attachment.hidden;
    });
  }, [attachments, shouldHideAttachments]);

  const isNewConversation = !conversationId;
  const { title: conversationTitle } = useConversationTitle();

  const messageEditorAriaLabel = getMessageEditorAriaLabel({
    isNewConversation,
    conversationTitle,
  });

  // Set initial message in input when {autoSendInitialMessage} is false and {initialMessage} is provided
  useEffect(() => {
    if (initialMessage && !autoSendInitialMessage && isNewConversation) {
      messageEditorController.setContent(initialMessage);
      messageEditorController.focus();
      resetInitialMessage?.(); // Reset the initial message to avoid sending it again
    }
  }, [
    initialMessage,
    autoSendInitialMessage,
    isNewConversation,
    messageEditorController,
    resetInitialMessage,
  ]);

  // Auto-focus when conversation changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      messageEditorController.focus();
    }, 200);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [conversationId, messageEditorController]);

  const handleSubmit = () => {
    if (isSubmitDisabled) {
      return;
    }
    let content: string;
    try {
      content = messageEditorController.getContent();
    } catch (contentError) {
      if (contentError instanceof CommandBadgeSerializationError) {
        addErrorToast(
          i18n.translate('xpack.agentBuilder.conversationInput.invalidCommandBadge', {
            defaultMessage:
              'Your message contains an invalid command. Remove the command and try again.',
          })
        );
      }
      return;
    }
    if (onSubmitOverride) {
      onSubmitOverride(content);
    } else {
      submitMessage(content);
    }
    messageEditorController.clear();
    onSubmit?.();
  };

  return (
    <InputContainer isDisabled={isInputDisabled} isCollapsed={shouldCollapseInput}>
      {visibleAttachments.length > 0 && (
        <EuiFlexItem grow={false}>
          <AttachmentPillsRow attachments={visibleAttachments} removable />
        </EuiFlexItem>
      )}
      <EuiFlexItem css={editorContainerStyles}>
        <MessageEditor
          messageEditor={messageEditor}
          onSubmit={handleSubmit}
          disabled={isInputDisabled}
          placeholder={placeholder}
          ariaLabel={messageEditorAriaLabel}
          data-test-subj="agentBuilderConversationInputEditor"
        />
      </EuiFlexItem>
      {!isAgentDeleted && (
        <InputActions
          onSubmit={handleSubmit}
          isSubmitDisabled={isSubmitDisabled}
          resetToPendingMessage={() => {
            if (pendingMessage) {
              messageEditorController.setContent(pendingMessage);
            }
          }}
          agentId={agentId}
        />
      )}
    </InputContainer>
  );
};
