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
import { EmailInput } from './email_input';

const mockGetCurrentUserEmail = jest.fn();

const mockProps = {
  email: '',
  handleChangeEmail: jest.fn(),
  onValidationChange: jest.fn(),
  getCurrentUserEmail: mockGetCurrentUserEmail,
};

describe('EmailInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserEmail.mockResolvedValue(undefined);
  });

  it('should render email input', () => {
    renderWithI18n(<EmailInput {...mockProps} />);

    expect(screen.getByTestId('feedbackEmailInput')).toBeInTheDocument();
  });

  it('should display the provided email value', () => {
    renderWithI18n(<EmailInput {...mockProps} email="capybara@elastic.co" />);

    expect(screen.getByTestId('feedbackEmailInput')).toHaveValue('capybara@elastic.co');
  });

  it('should call handleChangeEmail when input changes', async () => {
    renderWithI18n(<EmailInput {...mockProps} />);

    const input = screen.getByTestId('feedbackEmailInput');

    await userEvent.type(input, 'capybara@elastic.co');

    expect(mockProps.handleChangeEmail).toHaveBeenCalled();
  });

  it('should fetch user email using getCurrentUserEmail', async () => {
    mockGetCurrentUserEmail.mockResolvedValue('capybara@elastic.co');

    renderWithI18n(<EmailInput {...mockProps} />);

    await waitFor(() => {
      expect(mockGetCurrentUserEmail).toHaveBeenCalledTimes(1);
      expect(mockProps.handleChangeEmail).toHaveBeenCalledWith('capybara@elastic.co');
    });
  });

  it('should not fetch email if email is already provided', async () => {
    mockGetCurrentUserEmail.mockResolvedValue('not.capybara@elastic.co');

    renderWithI18n(<EmailInput {...mockProps} email="capybara@elastic.co" />);

    await waitFor(() => {
      expect(mockGetCurrentUserEmail).not.toHaveBeenCalled();
    });
  });

  it('should call onValidationChange with false for empty email', () => {
    renderWithI18n(<EmailInput {...mockProps} email="" />);

    expect(mockProps.onValidationChange).toHaveBeenCalledWith(false);
  });

  it('should call onValidationChange with true for valid email', () => {
    renderWithI18n(<EmailInput {...mockProps} email="capybara@elastic.co" />);

    expect(mockProps.onValidationChange).toHaveBeenCalledWith(true);
  });

  it('should call onValidationChange with false for invalid email', () => {
    renderWithI18n(<EmailInput {...mockProps} email="invalid-email" />);

    expect(mockProps.onValidationChange).toHaveBeenCalledWith(false);
  });
});
