/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { FrozenDefaultRepositoryRequiredCallout } from './frozen_default_repository_required_callout';

describe('FrozenDefaultRepositoryRequiredCallout', () => {
  it('renders the callout title and body', () => {
    renderWithI18n(<FrozenDefaultRepositoryRequiredCallout calloutTestSubj="callout" />);

    expect(screen.getByTestId('callout')).toBeInTheDocument();
    expect(screen.getByText('Default snapshot repository required')).toBeInTheDocument();
  });

  it('does not render the action buttons when no handlers are provided', () => {
    renderWithI18n(
      <FrozenDefaultRepositoryRequiredCallout
        createButtonTestSubj="create"
        refreshButtonTestSubj="refresh"
      />
    );

    expect(screen.queryByTestId('create')).not.toBeInTheDocument();
    expect(screen.queryByTestId('refresh')).not.toBeInTheDocument();
  });

  it('calls onCreateDefaultRepository when the create button is clicked', () => {
    const onCreateDefaultRepository = jest.fn();

    renderWithI18n(
      <FrozenDefaultRepositoryRequiredCallout
        onCreateDefaultRepository={onCreateDefaultRepository}
        createButtonTestSubj="create"
      />
    );

    fireEvent.click(screen.getByTestId('create'));
    expect(onCreateDefaultRepository).toHaveBeenCalled();
  });

  it('disables the create button when onCreateDefaultRepository is not provided', () => {
    renderWithI18n(
      <FrozenDefaultRepositoryRequiredCallout onRefresh={() => {}} createButtonTestSubj="create" />
    );

    expect(screen.getByTestId('create')).toBeDisabled();
  });

  it('calls onRefresh when the refresh button is clicked', () => {
    const onRefresh = jest.fn();

    renderWithI18n(
      <FrozenDefaultRepositoryRequiredCallout
        onRefresh={onRefresh}
        refreshButtonTestSubj="refresh"
      />
    );

    fireEvent.click(screen.getByTestId('refresh'));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('disables refresh while refreshing', () => {
    const onRefresh = jest.fn();

    renderWithI18n(
      <FrozenDefaultRepositoryRequiredCallout
        onRefresh={onRefresh}
        isRefreshing={true}
        refreshButtonTestSubj="refresh"
      />
    );

    const refreshButton = screen.getByTestId('refresh');
    expect(refreshButton).toBeDisabled();

    fireEvent.click(refreshButton);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
