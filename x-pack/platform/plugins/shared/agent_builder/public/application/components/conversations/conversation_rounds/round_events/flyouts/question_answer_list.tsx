/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment } from 'react';
import { EuiText, EuiTextColor, EuiSpacer, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { AskUserQuestionItem, AskUserQuestionAnswer } from '@kbn/agent-builder-common/agents';

const customLabel = i18n.translate('xpack.agentBuilder.roundEvents.askUserQuestionStep.custom', {
  defaultMessage: 'Custom',
});

const skippedLabel = i18n.translate('xpack.agentBuilder.roundEvents.askUserQuestionStep.skipped', {
  defaultMessage: 'Skipped',
});

interface QuestionAnswerListProps {
  questions: AskUserQuestionItem[];
  answers: AskUserQuestionAnswer[];
}

export const QuestionAnswerList: React.FC<QuestionAnswerListProps> = ({ questions, answers }) => {
  const { euiTheme } = useEuiTheme();
  return (
    <>
      {questions.map((q, i) => {
        const a = answers[i] ?? {};
        const isSkipped = !!a.skipped;
        const choiceText = (a.choice ?? [])
          .map((idx) => q.options[idx]?.label ?? '')
          .filter(Boolean)
          .join(', ');
        const hasChoice = choiceText.length > 0;
        const hasCustom = !!a.custom;
        const isLast = i === questions.length - 1;

        const primaryText = hasChoice ? choiceText : a.custom ?? '';

        return (
          <Fragment key={i}>
            <EuiText size="s">
              <p>
                <strong>{q.question}</strong>
              </p>
            </EuiText>
            <EuiSpacer size="s" />
            {isSkipped ? (
              <EuiText size="s" color="subdued">
                <p>
                  <em>{skippedLabel}</em>
                </p>
              </EuiText>
            ) : (
              <EuiText size="s">
                <p>
                  {primaryText}
                  {hasCustom && (
                    <EuiTextColor color={euiTheme.colors.textDisabled}>
                      {' • '}
                      {customLabel}
                    </EuiTextColor>
                  )}
                </p>
              </EuiText>
            )}
            {!isLast && <EuiSpacer size={isSkipped ? 'm' : 'l'} />}
          </Fragment>
        );
      })}
    </>
  );
};
