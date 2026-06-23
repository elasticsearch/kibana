/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import moment from 'moment';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { FilterBy } from '../../../utils/get_formula_by_filter';

import { AnalyticsCollectionChart } from './analytics_collection_chart';

jest.mock('@elastic/charts', () => ({
  ...jest.requireActual('@elastic/charts'),
  AreaSeries: () => <div data-test-subj="areaSeries" />,
  Axis: () => null,
  Chart: ({ children }: { children: React.ReactNode }) => (
    <div data-test-subj="chart">{children}</div>
  ),
  Settings: () => null,
  Tooltip: () => null,
}));

describe('AnalyticsCollectionChart', () => {
  const mockedData = Object.values(FilterBy).reduce(
    (result, id) => ({
      ...result,
      [id]: [
        [100, 200],
        [200, 300],
      ],
    }),
    {}
  );
  const mockedTimeRange = {
    from: moment().subtract(7, 'days').toISOString(),
    to: moment().toISOString(),
  };

  const defaultProps = {
    data: {},
    isLoading: false,
    selectedChart: FilterBy.Searches,
    setSelectedChart: jest.fn(),
    timeRange: mockedTimeRange,
  };

  beforeEach(() => {
    setMockValues({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render chart and metrics for each chart', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionChart {...defaultProps} />);
    expect(screen.getByTestId('chart')).toBeInTheDocument();
    expect(screen.getAllByTestId('areaSeries')).toHaveLength(4);
  });

  it('should render a loading indicator if loading and have not data', () => {
    renderWithKibanaRenderContext(
      <AnalyticsCollectionChart {...defaultProps} data={{}} isLoading />
    );
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should not render a loading indicator if loading but have data', () => {
    const { rerender } = renderWithKibanaRenderContext(
      <AnalyticsCollectionChart {...defaultProps} isLoading />
    );
    rerender(<AnalyticsCollectionChart {...defaultProps} data={mockedData} isLoading />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });
});
