/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiForm } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import { FeedbackTextArea } from './feedback_text_area';
import { EmailSection } from './email';
import { PrivacyAndSessionDisclaimer } from './privacy_and_session_disclaimer';
import { CsatButtons } from './csat_buttons';
import type { FeedbackRegistryEntry } from '../../types';

export interface FeedbackBodyProps {
  selectedCsatOptionId: string;
  questionAnswers: Record<string, string>;
  allowEmailContact: boolean;
  email: string;
  questions: FeedbackRegistryEntry[];
  appTitle: string;
  handleChangeCsatOptionId: (optionId: string) => void;
  handleChangeQuestionAnswer: (questionId: string, answer: string) => void;
  handleChangeAllowEmailContact: (allow: boolean) => void;
  handleChangeEmail: (email: string) => void;
  onEmailValidationChange: (isValid: boolean) => void;
  getCurrentUserEmail: () => Promise<string | undefined>;
  forceShowEmailError?: boolean;
}

export const FeedbackBody = ({
  selectedCsatOptionId,
  questionAnswers,
  allowEmailContact,
  email,
  questions,
  appTitle,
  handleChangeCsatOptionId,
  handleChangeQuestionAnswer,
  handleChangeAllowEmailContact,
  handleChangeEmail,
  onEmailValidationChange,
  getCurrentUserEmail,
  forceShowEmailError = false,
}: FeedbackBodyProps) => {
  return (
    <EuiFlexGroup direction="column" gutterSize="s">
      <EuiFlexItem data-test-subj="feedbackBody">
        <EuiForm fullWidth component="form">
          <CsatButtons
            appTitle={appTitle}
            selectedCsatOptionId={selectedCsatOptionId}
            handleChangeCsatOptionId={handleChangeCsatOptionId}
          />
          {questions.length > 0 &&
            questions.map((question) => (
              <FeedbackTextArea
                key={question.id}
                value={questionAnswers[question.id] || ''}
                handleChangeValue={(value) => handleChangeQuestionAnswer(question.id, value)}
                testId={`feedback-${question.id}-text-area`}
                label={
                  question?.label
                    ? i18n.translate(question.label.i18nId, {
                        defaultMessage: question.label.defaultMessage,
                      })
                    : undefined
                }
                aria-label={
                  question?.ariaLabel
                    ? i18n.translate(question.ariaLabel.i18nId, {
                        defaultMessage: question.ariaLabel.defaultMessage,
                      })
                    : undefined
                }
                placeholder={
                  question?.placeholder
                    ? i18n.translate(question.placeholder.i18nId, {
                        defaultMessage: question.placeholder.defaultMessage,
                      })
                    : undefined
                }
              />
            ))}
          <EmailSection
            allowEmailContact={allowEmailContact}
            email={email}
            handleChangeAllowEmailContact={handleChangeAllowEmailContact}
            handleChangeEmail={handleChangeEmail}
            onEmailValidationChange={onEmailValidationChange}
            getCurrentUserEmail={getCurrentUserEmail}
            forceShowEmailError={forceShowEmailError}
          />
        </EuiForm>
      </EuiFlexItem>
      <EuiFlexItem>
        <PrivacyAndSessionDisclaimer />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
