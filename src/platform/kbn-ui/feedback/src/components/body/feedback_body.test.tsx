/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { screen, act, fireEvent } from '@testing-library/react';
import { FeedbackBody } from './feedback_body';
import { renderWithI18n } from '@kbn/test-jest-helpers';

const mockGetCurrentUserEmail = jest.fn().mockResolvedValue(undefined);

const mockProps = {
  handleChangeCsatOptionId: jest.fn(),
  handleChangeQuestionAnswer: jest.fn(),
  handleChangeAllowEmailContact: jest.fn(),
  handleChangeEmail: jest.fn(),
  onEmailValidationChange: jest.fn(),
  getCurrentUserEmail: mockGetCurrentUserEmail,
  email: '',
  questions: [
    {
      id: 'experience',
      type: 'experience',
      question: 'How would you rate your experience?',
      order: 1,
    },
    { id: 'improvement', type: 'text', question: 'What can we improve?', order: 2 },
  ],
  allowEmailContact: false,
  selectedCsatOptionId: '',
  questionAnswers: {},
  appTitle: 'Test App',
};

describe('FeedbackBody', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserEmail.mockResolvedValue(undefined);
  });

  it('should render', async () => {
    await act(async () => {
      renderWithI18n(<FeedbackBody {...mockProps} />);
    });

    const body = screen.getByTestId('feedbackBody');

    expect(body).toBeInTheDocument();
  });

  it('should render feedback text inside textarea', async () => {
    await act(async () => {
      renderWithI18n(
        <FeedbackBody {...mockProps} questionAnswers={{ experience: 'Test feedback' }} />
      );
    });

    const body = screen.getByTestId('feedbackBody');

    expect(body).toBeInTheDocument();

    const feedbackTextarea = screen.getByTestId(`feedback-experience-text-area`);

    expect(feedbackTextarea).toBeInTheDocument();
    expect(feedbackTextarea).toHaveValue('Test feedback');
  });

  it('should call handleChangeQuestionAnswer when feedback text is changed', async () => {
    await act(async () => {
      renderWithI18n(<FeedbackBody {...mockProps} />);
    });

    const feedbackTextarea = screen.getByTestId(`feedback-experience-text-area`);

    expect(feedbackTextarea).toBeInTheDocument();

    fireEvent.change(feedbackTextarea, {
      target: { value: 'Test feedback' },
    });

    expect(mockProps.handleChangeQuestionAnswer).toHaveBeenCalledWith(
      'experience',
      'Test feedback'
    );
    expect(mockProps.handleChangeQuestionAnswer).toHaveBeenCalledTimes(1);
  });

  it('should render CSAT buttons', async () => {
    await act(async () => {
      renderWithI18n(<FeedbackBody {...mockProps} />);
    });

    expect(screen.getByTestId('feedbackCsatButtonGroup')).toBeInTheDocument();
  });

  it('should render email consent checkbox', async () => {
    await act(async () => {
      renderWithI18n(<FeedbackBody {...mockProps} />);
    });

    expect(screen.getByTestId('feedbackEmailConsentCheckbox')).toBeInTheDocument();
  });

  it('should call onEmailValidationChange when provided', async () => {
    await act(async () => {
      renderWithI18n(
        <FeedbackBody {...mockProps} allowEmailContact={true} email="capybara@elastic.co" />
      );
    });

    expect(mockProps.onEmailValidationChange).toHaveBeenCalled();
  });
});
