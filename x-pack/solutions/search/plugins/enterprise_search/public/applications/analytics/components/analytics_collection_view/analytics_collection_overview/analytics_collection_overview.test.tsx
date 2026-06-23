/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  setMockValues,
  setMockActions,
  mockTelemetryActions,
} from '../../../../__mocks__/kea_logic';

import React from 'react';

import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { AnalyticsCollection } from '../../../../../../common/types/analytics';
import { FilterBy } from '../../../utils/get_formula_by_filter';

import { AnalyticsCollectionChartWithLens } from './analytics_collection_chart';
import { AnalyticsCollectionOverview } from './analytics_collection_overview';

jest.mock('./analytics_collection_chart', () => ({
  AnalyticsCollectionChartWithLens: jest.fn(() => (
    <div data-test-subj="analyticsCollectionChart" />
  )),
}));

jest.mock('../../../utils/find_or_create_data_view', () => ({
  findOrCreateDataView: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./analytics_collection_overview_table', () => ({
  AnalyticsCollectionOverviewTable: () => null,
}));

const MockedChart = jest.mocked(AnalyticsCollectionChartWithLens);

const mockValues = {
  analyticsCollection: {
    events_datastream: 'analytics-events-example',
    name: 'Analytics-Collection-1',
  } as AnalyticsCollection,
  hasEvents: false,
  isLoading: false,
  refreshInterval: { pause: false, value: 1000 },
  searchSessionId: 'session-id',
  timeRange: {
    from: 'now-90d',
    to: 'now',
  },
};

const mockActions = {
  analyticsEventsExist: jest.fn(),
  fetchAnalyticsCollection: jest.fn(),
  fetchAnalyticsCollectionDataViewId: jest.fn(),
  setTimeRange: jest.fn(),
};

describe('AnalyticsOverView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with Data', async () => {
    setMockValues(mockValues);
    setMockActions(mockActions);

    renderWithKibanaRenderContext(
      <AnalyticsCollectionOverview analyticsCollection={mockValues.analyticsCollection} />
    );
    expect(screen.getByTestId('analyticsCollectionChart')).toBeInTheDocument();
  });

  it('sends correct telemetry page name on render', async () => {
    setMockValues(mockValues);
    setMockActions(mockActions);

    renderWithKibanaRenderContext(
      <AnalyticsCollectionOverview analyticsCollection={mockValues.analyticsCollection} />
    );

    await waitFor(() => {
      expect(mockTelemetryActions.sendTelemetry).toHaveBeenCalledWith({
        action: 'viewed',
        metric: 'View Analytics Collection - Overview',
        product: 'enterprise_search',
      });
    });
  });

  it('render toolbar in pageHeader rightSideItems ', async () => {
    setMockValues({ ...mockValues, dataViewId: null });
    setMockActions(mockActions);

    renderWithKibanaRenderContext(
      <AnalyticsCollectionOverview analyticsCollection={mockValues.analyticsCollection} />
    );

    expect(
      screen.getByTestId('enterpriseSearchAnalyticsCollectionToolbarManageButton')
    ).toBeInTheDocument();
  });

  it('render AnalyticsCollectionChartWithLens with collection', () => {
    setMockValues(mockValues);
    setMockActions(mockActions);

    renderWithKibanaRenderContext(
      <AnalyticsCollectionOverview analyticsCollection={mockValues.analyticsCollection} />
    );
    expect(MockedChart.mock.calls[0][0]).toEqual({
      collection: mockValues.analyticsCollection,
      id: 'analytics-collection-chart-Analytics-Collection-1',
      searchSessionId: 'session-id',
      selectedChart: FilterBy.Searches,
      setSelectedChart: expect.any(Function),
      setTimeRange: mockActions.setTimeRange,
      timeRange: {
        from: 'now-90d',
        to: 'now',
      },
    });
  });

  it('displays all filter options', () => {
    setMockValues(mockValues);
    setMockActions(mockActions);

    renderWithKibanaRenderContext(
      <AnalyticsCollectionOverview analyticsCollection={mockValues.analyticsCollection} />
    );
    expect(screen.getByText('Searches')).toBeInTheDocument();
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.getByText('Click')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  it('updates the selected chart when a filter option is clicked', () => {
    setMockValues(mockValues);
    setMockActions(mockActions);

    renderWithKibanaRenderContext(
      <AnalyticsCollectionOverview analyticsCollection={mockValues.analyticsCollection} />
    );
    fireEvent.click(screen.getAllByText('No results')[0]);
    expect(MockedChart.mock.calls.at(-1)?.[0].selectedChart).toEqual(FilterBy.NoResults);
  });

  it('renders no events AnalyticsCollectionNoEventsCallout with collection', () => {
    setMockValues(mockValues);
    setMockActions(mockActions);

    renderWithKibanaRenderContext(
      <AnalyticsCollectionOverview analyticsCollection={mockValues.analyticsCollection} />
    );

    expect(screen.getByText('Install our tracker')).toBeInTheDocument();
  });
});
