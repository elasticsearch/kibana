/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '../../../../__mocks__/kea_logic';

import React from 'react';

import { fireEvent, screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { AnalyticsCollection } from '../../../../../../common/types/analytics';

import { AnalyticsCollectionIntegrateView } from './analytics_collection_integrate_view';

jest.mock('../../../../shared/cloud_details/cloud_details', () => ({
  useCloudDetails: () => ({
    elasticsearchUrl: 'your_deployment_url',
  }),
}));

describe('AnalyticsCollectionIntegrate', () => {
  const analyticsCollections: AnalyticsCollection = {
    events_datastream: 'analytics-events-example',
    name: 'example',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders', () => {
    renderWithKibanaRenderContext(
      <AnalyticsCollectionIntegrateView analyticsCollection={analyticsCollections} />
    );

    // Default tab is "Javascript Embed" — shows "Embed onto site" step
    expect(screen.getByText('Embed onto site')).toBeInTheDocument();

    // Switch to Search UI tab
    fireEvent.click(screen.getByTestId('searchuiEmbed'));
    expect(screen.getByText('Embed Behavioral Analytics')).toBeInTheDocument();
    expect(screen.queryByText('Embed onto site')).not.toBeInTheDocument();

    // Switch to Javascript Client tab
    fireEvent.click(screen.getByTestId('javascriptClientEmbed'));
    expect(screen.getByText('Install client')).toBeInTheDocument();
  });

  it('check value of config & webClientSrc', () => {
    renderWithKibanaRenderContext(
      <AnalyticsCollectionIntegrateView analyticsCollection={analyticsCollections} />
    );

    // webClientSrc is embedded inside a <script src="..."> tag
    expect(
      screen.getByText(
        /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@elastic\/behavioral-analytics-browser-tracker@2"><\/script>/s
      )
    ).toBeInTheDocument();

    // analyticsConfig fields are interpolated into the tracker initialization snippet
    expect(screen.getByText(/endpoint.*your_deployment_url/s)).toBeInTheDocument();
    expect(screen.getByText(/collectionName.*"example"/s)).toBeInTheDocument();
    expect(screen.getByText(/apiKey.*"########"/s)).toBeInTheDocument();
  });
});
