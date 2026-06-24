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
import { renderWithI18n } from '@kbn/test-jest-helpers';
import userEvent from '@testing-library/user-event';
import { SendFeedbackButton } from './send_feedback_button';

const mockProps = {
  isSendFeedbackButtonDisabled: false,
  isSubmitting: false,
  submitFeedback: jest.fn(),
};

describe('SendFeedbackButton', () => {
  it('should render send feedback button', () => {
    renderWithI18n(<SendFeedbackButton {...mockProps} />);

    expect(screen.getByTestId('feedbackFooterSendFeedbackButton')).toBeInTheDocument();
  });

  it('should call submitFeedback when send feedback button is clicked', async () => {
    renderWithI18n(<SendFeedbackButton {...mockProps} />);

    const sendFeedbackButton = screen.getByTestId('feedbackFooterSendFeedbackButton');

    await userEvent.click(sendFeedbackButton);

    expect(mockProps.submitFeedback).toHaveBeenCalledTimes(1);
  });

  it('should show loading state when isSubmitting is true', () => {
    renderWithI18n(<SendFeedbackButton {...mockProps} isSubmitting={true} />);

    const sendFeedbackButton = screen.getByTestId('feedbackFooterSendFeedbackButton');

    expect(sendFeedbackButton).toBeDisabled();
  });
});
