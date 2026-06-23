/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { EuiFieldText, EuiThemeProvider } from '@elastic/eui';
import { render, screen } from '@testing-library/react';
import { EditFailedDataLifecycleFlyoutBody } from './edit_failed_data_lifecycle_flyout_body';

describe('EditFailedDataLifecycleFlyoutBody', () => {
  const renderWithTheme = (node: React.ReactElement) =>
    render(node, {
      wrapper: EuiThemeProvider,
    });

  it('disables the failure store checkbox when inheriting lifecycle', () => {
    renderWithTheme(
      <EditFailedDataLifecycleFlyoutBody
        inherit={{
          value: true,
          onChange: () => {},
          label: 'Inherit lifecycle from index template',
        }}
        failureStore={{ value: true, onChange: () => {} }}
      />
    );

    expect(screen.getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox')).toBeDisabled();
  });

  it('does not render retention content when omitted', () => {
    renderWithTheme(
      <EditFailedDataLifecycleFlyoutBody failureStore={{ value: true, onChange: () => {} }} />
    );

    expect(screen.queryByTestId('failedRetentionInput')).not.toBeInTheDocument();
  });

  it('hides retention content when failure store is disabled', () => {
    renderWithTheme(
      <EditFailedDataLifecycleFlyoutBody
        failureStore={{ value: false, onChange: () => {} }}
        retentionContent={<EuiFieldText data-test-subj="failedRetentionInput" defaultValue="60d" />}
      />
    );

    expect(screen.queryByTestId('failedRetentionInput')).not.toBeInTheDocument();
  });

  it('renders retention content when provided', () => {
    renderWithTheme(
      <EditFailedDataLifecycleFlyoutBody
        failureStore={{ value: true, onChange: () => {} }}
        retentionContent={<EuiFieldText data-test-subj="failedRetentionInput" defaultValue="60d" />}
      />
    );

    expect(screen.getByTestId('failedRetentionInput')).toBeInTheDocument();
  });

  it('renders the failure store value the consumer provides while inheriting', () => {
    // The consumer is the source of truth while inheriting and feeds the resolved value.
    const { rerender } = renderWithTheme(
      <EditFailedDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {}, label: 'Inherit lifecycle' }}
        failureStore={{ value: false, onChange: () => {} }}
      />
    );

    expect(
      screen.getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox')
    ).not.toBeChecked();

    // Consumer pushes the resolved inherited value (enabled).
    rerender(
      <EditFailedDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {}, label: 'Inherit lifecycle' }}
        failureStore={{ value: true, onChange: () => {} }}
      />
    );

    expect(screen.getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox')).toBeChecked();
  });

  it('renders the retention content the consumer provides', () => {
    const { rerender } = renderWithTheme(
      <EditFailedDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {}, label: 'Inherit lifecycle' }}
        failureStore={{ value: true, onChange: () => {} }}
        retentionContent={<div data-test-subj="failedRetentionContent">inherited</div>}
      />
    );

    expect(screen.getByTestId('failedRetentionContent')).toHaveTextContent('inherited');

    rerender(
      <EditFailedDataLifecycleFlyoutBody
        inherit={{ value: true, onChange: () => {}, label: 'Inherit lifecycle' }}
        failureStore={{ value: true, onChange: () => {} }}
        retentionContent={<div data-test-subj="failedRetentionContent">updated</div>}
      />
    );

    expect(screen.getByTestId('failedRetentionContent')).toHaveTextContent('updated');
  });
});
