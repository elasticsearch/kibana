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
import { CsatButtons } from './csat_buttons';

const mockProps = {
  selectedCsatOptionId: '',
  appTitle: 'Test App',
  handleChangeCsatOptionId: jest.fn(),
};

describe('CsatButtons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render csat button group', () => {
    renderWithI18n(<CsatButtons {...mockProps} />);

    expect(screen.getByTestId('feedbackCsatButtonGroup')).toBeInTheDocument();
  });

  it('should render 5 csat rating buttons', () => {
    renderWithI18n(<CsatButtons {...mockProps} />);

    const buttons = screen.getAllByRole('button');

    expect(buttons).toHaveLength(5);
  });

  it('should display app title in the label', () => {
    renderWithI18n(<CsatButtons {...mockProps} appTitle="Discover" />);

    const title = screen.getByText(/How satisfied are you with Discover/i);

    expect(title).toBeInTheDocument();
  });

  it('should call handleChangeCsatOptionId when a csat button is clicked', async () => {
    renderWithI18n(<CsatButtons {...mockProps} />);

    const buttons = screen.getAllByRole('button');

    await userEvent.click(buttons[2]);

    expect(mockProps.handleChangeCsatOptionId).toHaveBeenCalledTimes(1);
  });

  it('should reflect the selected csat option', () => {
    renderWithI18n(<CsatButtons {...mockProps} selectedCsatOptionId="4" />);

    const buttons = screen.getAllByRole('button');

    expect(buttons[3]).toHaveAttribute('aria-pressed', 'true');
  });
});
