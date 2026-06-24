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
import { FeedbackTextArea } from './feedback_text_area';

const mockProps = {
  value: '',
  handleChangeValue: jest.fn(),
};

describe('FeedbackTextArea', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render feedback textarea', () => {
    renderWithI18n(<FeedbackTextArea {...mockProps} testId="test-textarea" />);

    expect(screen.getByTestId('test-textarea')).toBeInTheDocument();
  });

  it('should display the provided value', () => {
    renderWithI18n(<FeedbackTextArea {...mockProps} testId="test-textarea" value="test value" />);

    expect(screen.getByTestId('test-textarea')).toHaveValue('test value');
  });

  it('should call handleChangeValue when text is changed', async () => {
    renderWithI18n(<FeedbackTextArea {...mockProps} testId="test-textarea" />);

    const textarea = screen.getByTestId('test-textarea');

    await userEvent.type(textarea, 'new text');

    expect(mockProps.handleChangeValue).toHaveBeenCalled();
  });

  it('should display label when provided', () => {
    renderWithI18n(<FeedbackTextArea {...mockProps} testId="test-textarea" label="Test Label" />);

    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });
});
