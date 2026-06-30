/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { StatItemHeader } from './stat_item_header';

describe('StatItemHeader', () => {
  const mockOnToggle = jest.fn();

  beforeEach(() => {});

  it('renders expand button', () => {
    const { getByTestId } = render(
      <StatItemHeader onToggle={mockOnToggle} isToggleExpanded={true} />
    );
    expect(getByTestId('query-toggle-stat')).toHaveAttribute('aria-label', 'Open');
  });

  it('renders collapse button', () => {
    const { getByTestId } = render(
      <StatItemHeader onToggle={mockOnToggle} isToggleExpanded={false} />
    );
    expect(getByTestId('query-toggle-stat')).toHaveAttribute('aria-label', 'Closed');
  });
});
