/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useState } from 'react';
import { EuiFlexGroup, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { FeedbackFormData, FeedbackRegistryEntry } from '../types';
import { FeedbackHeader } from './header';
import { FeedbackBody } from './body/feedback_body';
import { FeedbackFooter } from './footer/feedback_footer';
import { FeedbackContainerSkeleton } from './feedback_container_skeleton';
import { useQuestionsForApp } from '../hooks/use_questions_for_app';

export interface FeedbackContainerProps {
  getQuestions: (appId: string) => Promise<FeedbackRegistryEntry[]>;
  getAppDetails: () => { title: string; id: string; url: string };
  getCurrentUserEmail: () => Promise<string | undefined>;
  sendFeedback: (data: FeedbackFormData) => Promise<void>;
  showToast: (title: string, type: 'success' | 'error') => void;
  hideFeedbackContainer: () => void;
}

export const FeedbackContainer = ({
  getQuestions,
  getAppDetails,
  getCurrentUserEmail,
  sendFeedback,
  showToast,
  hideFeedbackContainer,
}: FeedbackContainerProps) => {
  const { euiTheme } = useEuiTheme();
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [selectedCsatOptionId, setSelectedCsatOptionId] = useState('');
  const [allowEmailContact, setAllowEmailContact] = useState(true);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmailValid, setIsEmailValid] = useState(true);
  const [forceShowEmailError, setForceShowEmailError] = useState(false);

  const { title: appTitle, id: appId, url: appUrl } = getAppDetails();

  const { questions, isLoading, error } = useQuestionsForApp({ getQuestions, appId });

  const containerCss = css`
    padding: ${euiTheme.size.l};
    width: 576px;
  `;

  useEffect(() => {
    if (error) {
      hideFeedbackContainer();
      showToast(
        i18n.translate('kbnUI.feedback.loadQuestionsFailureToast.title', {
          defaultMessage: 'Failed to load feedback form. Please try again later.',
        }),
        'error'
      );
    }
  }, [error, hideFeedbackContainer, showToast]);

  if (isLoading || error) {
    return <FeedbackContainerSkeleton />;
  }

  const isFormFilled =
    selectedCsatOptionId ||
    Object.values(questionAnswers).some((answer) => answer.trim().length > 0);

  const isSendFeedbackButtonDisabled = !isFormFilled;

  const handleChangeCsatOptionId = (optionId: string) => {
    setSelectedCsatOptionId(optionId);
  };

  const handleChangeQuestionAnswer = (questionId: string, answer: string) => {
    setQuestionAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  const handleChangeAllowEmailContact = (allow: boolean) => {
    setAllowEmailContact(allow);
  };

  const handleChangeEmail = (emailValue: string) => {
    setEmail(emailValue);
  };

  const handleEmailValidationChange = (isValid: boolean) => {
    setIsEmailValid(isValid);
  };

  const submitFeedback = async () => {
    // Check if email is required but invalid
    if (allowEmailContact && !isEmailValid) {
      setForceShowEmailError(true);
      return;
    }

    try {
      setIsSubmitting(true);

      const eventData = {
        app_id: appId,
        user_email: allowEmailContact && email ? email : undefined,
        allow_email_contact: allowEmailContact,
        csat_score: Number(selectedCsatOptionId) || undefined,
        questions: questions.map((question) => ({
          id: question.id,
          question: question.question,
          answer: questionAnswers[question.id]?.trim() || 'N/A',
        })),
        url: appUrl,
      };

      await sendFeedback(eventData);

      setIsSubmitting(false);

      showToast(
        i18n.translate('kbnUI.feedback.submissionSuccessToast.title', {
          defaultMessage: 'Thanks for your feedback!',
        }),
        'success'
      );

      hideFeedbackContainer();
    } catch (_error) {
      showToast(
        i18n.translate('kbnUI.feedback.submissionFailureToast.title', {
          defaultMessage: 'Failed to submit feedback. Please try again later.',
        }),
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="m"
      data-test-subj="feedbackContainer"
      css={containerCss}
      data-app-id={appId}
    >
      <FeedbackHeader />
      <FeedbackBody
        questionAnswers={questionAnswers}
        selectedCsatOptionId={selectedCsatOptionId}
        allowEmailContact={allowEmailContact}
        questions={questions}
        appTitle={appTitle}
        email={email}
        handleChangeCsatOptionId={handleChangeCsatOptionId}
        handleChangeQuestionAnswer={handleChangeQuestionAnswer}
        handleChangeAllowEmailContact={handleChangeAllowEmailContact}
        handleChangeEmail={handleChangeEmail}
        onEmailValidationChange={handleEmailValidationChange}
        getCurrentUserEmail={getCurrentUserEmail}
        forceShowEmailError={forceShowEmailError}
      />
      <FeedbackFooter
        isSendFeedbackButtonDisabled={isSendFeedbackButtonDisabled}
        submitFeedback={submitFeedback}
        isSubmitting={isSubmitting}
      />
    </EuiFlexGroup>
  );
};
