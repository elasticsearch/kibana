/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiProvider } from '@elastic/eui';
import { I18nProvider } from '@kbn/i18n-react';
import { render, screen } from '@testing-library/react';
import { ConfirmationPrompt } from './confirmation_prompt';

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <I18nProvider>
      <EuiProvider>{ui}</EuiProvider>
    </I18nProvider>
  );

const basePrompt = { id: 'test-id' };

describe('ConfirmationPrompt', () => {
  it('renders markdown in title — backtick content becomes a code element', () => {
    renderWithProviders(
      <ConfirmationPrompt
        prompt={{ ...basePrompt, title: 'Allow `platform.core.list_indices` to run?' }}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByRole('code')).toHaveTextContent('platform.core.list_indices');
  });
});
