/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCheckableCard,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormErrorText,
  EuiIcon,
  EuiText,
  EuiTitle,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  labels,
  containerStyles,
  optionCardStyles,
  customRowStyles,
  draftToAnswer,
  isDraftAnswerable,
  isCustomTextMissing,
  useAskUserQuestionTelemetry,
} from './ask_user_question_prompt_utils';
import type { AnswerDraft, AskUserQuestionPromptProps } from './ask_user_question_prompt_utils';

export type { AskUserQuestionPromptProps } from './ask_user_question_prompt_utils';

export const AskUserQuestionPrompt = ({
  promptId,
  questions,
  onSubmit,
  isLoading = false,
  isDisabled = false,
}: AskUserQuestionPromptProps) => {
  const { euiTheme } = useEuiTheme();
  const totalQuestions = questions.length;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState<AnswerDraft[]>(() => questions.map(() => ({})));
  const [showCustomError, setShowCustomError] = useState(false);
  const baseId = useGeneratedHtmlId({ prefix: 'askUserQuestionPrompt' });

  const { reportPromptShown, reportQuestionAnswered } = useAskUserQuestionTelemetry({
    promptId,
    questions,
  });

  useEffect(() => {
    reportPromptShown();
  }, [reportPromptShown]);

  const currentQuestion = questions[currentIndex];
  const currentDraft = drafts[currentIndex];
  const isFinalQuestion = currentIndex === totalQuestions - 1;
  const canConfirm = !currentDraft.skipped && isDraftAnswerable(currentDraft);
  const questionGroupName = `${baseId}-q${currentIndex}`;

  const updateDraft = useCallback(
    (next: AnswerDraft) => {
      setShowCustomError(false);
      setDrafts((prev) => {
        const copy = prev.slice();
        copy[currentIndex] = next;
        return copy;
      });
    },
    [currentIndex]
  );

  const handleSubmit = useCallback(
    (overrideLast?: AnswerDraft) => {
      const finalDrafts = overrideLast
        ? drafts.map((draft, i) => (i === currentIndex ? overrideLast : draft))
        : drafts;
      onSubmit({ answers: finalDrafts.map(draftToAnswer) });
    },
    [drafts, currentIndex, onSubmit]
  );

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    if (isCustomTextMissing(currentDraft)) {
      setShowCustomError(true);
      return;
    }
    reportQuestionAnswered(currentIndex, currentDraft, 'answered');
    if (isFinalQuestion) {
      handleSubmit();
      return;
    }
    setShowCustomError(false);
    setCurrentIndex((idx) => idx + 1);
  }, [
    canConfirm,
    currentDraft,
    currentIndex,
    handleSubmit,
    isFinalQuestion,
    reportQuestionAnswered,
  ]);

  const handleSkip = useCallback(() => {
    const skippedDraft: AnswerDraft = { skipped: true };
    reportQuestionAnswered(currentIndex, skippedDraft, 'skipped');
    if (isFinalQuestion) {
      handleSubmit(skippedDraft);
      return;
    }
    updateDraft(skippedDraft);
    setCurrentIndex((idx) => idx + 1);
  }, [currentIndex, handleSubmit, isFinalQuestion, reportQuestionAnswered, updateDraft]);

  const handleBack = useCallback(() => {
    setShowCustomError(false);
    setCurrentIndex((idx) => Math.max(0, idx - 1));
  }, []);

  const handleSkipAll = useCallback(() => {
    reportQuestionAnswered(currentIndex, {}, 'skipped_all');
    onSubmit({ answers: questions.map(() => ({ skipped: true })) });
  }, [currentIndex, onSubmit, questions, reportQuestionAnswered]);

  const handleOptionPick = useCallback(
    (optionIndex: number, checked: boolean) => {
      if (currentQuestion.multi_select) {
        const prevChoice = currentDraft.choice ?? [];
        const nextChoice = checked
          ? Array.from(new Set([...prevChoice, optionIndex])).sort((a, b) => a - b)
          : prevChoice.filter((c) => c !== optionIndex);
        updateDraft({
          ...currentDraft,
          skipped: false,
          choice: nextChoice.length > 0 ? nextChoice : undefined,
        });
        return;
      }
      updateDraft({
        skipped: false,
        choice: [optionIndex],
        custom: currentDraft.custom,
        customSelected: false,
      });
    },
    [currentQuestion.multi_select, currentDraft, updateDraft]
  );

  const handleCustomChange = useCallback(
    (value: string) => {
      const custom = value.length > 0 ? value : undefined;
      if (currentQuestion.multi_select) {
        updateDraft({ ...currentDraft, skipped: false, custom, customSelected: true });
        return;
      }
      updateDraft({ skipped: false, custom, customSelected: true, choice: undefined });
    },
    [currentQuestion.multi_select, currentDraft, updateDraft]
  );

  const handleCustomToggle = useCallback(
    (selected: boolean) => {
      if (currentQuestion.multi_select) {
        updateDraft({ ...currentDraft, skipped: false, customSelected: selected });
        return;
      }
      updateDraft({
        skipped: false,
        customSelected: selected,
        custom: currentDraft.custom,
        choice: undefined,
      });
    },
    [currentQuestion.multi_select, currentDraft, updateDraft]
  );

  const isCustomActive = !!currentDraft.customSelected;

  const isInteractionDisabled = isDisabled || isLoading;

  return (
    <EuiFlexGroup
      direction="column"
      responsive={false}
      gutterSize="none"
      css={containerStyles}
      data-test-subj="agentBuilderAskUserQuestionPrompt"
    >
      {/* Question text (left) + progress label (right) */}
      <EuiFlexItem grow={false}>
        <EuiFlexGroup
          justifyContent="spaceBetween"
          alignItems="center"
          gutterSize="s"
          responsive={false}
        >
          <EuiFlexItem>
            <EuiTitle size="xs">
              <h3>{currentQuestion.question}</h3>
            </EuiTitle>
            {currentQuestion.multi_select && (
              <EuiText component="p" size="s" color="subdued" css={{ marginTop: '2px' }}>
                <FormattedMessage
                  id="xpack.agentBuilder.askUserQuestionPrompt.multiSelectSubtitle"
                  defaultMessage="Select one or more"
                />
              </EuiText>
            )}
          </EuiFlexItem>
          {totalQuestions > 1 && (
            <EuiFlexItem grow={false} css={{ paddingTop: '0.35rem' }}>
              <EuiText component="span" size="xs" color="subdued">
                <FormattedMessage
                  id="xpack.agentBuilder.askUserQuestionPrompt.progressLabel"
                  defaultMessage="{current} of {total}"
                  values={{ current: currentIndex + 1, total: totalQuestions }}
                />
              </EuiText>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>

      {/* Options */}
      <EuiFlexGroup
        direction="column"
        gutterSize="xs"
        responsive={false}
        css={css`
          margin-top: ${euiTheme.size.s};
        `}
      >
        {currentQuestion.options.map((option, optionIndex) => {
          const inputId = `${baseId}-q${currentIndex}-opt${optionIndex}`;
          const checked = (currentDraft.choice ?? []).includes(optionIndex);
          return (
            <EuiFlexItem key={`${currentIndex}-${optionIndex}`} grow={false}>
              <EuiCheckableCard
                id={inputId}
                label={option.label}
                checkableType={currentQuestion.multi_select ? 'checkbox' : 'radio'}
                name={questionGroupName}
                checked={checked}
                disabled={isInteractionDisabled}
                css={optionCardStyles}
                onChange={(e) =>
                  handleOptionPick(
                    optionIndex,
                    currentQuestion.multi_select ? e.target.checked : true
                  )
                }
              >
                {option.description && (
                  <EuiText size="xs" color="subdued">
                    {option.description}
                  </EuiText>
                )}
              </EuiCheckableCard>
            </EuiFlexItem>
          );
        })}

        {/* Custom / "Be more specific" row */}
        <EuiFlexItem grow={false}>
          <EuiCheckableCard
            id={`${baseId}-q${currentIndex}-custom`}
            label=""
            css={customRowStyles}
            checkableType={currentQuestion.multi_select ? 'checkbox' : 'radio'}
            name={questionGroupName}
            checked={isCustomActive}
            disabled={isInteractionDisabled}
            onChange={(e) =>
              handleCustomToggle(currentQuestion.multi_select ? e.target.checked : true)
            }
            data-test-subj="agentBuilderAskUserQuestionPromptCustomRow"
          >
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiIcon type="pencil" size="m" color="subdued" aria-hidden={true} />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFieldText
                  value={currentDraft.custom ?? ''}
                  placeholder={labels.customPlaceholder}
                  onChange={(e) => handleCustomChange(e.target.value)}
                  disabled={isInteractionDisabled}
                  isInvalid={showCustomError}
                  compressed
                  css={css`
                    box-shadow: none;
                    outline: none !important;
                    outline-style: none !important;
                    ':hover' {
                      box-shadow: none;
                      outline: none !important;
                      outline-style: none !important;
                    }
                  `}
                  fullWidth
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiCheckableCard>
        </EuiFlexItem>

        {/* Validation error */}
        {showCustomError && (
          <EuiFlexItem grow={false}>
            <EuiFormErrorText>{labels.customError}</EuiFormErrorText>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {/* Action bar */}
      <EuiFlexGroup
        direction="row"
        justifyContent="spaceBetween"
        alignItems="center"
        responsive={false}
        css={css`
          margin-top: ${euiTheme.size.base};
        `}
      >
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            {totalQuestions > 1 && currentIndex === 0 && (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  onClick={handleSkipAll}
                  disabled={isInteractionDisabled}
                  size="s"
                  color="text"
                >
                  {labels.skipAllButton}
                </EuiButtonEmpty>
              </EuiFlexItem>
            )}
            {currentIndex > 0 && (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  onClick={handleBack}
                  disabled={isInteractionDisabled}
                  size="s"
                  color="text"
                  iconType="sortLeft"
                >
                  {labels.backButton}
                </EuiButtonEmpty>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexGroup gutterSize="s" justifyContent="flexEnd" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButton onClick={handleSkip} disabled={isInteractionDisabled} size="s" color="text">
              {labels.skipButton}
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              onClick={handleConfirm}
              isLoading={isLoading && isFinalQuestion}
              disabled={isInteractionDisabled || !canConfirm}
              fill
              size="s"
              color="primary"
            >
              {isFinalQuestion ? labels.confirmButton : labels.continueButton}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexGroup>
    </EuiFlexGroup>
  );
};
