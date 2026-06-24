/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithTestingProviders } from '../../../../common/mock';
import { SavedObjectLink } from './saved_object_link';

describe('SavedObjectLink', () => {
  it('renders an active link when href is provided', () => {
    renderWithTestingProviders(
      <SavedObjectLink title="My title" href="/app/x" data-test-subj="so-link" />
    );
    const link = screen.getByTestId('so-link');
    expect(link).toHaveAttribute('href', '/app/x');
    expect(link).toHaveTextContent('My title');
    expect(link).not.toBeDisabled();
  });

  it('honors the target prop', () => {
    renderWithTestingProviders(
      <SavedObjectLink title="t" href="/x" target="_blank" data-test-subj="so-link" />
    );
    expect(screen.getByTestId('so-link')).toHaveAttribute('target', '_blank');
  });

  it('renders a disabled link when no href is provided', () => {
    renderWithTestingProviders(<SavedObjectLink title="My title" data-test-subj="so-link" />);
    const link = screen.getByTestId('so-link');
    expect(link).toBeDisabled();
    expect(link).toHaveTextContent('My title');
  });
});
