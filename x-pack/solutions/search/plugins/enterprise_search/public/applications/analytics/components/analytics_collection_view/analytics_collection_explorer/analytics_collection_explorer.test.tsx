/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockActions, setMockValues } from '../../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { AnalyticsCollectionExplorer } from './analytics_collection_explorer';

describe('AnalyticsCollectionExplorer', () => {
  const mockValues = {
    analyticsCollection: { event_data_stream: 'test_data_stream', name: 'Mock Collection' },
    items: [],
    refreshInterval: { pause: false, value: 1000 },
    selectedTable: null,
    timeRange: { from: 'now-15m', to: 'now' },
  };
  const mockActions = { reset: jest.fn(), setSelectedTable: jest.fn() };

  beforeAll(() => {
    jest.clearAllMocks();

    setMockValues(mockValues);
    setMockActions(mockActions);
  });

  afterAll(() => {
    jest.resetAllMocks();
  });

  it('renders the AnalyticsCollectionExplorerTable', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionExplorer />);
    expect(screen.getByRole('tab', { name: 'Search terms' })).toBeInTheDocument();
  });

  it('renders the EnterpriseSearchAnalyticsPageTemplate', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionExplorer />);
    expect(screen.getByRole('heading', { name: 'Explorer' })).toBeInTheDocument();
  });

  it('passes the expected props to EnterpriseSearchAnalyticsPageTemplate', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionExplorer />);
    expect(
      screen.getByTestId('enterpriseSearchAnalyticsCollectionToolbarManageButton')
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Explorer' })).toBeInTheDocument();
  });
});
