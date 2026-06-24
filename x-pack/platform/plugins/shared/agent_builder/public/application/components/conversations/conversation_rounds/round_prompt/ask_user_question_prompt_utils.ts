/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UseEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type {
  AskUserQuestionAnswer,
  AskUserQuestionPromptResponse,
  AskUserQuestionItem,
} from '@kbn/agent-builder-common/agents';
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
