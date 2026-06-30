/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { AlertEpisodesSeverityFilter } from './severity_filter';

describe('AlertEpisodesSeverityFilter', () => {
  const defaultProps = {
    selectedSeverities: null,
    onSeveritiesChange: jest.fn(),
    'data-test-subj': 'test-severity-filter',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the filter button with correct label', () => {
    render(<AlertEpisodesSeverityFilter {...defaultProps} />);
    expect(screen.getByText('Severity')).toBeInTheDocument();
  });

  it('shows hasActiveFilters when severities are selected', () => {
    render(<AlertEpisodesSeverityFilter {...defaultProps} selectedSeverities={['high']} />);
    const button = screen.getByTestId('test-severity-filter-button');
    expect(button).toHaveClass('euiFilterButton-hasActiveFilters');
  });
});
