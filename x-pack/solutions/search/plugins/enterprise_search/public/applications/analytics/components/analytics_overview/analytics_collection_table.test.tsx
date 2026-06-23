/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { AnalyticsCollection } from '../../../../../common/types/analytics';

import { AnalyticsCollectionTable } from './analytics_collection_table';

jest.mock('../../utils/find_or_create_data_view', () => ({
  findOrCreateDataView: jest.fn().mockResolvedValue(undefined),
}));

describe('AnalyticsCollectionTable', () => {
  const analyticsCollections: AnalyticsCollection[] = [
    {
      events_datastream: 'analytics-events-example',
      name: 'example',
    },
    {
      events_datastream: 'analytics-events-example2',
      name: 'example2',
    },
  ];
  const props = {
    collections: analyticsCollections,
    isSearching: false,
    onSearch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders cards', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionTable {...props} />);

    expect(screen.getByText('example')).toBeInTheDocument();
    expect(screen.getByText('example2')).toBeInTheDocument();
  });

  it('renders filters', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionTable {...props} />);

    expect(
      screen.getByTestId('enterpriseSearchAnalyticsCollectionTableButtonGroup')
    ).toBeInTheDocument();
    expect(screen.getByTestId('Searches')).toBeInTheDocument();
    expect(screen.getByTestId('NoResults')).toBeInTheDocument();
    expect(screen.getByTestId('Clicks')).toBeInTheDocument();
    expect(screen.getByTestId('Sessions')).toBeInTheDocument();

    // Searches is the default selected filter
    expect(screen.getByTestId('Searches')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('NoResults')).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders datePick', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionTable {...props} />);

    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
  });

  it('renders not found page', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionTable {...props} collections={[]} />);

    expect(screen.getByText('Try searching for another term.')).toBeInTheDocument();
  });
});
