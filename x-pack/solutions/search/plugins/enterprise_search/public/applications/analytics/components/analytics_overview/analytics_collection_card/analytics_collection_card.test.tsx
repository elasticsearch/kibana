/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { FilterBy } from '../../../utils/get_formula_by_filter';

import { AnalyticsCollectionCard } from './analytics_collection_card';

jest.mock('@elastic/charts', () => ({
  ...jest.requireActual('@elastic/charts'),
  AreaSeries: () => <div data-test-subj="areaSeries" />,
  Chart: ({ children }: { children: React.ReactNode }) => (
    <div data-test-subj="enterpriseSearchAnalyticsCollectionCardChart">{children}</div>
  ),
  Settings: () => null,
  Tooltip: () => null,
}));

const mockCollection = {
  event_retention_day_length: 180,
  events_datastream: 'analytics-events-example2',
  id: 'example2',
  name: 'example2',
};

describe('AnalyticsCollectionCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loading charts', async () => {
    renderWithKibanaRenderContext(
      <AnalyticsCollectionCard
        collection={mockCollection}
        isLoading
        metric={null}
        secondaryMetric={null}
        data={[]}
        filterBy={FilterBy.Searches}
      />
    );

    expect(
      screen.queryByTestId('enterpriseSearchAnalyticsCollectionCardChart')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('enterpriseSearchAnalyticsCollectionCard')).toBeInTheDocument();
  });

  it('render', async () => {
    setMockValues({});

    const mockMetric = 999;
    const secondaryMetric = 124;

    renderWithKibanaRenderContext(
      <AnalyticsCollectionCard
        collection={mockCollection}
        isLoading={false}
        metric={mockMetric}
        secondaryMetric={secondaryMetric}
        data={[[0, 23]]}
        filterBy={FilterBy.Searches}
      />
    );

    expect(screen.getByTestId('enterpriseSearchAnalyticsCollectionCard')).toBeInTheDocument();
    expect(screen.getByTestId('enterpriseSearchAnalyticsCollectionCardChart')).toBeInTheDocument();
  });

  it('hide charts when data is not provided', async () => {
    setMockValues({});

    const mockMetric = 999;
    const secondaryMetric = 124;

    renderWithKibanaRenderContext(
      <AnalyticsCollectionCard
        collection={mockCollection}
        isLoading={false}
        metric={mockMetric}
        secondaryMetric={secondaryMetric}
        data={[]}
        filterBy={FilterBy.Searches}
      />
    );

    expect(screen.getByTestId('enterpriseSearchAnalyticsCollectionCard')).toBeInTheDocument();
    expect(
      screen.queryByTestId('enterpriseSearchAnalyticsCollectionCardChart')
    ).not.toBeInTheDocument();
  });
});
