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
import { EmailConsentCheck } from './email_consent_check';

const mockProps = {
  allowEmailContact: false,
  handleChangeAllowEmailContact: jest.fn(),
};

describe('EmailConsentCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render email consent checkbox', () => {
    renderWithI18n(<EmailConsentCheck {...mockProps} />);

    expect(screen.getByTestId('feedbackEmailConsentCheckbox')).toBeInTheDocument();
  });

  it('should reflect email consent checkbox checked state', () => {
    renderWithI18n(<EmailConsentCheck {...mockProps} allowEmailContact={true} />);

    expect(screen.getByTestId('feedbackEmailConsentCheckbox')).toBeChecked();
  });

  it('should call handleChangeAllowEmailContact when email consent checkbox is clicked', async () => {
    renderWithI18n(<EmailConsentCheck {...mockProps} />);

    const checkbox = screen.getByTestId('feedbackEmailConsentCheckbox');

    await userEvent.click(checkbox);

    expect(mockProps.handleChangeAllowEmailContact).toHaveBeenCalledWith(true);
    expect(mockProps.handleChangeAllowEmailContact).toHaveBeenCalledTimes(1);
  });
});
