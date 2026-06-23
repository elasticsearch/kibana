/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues, setMockActions } from '../../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { AnalyticsCollection } from '../../../../../../common/types/analytics';

import { AnalyticsCollectionNoEventsCallout } from './analytics_collection_no_events_callout';

const mockValues = {
  analyticsCollection: {
    events_datastream: 'analytics-events-example',
    name: 'Analytics-Collection-1',
  } as AnalyticsCollection,
  hasEvents: true,
};

const mockActions = {
  fetchAnalyticsCollection: jest.fn(),
  fetchAnalyticsCollectionDataViewId: jest.fn(),
  analyticsEventsExist: jest.fn(),
  setTimeRange: jest.fn(),
};

describe('AnalyticsCollectionNoEventsCallout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders no events Callout when the collection has no events', () => {
    setMockValues({ ...mockValues, hasEvents: false });
    setMockActions(mockActions);

    renderWithKibanaRenderContext(
      <AnalyticsCollectionNoEventsCallout analyticsCollection={mockValues.analyticsCollection} />
    );

    expect(screen.getByText('Install our tracker')).toBeInTheDocument();
  });

  it('does not render events Callout when the collection has events', () => {
    setMockValues(mockValues);
    setMockActions(mockActions);

    renderWithKibanaRenderContext(
      <AnalyticsCollectionNoEventsCallout analyticsCollection={mockValues.analyticsCollection} />
    );

    expect(screen.queryByText('Install our tracker')).not.toBeInTheDocument();
  });
});
