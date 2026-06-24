/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import userEvent from '@testing-library/user-event';
import { FeedbackContainer } from './feedback_container';

const mockProps = {
  getQuestions: jest.fn().mockResolvedValue([
    {
      id: 'experience',
      type: 'experience',
      question: 'How would you rate your experience?',
      order: 1,
    },
    { id: 'improvement', type: 'text', question: 'What can we improve?', order: 2 },
  ]),
  getAppDetails: jest
    .fn()
    .mockReturnValue({ title: 'Test App', id: 'test-app', url: 'http://testapp.com' }),
  getCurrentUserEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedback: jest.fn().mockResolvedValue(undefined),
  showToast: jest.fn(),
  hideFeedbackContainer: jest.fn(),
};

describe('FeedbackContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render container', async () => {
    renderWithI18n(<FeedbackContainer {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('feedbackContainer')).toBeInTheDocument();
    });
  });

  it('should render header, body, and footer', async () => {
    renderWithI18n(<FeedbackContainer {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('feedbackHeader')).toBeInTheDocument();
      expect(screen.getByTestId('feedbackBody')).toBeInTheDocument();
      expect(screen.getByTestId('feedbackFooter')).toBeInTheDocument();
    });
  });

  it('should disable send button when no data is entered', async () => {
    renderWithI18n(<FeedbackContainer {...mockProps} />);

    await waitFor(() => {
      const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');
      expect(sendButton).toBeDisabled();
    });
  });

  it('should enable send button when CSAT score is selected', async () => {
    renderWithI18n(<FeedbackContainer {...mockProps} />);

    const emailConsentCheckbox = await screen.findByTestId('feedbackEmailConsentCheckbox');
    await userEvent.click(emailConsentCheckbox);

    const csatButtons = screen.getAllByRole('button', { name: /^\d$/ });
    await userEvent.click(csatButtons[2]);

    await waitFor(() => {
      const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');
      expect(sendButton).not.toBeDisabled();
    });
  });

  it('should submit feedback with correct data', async () => {
    renderWithI18n(<FeedbackContainer {...mockProps} />);

    const emailConsentCheckbox = await screen.findByTestId('feedbackEmailConsentCheckbox');
    await userEvent.click(emailConsentCheckbox);

    const csatButtons = screen.getAllByRole('button', { name: /^\d$/ });
    await userEvent.click(csatButtons[3]);

    const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');

    await waitFor(() => {
      expect(sendButton).not.toBeDisabled();
    });

    await userEvent.click(sendButton);

    await waitFor(() => {
      expect(mockProps.sendFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          app_id: 'test-app',
        })
      );
    });
  });

  it('should show success toast and hide container on successful submit', async () => {
    renderWithI18n(<FeedbackContainer {...mockProps} />);

    const emailConsentCheckbox = await screen.findByTestId('feedbackEmailConsentCheckbox');
    await userEvent.click(emailConsentCheckbox);

    const csatButtons = screen.getAllByRole('button', { name: /^\d$/ });
    await userEvent.click(csatButtons[3]);

    await waitFor(() => {
      const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');
      expect(sendButton).not.toBeDisabled();
    });

    const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');
    await userEvent.click(sendButton);

    await waitFor(() => {
      expect(mockProps.showToast).toHaveBeenCalledWith(
        expect.stringContaining('Thanks for your feedback'),
        'success'
      );
      expect(mockProps.hideFeedbackContainer).toHaveBeenCalledTimes(1);
    });
  });

  it('should block submission and show email error when email is invalid and email consent is checked', async () => {
    renderWithI18n(<FeedbackContainer {...mockProps} />);

    const emailConsentCheckbox = await screen.findByTestId('feedbackEmailConsentCheckbox');
    expect(emailConsentCheckbox).toBeChecked();

    const csatButtons = screen.getAllByRole('button', { name: /^\d$/ });
    await userEvent.click(csatButtons[3]);

    const emailInput = await screen.findByTestId('feedbackEmailInput');

    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'invalid-email');

    const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');
    expect(sendButton).not.toBeDisabled();

    await userEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    });
    expect(mockProps.sendFeedback).not.toHaveBeenCalled();
  });

  it('should enable send button when email is valid and email consent is checked', async () => {
    renderWithI18n(<FeedbackContainer {...mockProps} />);

    const emailConsentCheckbox = await screen.findByTestId('feedbackEmailConsentCheckbox');
    expect(emailConsentCheckbox).toBeChecked();

    const csatButtons = screen.getAllByRole('button', { name: /^\d$/ });
    await userEvent.click(csatButtons[3]);

    const emailInput = await screen.findByTestId('feedbackEmailInput');
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'capybara@elastic.co');

    await waitFor(() => {
      const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');
      expect(sendButton).not.toBeDisabled();
    });
  });

  it('should block submission and show email error when email is empty and email consent is checked', async () => {
    mockProps.getCurrentUserEmail.mockResolvedValue(undefined);
    renderWithI18n(<FeedbackContainer {...mockProps} />);

    const emailConsentCheckbox = await screen.findByTestId('feedbackEmailConsentCheckbox');
    expect(emailConsentCheckbox).toBeChecked();

    const csatButtons = screen.getAllByRole('button', { name: /^\d$/ });
    await userEvent.click(csatButtons[3]);

    await screen.findByTestId('feedbackEmailInput');

    const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');
    expect(sendButton).not.toBeDisabled();

    await userEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    });
    expect(mockProps.sendFeedback).not.toHaveBeenCalled();
  });

  it('should enable send button when email consent is unchecked', async () => {
    renderWithI18n(<FeedbackContainer {...mockProps} />);

    const emailConsentCheckbox = await screen.findByTestId('feedbackEmailConsentCheckbox');
    expect(emailConsentCheckbox).toBeChecked();

    const csatButtons = screen.getAllByRole('button', { name: /^\d$/ });
    await userEvent.click(csatButtons[3]);

    await userEvent.click(emailConsentCheckbox);

    expect(emailConsentCheckbox).not.toBeChecked();

    await waitFor(() => {
      const sendButton = screen.getByTestId('feedbackFooterSendFeedbackButton');
      expect(sendButton).not.toBeDisabled();
    });
  });
});
