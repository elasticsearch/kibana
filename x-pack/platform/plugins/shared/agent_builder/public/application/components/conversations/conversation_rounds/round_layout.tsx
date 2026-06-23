/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText } from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { ConversationRound } from '@kbn/agent-builder-common';
import type {
  VersionedAttachment,
  AttachmentVersionRef,
} from '@kbn/agent-builder-common/attachments';
import { ATTACHMENT_REF_ACTOR } from '@kbn/agent-builder-common/attachments';
import { ConversationRoundStatus } from '@kbn/agent-builder-common';
import { findTodosStep } from '@kbn/agent-builder-common/chat/conversation';
import { AgentPromptType, type PromptResponse } from '@kbn/agent-builder-common/agents';
import { RoundInput } from './round_input';
import { RoundEvents } from './round_events/round_events';
import { RoundResponse } from './round_response/round_response';
import { useConversationStream } from '../../../hooks/use_conversation_stream';
import { RoundError } from './round_error/round_error';
import { AuthorizationPrompt, ConfirmationPrompt, AskUserQuestionPrompt } from './round_prompt';
import { RoundAttachmentReferences } from './round_attachment_references';
import { TodosStepDisplay } from './todos_step_display';

interface RoundLayoutProps {
  isCurrentRound: boolean;
  scrollContainerHeight: number;
  rawRound: ConversationRound;
  conversationAttachments?: VersionedAttachment[];
  conversationId?: string;
  allRounds: ConversationRound[];
  roundIndex: number;
}

const labels = {
  container: i18n.translate('xpack.agentBuilder.round.container', {
    defaultMessage: 'Conversation round',
  }),
  askUserQuestionPreamble: i18n.translate('xpack.agentBuilder.round.askUserQuestionPreamble', {
    defaultMessage: 'I need to clarify a few things first.',
  }),
};

/**
 * Computes cumulative attachment refs from all rounds up to and including the given index.
 * Returns the highest version seen for each attachment.
 */
const computeCumulativeRefs = (
  rounds: ConversationRound[],
  upToIndex: number
): AttachmentVersionRef[] | undefined => {
  const highestVersionByAttachment = new Map<string, AttachmentVersionRef>();

  for (let i = 0; i <= upToIndex; i++) {
    const roundRefs = rounds[i]?.input.attachment_refs;
    if (roundRefs) {
      for (const ref of roundRefs) {
        const existing = highestVersionByAttachment.get(ref.attachment_id);
        if (!existing || ref.version > existing.version) {
          highestVersionByAttachment.set(ref.attachment_id, ref);
        }
      }
    }
  }

  const values = Array.from(highestVersionByAttachment.values());
  return values.length > 0 ? values : undefined;
};

const getAttachmentRefsKey = (attachmentRefs: AttachmentVersionRef[] | undefined): string =>
  attachmentRefs
    ?.map(
      ({ attachment_id: attachmentId, version }) => `${encodeURIComponent(attachmentId)}:${version}`
    )
    .join('|') ?? '';

const parseAttachmentRefsKey = (attachmentRefsKey: string): AttachmentVersionRef[] | undefined => {
  if (!attachmentRefsKey) {
    return undefined;
  }

  return attachmentRefsKey.split('|').map((refKey) => {
    const [encodedAttachmentId, version] = refKey.split(':');
    return {
      attachment_id: decodeURIComponent(encodedAttachmentId),
      version: Number(version),
    };
  });
};

export const RoundLayout: React.FC<RoundLayoutProps> = ({
  isCurrentRound,
  scrollContainerHeight,
  rawRound,
  conversationAttachments,
  conversationId,
  allRounds,
  roundIndex,
}) => {
  const [roundContainerMinHeight, setRoundContainerMinHeight] = useState(0);
  const [hasBeenLoading, setHasBeenLoading] = useState(false);
  const [promptResponses, setPromptResponses] = useState<Record<string, PromptResponse>>({});
  const { steps, response, input, status, pending_prompts: pendingPrompts } = rawRound;
  const todosStep = useMemo(() => findTodosStep(steps), [steps]);

  const {
    isResponseLoading,
    isStreaming,
    error,
    retry: retrySendMessage,
    resumeRound,
    isResuming,
  } = useConversationStream();
  const isHitlDisabled = isStreaming && !isResuming;

  const isLoadingCurrentRound = isResponseLoading && isCurrentRound;
  const isErrorCurrentRound = Boolean(error) && isCurrentRound;
  // Don't show prompts if we're already resuming (user already clicked confirm/cancel)
  // This prevents prompts from reappearing when server data is refetched
  const isAwaitingPrompt =
    isCurrentRound &&
    status === ConversationRoundStatus.awaitingPrompt &&
    pendingPrompts &&
    pendingPrompts.length > 0 &&
    !isResuming;

  const cumulativeAttachmentRefsKey = useMemo(() => {
    if (!response?.message) {
      return '';
    }
    return getAttachmentRefsKey(computeCumulativeRefs(allRounds, roundIndex));
  }, [allRounds, roundIndex, response?.message]);

  const attachmentRefs = useMemo(
    () => parseAttachmentRefsKey(cumulativeAttachmentRefsKey),
    [cumulativeAttachmentRefsKey]
  );

  const handlePromptResponse = useCallback(
    (promptId: string, promptResponse: PromptResponse) => {
      setPromptResponses((prev) => {
        const updated = { ...prev, [promptId]: promptResponse };
        const allAnswered = (pendingPrompts ?? []).every((p) => updated[p.id] !== undefined);
        if (allAnswered) {
          resumeRound({ prompts: updated });
        }
        return updated;
      });
    },
    [pendingPrompts, resumeRound]
  );

  // Track if this round has ever been in a loading state during this session
  useEffect(() => {
    if (isCurrentRound && isResponseLoading) {
      setHasBeenLoading(true);
    }
  }, [isCurrentRound, isResponseLoading]);

  useEffect(() => {
    // Keep min-height if:
    // - Round is loading, errored, or awaiting prompt
    // - Round has finished streaming but is still the current round (hasBeenLoading)
    // Remove min-height when a new round starts (isCurrentRound becomes false)
    const shouldHaveMinHeight =
      isErrorCurrentRound ||
      isAwaitingPrompt ||
      (isCurrentRound && (isResponseLoading || hasBeenLoading));

    setRoundContainerMinHeight(shouldHaveMinHeight ? scrollContainerHeight : 0);
  }, [
    isCurrentRound,
    isResponseLoading,
    hasBeenLoading,
    scrollContainerHeight,
    isErrorCurrentRound,
    isAwaitingPrompt,
  ]);

  const roundContainerStyles = css`
    ${roundContainerMinHeight > 0 ? `min-height: ${roundContainerMinHeight}px;` : 'flex-grow: 0;'};
  `;
  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="s"
      aria-label={labels.container}
      css={roundContainerStyles}
    >
      {/* Input Message */}
      <EuiFlexItem grow={false}>
        <RoundInput
          input={input.message}
          attachmentRefs={input.attachment_refs}
          conversationAttachments={conversationAttachments}
          fallbackAttachments={input.attachments}
        />
      </EuiFlexItem>

      {/* Steps container — always rendered above the error block so steps
          stay anchored where the user last saw them. */}
      {steps.length > 0 && (
        <EuiFlexItem grow={false}>
          <RoundEvents
            steps={steps}
            conversationAttachments={conversationAttachments}
            attachmentRefs={attachmentRefs}
            conversationId={conversationId}
          />
        </EuiFlexItem>
      )}

      {/* Error */}
      {isErrorCurrentRound && (
        <EuiFlexItem grow={false}>
          <RoundError error={error} onRetry={retrySendMessage} />
        </EuiFlexItem>
      )}

      {/* Todos */}
      {todosStep && (
        <EuiFlexItem grow={false}>
          <TodosStepDisplay step={todosStep} />
        </EuiFlexItem>
      )}

      {/* Pending Prompts */}
      {isAwaitingPrompt &&
        (pendingPrompts ?? []).map((prompt) => {
          switch (prompt.type) {
            case AgentPromptType.confirmation: {
              const stored = promptResponses[prompt.id];
              return (
                <EuiFlexItem grow={false} key={prompt.id}>
                  <ConfirmationPrompt
                    prompt={prompt}
                    onConfirm={() => handlePromptResponse(prompt.id, { allow: true })}
                    onCancel={() => handlePromptResponse(prompt.id, { allow: false })}
                    isLoading={isResuming}
                    isDisabled={isHitlDisabled}
                    isAnswered={stored !== undefined}
                    answeredValue={stored && 'allow' in stored ? stored.allow : undefined}
                  />
                </EuiFlexItem>
              );
            }
            case AgentPromptType.authorization: {
              const stored = promptResponses[prompt.id];
              return (
                <EuiFlexItem grow={false} key={prompt.id}>
                  <AuthorizationPrompt
                    prompt={prompt}
                    onAuthorize={() => handlePromptResponse(prompt.id, { authorized: true })}
                    onCancel={() => handlePromptResponse(prompt.id, { authorized: false })}
                    isLoading={isResuming}
                    isDisabled={isHitlDisabled}
                    isAnswered={stored !== undefined}
                    answeredValue={stored && 'authorized' in stored ? stored.authorized : undefined}
                  />
                </EuiFlexItem>
              );
            }
            case AgentPromptType.ask_user_question:
              return (
                <React.Fragment key={prompt.id}>
                  <EuiFlexItem grow={false}>
                    <EuiText size="m">{labels.askUserQuestionPreamble}</EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <AskUserQuestionPrompt
                      promptId={prompt.id}
                      questions={prompt.questions}
                      onSubmit={(r) => handlePromptResponse(prompt.id, r)}
                      isLoading={isResuming}
                      isDisabled={isHitlDisabled}
                    />
                  </EuiFlexItem>
                </React.Fragment>
              );
          }
        })}

      {/* Response */}
      {!isAwaitingPrompt && (
        <EuiFlexItem grow={false}>
          <EuiFlexItem>
            <RoundResponse
              hasError={isErrorCurrentRound}
              response={response}
              steps={steps}
              isLoading={isLoadingCurrentRound}
              isLastRound={isCurrentRound}
              conversationAttachments={conversationAttachments}
              attachmentRefs={attachmentRefs}
              conversationId={conversationId}
              rawRound={rawRound}
            />
          </EuiFlexItem>
          <EuiSpacer />
          <RoundAttachmentReferences
            attachmentRefs={input.attachment_refs}
            conversationAttachments={conversationAttachments}
            actorFilter={[ATTACHMENT_REF_ACTOR.agent, ATTACHMENT_REF_ACTOR.system]}
          />
        </EuiFlexItem>
      )}

      {/* Add spacing after the final round so that text is not cut off by the scroll mask */}
      {isCurrentRound && <EuiSpacer size="l" />}
    </EuiFlexGroup>
  );
};
