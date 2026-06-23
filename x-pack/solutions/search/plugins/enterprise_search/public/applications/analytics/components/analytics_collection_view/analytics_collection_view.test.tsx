/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues, setMockActions } from '../../../__mocks__/kea_logic';
import { mockUseParams } from '../../../__mocks__/react_router';

import React from 'react';

import { screen, waitFor } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { AnalyticsCollection } from '../../../../../common/types/analytics';

import { AnalyticsCollectionView } from './analytics_collection_view';

const mockValues = {
  analyticsCollection: {
    events_datastream: 'analytics-events-example',
    name: 'Analytics-Collection-1',
  } as AnalyticsCollection,
};

const mockActions = {
  fetchAnalyticsCollection: jest.fn(),
  fetchAnalyticsCollectionDataViewId: jest.fn(),
  setTimeRange: jest.fn(),
};

describe('AnalyticsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseParams.mockReturnValue({ name: '1' });
  });

  it('renders when analytics collection is empty on initial query', async () => {
    setMockValues({
      ...mockValues,
      analyticsCollection: null,
    });
    setMockActions(mockActions);

    renderWithKibanaRenderContext(<AnalyticsCollectionView />);

    await waitFor(() => {
      expect(mockActions.fetchAnalyticsCollection).toHaveBeenCalled();
    });

    expect(screen.queryByText('Embed onto site')).not.toBeInTheDocument();
    expect(screen.getByText('You may have deleted this analytics collection')).toBeInTheDocument();
  });

  it('render deleted state for deleted analytics collection', async () => {
    setMockValues({ ...mockValues, analyticsCollection: null });
    setMockActions(mockActions);

    renderWithKibanaRenderContext(<AnalyticsCollectionView />);

    expect(screen.getByText('You may have deleted this analytics collection')).toBeInTheDocument();
  });
});
