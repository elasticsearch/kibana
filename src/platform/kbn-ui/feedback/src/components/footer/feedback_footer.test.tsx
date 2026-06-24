/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { screen } from '@testing-library/react';
import { FeedbackFooter } from './feedback_footer';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import userEvent from '@testing-library/user-event';

const mockProps = {
  isSendFeedbackButtonDisabled: false,
  isSubmitting: false,
  submitFeedback: jest.fn(),
};

describe('FeedbackFooter', () => {
  it('should render feedback footer', () => {
    renderWithI18n(<FeedbackFooter {...mockProps} />);

    expect(screen.getByTestId('feedbackFooter')).toBeInTheDocument();

    const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');

    expect(sendButton).toBeEnabled();
  });

  it('should render disabled send button when isSendFeedbackButtonDisabled is true', () => {
    renderWithI18n(<FeedbackFooter {...mockProps} isSendFeedbackButtonDisabled={true} />);

    expect(screen.getByTestId('feedbackFooter')).toBeInTheDocument();

    const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');

    expect(sendButton).toBeDisabled();
  });

  it('should call submitFeedback when send button is clicked', async () => {
    renderWithI18n(<FeedbackFooter {...mockProps} />);

    expect(screen.getByTestId('feedbackFooter')).toBeInTheDocument();

    const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');

    await userEvent.click(sendButton);

    expect(mockProps.submitFeedback).toHaveBeenCalledTimes(1);
  });
});
