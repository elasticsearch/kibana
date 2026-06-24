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
import { EmailSection } from './email_section';

const mockGetCurrentUserEmail = jest.fn().mockResolvedValue(undefined);

const mockProps = {
  email: '',
  allowEmailContact: false,
  handleChangeAllowEmailContact: jest.fn(),
  handleChangeEmail: jest.fn(),
  onEmailValidationChange: jest.fn(),
  getCurrentUserEmail: mockGetCurrentUserEmail,
};

describe('EmailSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserEmail.mockResolvedValue(undefined);
  });

  it('should render email consent checkbox', () => {
    renderWithI18n(<EmailSection {...mockProps} />);

    expect(screen.getByTestId('feedbackEmailConsentCheckbox')).toBeInTheDocument();
  });

  it('should not show email input when allowEmailContact is false', () => {
    renderWithI18n(<EmailSection {...mockProps} />);

    expect(screen.queryByTestId('feedbackEmailInput')).not.toBeInTheDocument();
  });

  it('should show email input when allowEmailContact is true', () => {
    renderWithI18n(<EmailSection {...mockProps} allowEmailContact={true} />);

    expect(screen.getByTestId('feedbackEmailInput')).toBeInTheDocument();
  });

  it('should call onEmailValidationChange when validation changes', () => {
    renderWithI18n(
      <EmailSection {...mockProps} allowEmailContact={true} email="capybara@elastic.co" />
    );

    expect(mockProps.onEmailValidationChange).toHaveBeenCalled();
  });
});
