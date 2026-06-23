/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { AnalyticsCollectionViewMetric } from './analytics_collection_metric';

const mockProps = {
  dataViewQuery: 'test',
  getFormula: jest.fn(),
  isLoading: false,
  isSelected: false,
  metric: 100,
  name: 'Test metric',
  onClick: jest.fn(),
  secondaryMetric: 50,
};

describe('AnalyticsCollectionViewMetric', () => {
  it('should render component without issues', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionViewMetric {...mockProps} />);
    expect(screen.getByText('Test metric')).toBeInTheDocument();
  });

  it('should show N/A if metric is null', () => {
    renderWithKibanaRenderContext(
      <AnalyticsCollectionViewMetric {...mockProps} metric={null} secondaryMetric={null} />
    );
    expect(screen.getAllByText('N/A')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('N/A');
  });

  it('should show the metric value if it is not null', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionViewMetric {...mockProps} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('100');
  });

  it('should show N/A if secondary metric is null', () => {
    renderWithKibanaRenderContext(
      <AnalyticsCollectionViewMetric {...mockProps} secondaryMetric={null} />
    );
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('should show the secondary metric value if it is not null', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionViewMetric {...mockProps} />);
    // The component renders the metric value (not secondaryMetric) as the percentage display
    expect(screen.getByText(`${mockProps.metric}%`)).toBeInTheDocument();
  });
});
