/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useRef } from 'react';
import type { UseEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type {
  AskUserQuestionAnswer,
  AskUserQuestionPromptResponse,
  AskUserQuestionItem,
} from '@kbn/agent-builder-common/agents';
import {
  AGENT_BUILDER_EVENT_TYPES,
  type ReportHitlPromptShownParams,
  type ReportHitlQuestionAnsweredParams,
} from '@kbn/agent-builder-common/telemetry';
import { useConversationId } from '../../../../context/conversation/use_conversation_id';
import { useKibana } from '../../../../hooks/use_kibana';
import { useAgentId } from '../../../../hooks/use_conversation';
export { promptContainerStyles as containerStyles } from './prompt_container.styles';

/** In-progress (mutable) answer for a single question, before it is mapped to the wire shape. */
export interface AnswerDraft {
  choice?: number[];
  custom?: string;
  /** True when the user has explicitly selected the custom ("Be more specific") option. */
  customSelected?: boolean;
  skipped?: boolean;
}

export interface AskUserQuestionPromptProps {
  promptId: string;
  questions: AskUserQuestionItem[];
  onSubmit: (response: AskUserQuestionPromptResponse) => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

export const labels = {
  backButton: i18n.translate('xpack.agentBuilder.askUserQuestionPrompt.backButton', {
    defaultMessage: 'Back',
  }),
  skipButton: i18n.translate('xpack.agentBuilder.askUserQuestionPrompt.skipButton', {
    defaultMessage: 'Skip',
  }),
  skipAllButton: i18n.translate('xpack.agentBuilder.askUserQuestionPrompt.skipAllButton', {
    defaultMessage: 'Skip all',
  }),
  confirmButton: i18n.translate('xpack.agentBuilder.askUserQuestionPrompt.confirmButton', {
    defaultMessage: 'Submit',
  }),
  continueButton: i18n.translate('xpack.agentBuilder.askUserQuestionPrompt.continueButton', {
    defaultMessage: 'Continue',
  }),
  customPlaceholder: i18n.translate('xpack.agentBuilder.askUserQuestionPrompt.customPlaceholder', {
    defaultMessage: 'Be more specific...',
  }),
  customError: i18n.translate('xpack.agentBuilder.askUserQuestionPrompt.customError', {
    defaultMessage: 'Enter a response or choose a different option.',
  }),
};

export const optionCardStyles = ({ euiTheme }: UseEuiTheme) => css`
  border-radius: ${euiTheme.border.radius.medium};
  .euiSplitPanel__inner.euiPanel--subdued,
  .euiSplitPanel__inner.euiPanel--primary {
    display: flex;
    align-items: center;
    height: 100%;
  }
  .euiCheckableCard__children {
    margin-block-start: 2px;
  }
`;

export const customRowStyles = ({ euiTheme }: UseEuiTheme) => css`
  margin-top: 0;
  border-radius: ${euiTheme.border.radius.medium};
  /* Need to tweak EUI nested element */
  .euiSplitPanel__inner.euiPanel--transparent {
    padding: ${euiTheme.size.s} 0 0 ${euiTheme.size.base};
  }
  .euiCheckableCard__children {
    margin-block-start: 0;
  }
  label {
    display: none;
  }
`;

export const draftToAnswer = (draft: AnswerDraft): AskUserQuestionAnswer => {
  if (draft.skipped) {
    return { skipped: true };
  }
  const hasChoice = (draft.choice?.length ?? 0) > 0;
  const customTrim = draft.custom?.trim() ?? '';
  const hasCustom = !!draft.customSelected && customTrim.length > 0;
  if (hasChoice && hasCustom) {
    return { choice: [...draft.choice!], custom: customTrim };
  }
  if (hasChoice) {
    return { choice: [...draft.choice!] };
  }
  return { custom: customTrim };
};

export const isDraftAnswerable = (draft: AnswerDraft): boolean => {
  if (draft.skipped) {
    return true;
  }
  const hasChoice = (draft.choice?.length ?? 0) > 0;
  return hasChoice || !!draft.customSelected;
};

/** Custom option is selected but its text field is empty — must block submit. */
export const isCustomTextMissing = (draft: AnswerDraft): boolean =>
  !!draft.customSelected && (draft.custom?.trim().length ?? 0) === 0;

export const useAskUserQuestionTelemetry = ({
  promptId,
  questions,
}: {
  promptId: string;
  questions: AskUserQuestionItem[];
}) => {
  const {
    services: { analytics },
  } = useKibana();
  const agentId = useAgentId();
  const conversationId = useConversationId();
  const hasReportedShownRef = useRef(false);

  const reportPromptShown = useCallback(() => {
    if (hasReportedShownRef.current) return;
    hasReportedShownRef.current = true;
    analytics.reportEvent<ReportHitlPromptShownParams>(AGENT_BUILDER_EVENT_TYPES.HitlPromptShown, {
      prompt_id: promptId,
      total_questions: questions.length,
      conversation_id: conversationId,
      agent_id: agentId,
    });
  }, [analytics, agentId, conversationId, promptId, questions.length]);

  const reportQuestionAnswered = useCallback(
    (index: number, draft: AnswerDraft, outcome: ReportHitlQuestionAnsweredParams['outcome']) => {
      analytics.reportEvent<ReportHitlQuestionAnsweredParams>(
        AGENT_BUILDER_EVENT_TYPES.HitlQuestionAnswered,
        {
          prompt_id: promptId,
          conversation_id: conversationId,
          agent_id: agentId,
          question_index: index,
          is_multi_select: questions[index].multi_select,
          outcome,
          used_custom_text: !!(draft.customSelected && draft.custom?.trim()),
          selected_option_count: draft.choice?.length ?? 0,
        }
      );
    },
    [analytics, agentId, conversationId, promptId, questions]
  );

  return { reportPromptShown, reportQuestionAnswered };
};
