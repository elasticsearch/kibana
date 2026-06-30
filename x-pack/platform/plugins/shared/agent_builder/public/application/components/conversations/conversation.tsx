/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  useEuiOverflowScroll,
  useEuiScrollBar,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isString } from 'lodash';
import {
  useConversationError,
  useConversationRounds,
  useHasActiveConversation,
} from '../../hooks/use_conversation';
import { ConversationInput } from './conversation_input/conversation_input';
import { ConversationRounds } from './conversation_rounds/conversation_rounds';
import { NewConversationPrompt } from './new_conversation_prompt';
import { useConversationId } from '../../context/conversation/use_conversation_id';
import { useShouldStickToBottom } from '../../context/conversation/use_should_stick_to_bottom';
import { useStreamingContext } from '../../context/streaming/streaming_context';
import { useIsAnyConversationStreaming } from '../../hooks/use_is_any_conversation_streaming';
import { useConversationScrollActions } from '../../hooks/use_conversation_scroll_actions';
import { useConversationStatus } from '../../hooks/use_conversation';
import { useSendPredefinedInitialMessage } from '../../hooks/use_initial_message';
import {
  conversationElementPaddingStyles,
  conversationElementWidthStyles,
  fullWidthAndHeightStyles,
} from './conversation.styles';
import { ScrollButton } from './scroll_button';
import { useAppLeave } from '../../context/app_leave_context';
import { useNavigationAbort } from '../../hooks/use_navigation_abort';
import { ErrorPrompt } from '../common/prompt/error_prompt';
import { PROMPT_LAYOUT_VARIANTS } from '../common/prompt/layout';
import { StartNewConversationButton } from './actions/start_new_conversation_button';
import { CanvasProvider } from './conversation_rounds/round_response/attachments/canvas_context';
import { CanvasFlyout } from './conversation_rounds/round_response/attachments/canvas_flyout';
import { RoundsScreenReaderStatus } from './conversation_rounds/rounds_screen_reader_status';
import { useAgentBuilderServices } from '../../hooks/use_agent_builder_service';
import { useConversationContext } from '../../context/conversation/conversation_context';
import { StaleAttachmentsPanel } from './stale_attachments_panel';
import { useStaleAttachments } from '../../hooks/use_stale_attachments_check';

export const Conversation: React.FC<{}> = () => {
  const { euiTheme } = useEuiTheme();
  const conversationId = useConversationId();
  const hasActiveConversation = useHasActiveConversation();
  const isAnyStreaming = useIsAnyConversationStreaming();
  const { cancelAllStreams } = useStreamingContext();
  const conversationRounds = useConversationRounds();
  const lastRound = conversationRounds.at(-1);
  const { isFetched } = useConversationStatus();
  const { errorType } = useConversationError();
  const shouldStickToBottom = useShouldStickToBottom();
  const onAppLeave = useAppLeave();
  const { attachmentsService } = useAgentBuilderServices();
  const {
    attachments: stagedAttachments = [],
    upsertAttachments,
    initialMessage,
    autoSendInitialMessage,
  } = useConversationContext();
  const isPendingAutoSend = Boolean(initialMessage && autoSendInitialMessage);
  const { staleAttachments, scheduleStaleCheck } = useStaleAttachments(conversationId);
  const [dismissStaleAttachments, setDismissStaleAttachments] = useState(false);
  useSendPredefinedInitialMessage();

  // Page-leave guard fires for any in-flight stream, not just this conversation's.
  // On confirmed leave, cancel every stream so background mutations don't keep running.
  useNavigationAbort({
    onAppLeave,
    isResponseLoading: isAnyStreaming,
    cancelAll: cancelAllStreams,
  });

  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const { showScrollButton, onMessageSent, smoothScrollToBottom, stickToBottom } =
    useConversationScrollActions({
      conversationId: conversationId || '',
      scrollContainer,
    });

  const scrollContainerHeight = scrollContainer?.clientHeight ?? 0;

  const stagedAttachmentIds = useMemo(() => {
    const ids = stagedAttachments.map((attachment) => attachment.id).filter(isString);
    return new Set(ids);
  }, [stagedAttachments]);

  const staleAttachmentInputs = useMemo(() => {
    return staleAttachments.filter((a) => !a.id || !stagedAttachmentIds.has(a.id));
  }, [staleAttachments, stagedAttachmentIds]);

  const handleStageStaleAttachments = useCallback(() => {
    if (staleAttachmentInputs.length > 0) {
      upsertAttachments?.(staleAttachmentInputs);
    }
    setDismissStaleAttachments(true);
  }, [staleAttachmentInputs, upsertAttachments]);

  // Display stale attachments panel when stale attachments response changes or conversationId changes
  useEffect(() => {
    setDismissStaleAttachments(false);
  }, [staleAttachments, conversationId]);

  // Stick to bottom only when user returns to an existing conversation (conversationId is defined and changes)
  useEffect(() => {
    if (isFetched && conversationId && shouldStickToBottom) {
      requestAnimationFrame(() => {
        stickToBottom();
      });
    }
  }, [stickToBottom, isFetched, conversationId, shouldStickToBottom]);

  const containerStyles = css`
    ${fullWidthAndHeightStyles}
  `;

  const scrollMaskHeight = euiTheme.size.l;

  // Necessary to position the scroll button absolute to the container.
  const scrollWrapperStyles = css`
    ${fullWidthAndHeightStyles}
    position: relative;
    min-height: 0;

    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: ${scrollMaskHeight};
      pointer-events: none;
      z-index: 1;
      background: linear-gradient(to top, ${euiTheme.colors.backgroundBasePlain}, transparent);
    }
  `;

  const scrollableStyles = css`
    ${useEuiScrollBar()}
    ${useEuiOverflowScroll('y')}
    scrollbar-gutter: stable both-edges;
    overflow-anchor: none;
  `;

  const inputPaddingStyles = css`
    padding-bottom: ${euiTheme.size.base};
  `;

  if (!hasActiveConversation && !isPendingAutoSend) {
    return <NewConversationPrompt />;
  }
  if (isPendingAutoSend && !hasActiveConversation) {
    return null;
  }

  if (errorType) {
    return (
      <ErrorPrompt
        errorType={errorType}
        variant={PROMPT_LAYOUT_VARIANTS.EMBEDDABLE}
        primaryButton={<StartNewConversationButton />}
      />
    );
  }

  return (
    <CanvasProvider>
      <RoundsScreenReaderStatus lastRound={lastRound} />
      <EuiFlexGroup direction="column" alignItems="center" css={containerStyles} gutterSize="s">
        <EuiFlexItem grow={true} css={scrollWrapperStyles}>
          <EuiFlexGroup
            direction="column"
            alignItems="center"
            ref={setScrollContainer}
            css={scrollableStyles}
          >
            <EuiFlexItem css={[conversationElementWidthStyles, conversationElementPaddingStyles]}>
              <ConversationRounds scrollContainerHeight={scrollContainerHeight} />
            </EuiFlexItem>
          </EuiFlexGroup>
          {showScrollButton && <ScrollButton onClick={smoothScrollToBottom} />}
        </EuiFlexItem>
        <EuiFlexItem
          css={[
            conversationElementWidthStyles,
            conversationElementPaddingStyles,
            inputPaddingStyles,
          ]}
          grow={false}
        >
          {!dismissStaleAttachments && (
            <StaleAttachmentsPanel
              attachmentInputs={staleAttachmentInputs}
              onAddToInput={handleStageStaleAttachments}
              onDismiss={() => setDismissStaleAttachments(true)}
            />
          )}
          <ConversationInput onSubmit={onMessageSent} onEditorFocus={scheduleStaleCheck} />
        </EuiFlexItem>
      </EuiFlexGroup>
      <CanvasFlyout attachmentsService={attachmentsService} />
    </CanvasProvider>
  );
};
