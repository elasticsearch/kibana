/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import { ToggleableRow } from '../toggleable_row';
import { renderWithProviders } from './test_helpers';

describe('ToggleableRow', () => {
  const baseProps = {
    title: 'Override schedule',
    onToggle: jest.fn(),
    dataTestSubj: 'osquery-toggleable-row',
  };

  it('renders children when enabled is true', () => {
    renderWithProviders(
      <ToggleableRow {...baseProps} enabled={true}>
        <div data-test-subj="toggleable-children">child content</div>
      </ToggleableRow>
    );

    expect(screen.getByTestId('toggleable-children')).toBeInTheDocument();
  });

  it('renders children even when enabled is false', () => {
    renderWithProviders(
      <ToggleableRow {...baseProps} enabled={false}>
        <div data-test-subj="toggleable-children">child content</div>
      </ToggleableRow>
    );

    expect(screen.getByTestId('toggleable-children')).toBeInTheDocument();
  });

  it('does not render the children block when there are no children', () => {
    renderWithProviders(<ToggleableRow {...baseProps} enabled={false} />);

    expect(screen.queryByTestId('toggleable-children')).not.toBeInTheDocument();
  });
});
