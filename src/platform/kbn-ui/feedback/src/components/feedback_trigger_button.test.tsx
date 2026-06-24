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
import { FeedbackTriggerButton } from './feedback_trigger_button';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import userEvent from '@testing-library/user-event';

jest.mock('./feedback_container', () => ({
  FeedbackContainer: () => <div data-test-subj="feedbackContainer">Feedback Container</div>,
}));

const createMockProps = ({
  isTelemetryGlobalSettingEnabled,
}: {
  isTelemetryGlobalSettingEnabled: boolean;
}) => ({
  getQuestions: jest.fn().mockResolvedValue([]),
  getAppDetails: jest
    .fn()
    .mockReturnValue({ title: 'Test App', id: 'testApp', url: 'http://testapp.com' }),
  getCurrentUserEmail: jest.fn().mockResolvedValue('capybara@elastic.co'),
  sendFeedback: jest.fn().mockResolvedValue(undefined),
  showToast: jest.fn(),
  checkTelemetryOptIn: jest.fn().mockResolvedValue(isTelemetryGlobalSettingEnabled),
});

describe('FeedbackButton', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render feedback trigger button when opted in', async () => {
    const mockProps = createMockProps({ isTelemetryGlobalSettingEnabled: true });
    renderWithI18n(<FeedbackTriggerButton {...mockProps} />);

    await waitFor(() => {
      const feedbackButton = screen.getByTestId('feedbackTriggerButton');
      expect(feedbackButton).toBeInTheDocument();
      expect(feedbackButton).not.toBeDisabled();
    });
  });

  it('should render disabled button when not opted in', async () => {
    const mockProps = createMockProps({ isTelemetryGlobalSettingEnabled: false });
    renderWithI18n(<FeedbackTriggerButton {...mockProps} />);

    await waitFor(() => {
      const feedbackButton = screen.getByTestId('feedbackTriggerButton');
      expect(feedbackButton).toBeInTheDocument();
      expect(feedbackButton).toBeDisabled();
    });
  });

  it('should open feedback container when clicked', async () => {
    const mockProps = createMockProps({ isTelemetryGlobalSettingEnabled: true });
    renderWithI18n(<FeedbackTriggerButton {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('feedbackTriggerButton')).not.toBeDisabled();
    });

    const feedbackButton = screen.getByTestId('feedbackTriggerButton');
    await userEvent.click(feedbackButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Feedback form' })).toBeInTheDocument();
    });
  });
});
