/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import { EntitySummaryGrid } from './entity_summary_grid';
import { mockEntityRecord } from '../../mocks';
import type { Entity } from '../../../../../common/api/entity_analytics';

jest.mock('../../../../entity_analytics/api/hooks/use_get_watchlists', () => ({
  useGetWatchlists: jest.fn().mockReturnValue({
    data: [
      { id: 'watchlist-1', name: 'First Watchlist' },
      { id: 'watchlist-2', name: 'Second Watchlist' },
    ],
  }),
}));

const entityWithSource: Entity = {
  ...mockEntityRecord,
  entity: {
    ...mockEntityRecord.entity,
    source: ['logs-endpoint'],
  },
} as Entity;

const entityWithWatchlists = {
  ...entityWithSource,
  entity: {
    ...entityWithSource.entity,
    attributes: {
      watchlists: ['watchlist-1', 'watchlist-2'],
    },
  },
} as unknown as Entity;

const entityWithMultipleSources = {
  ...mockEntityRecord,
  entity: {
    ...mockEntityRecord.entity,
    source: ['okta', 'entityanalytics_okta'],
  },
} as unknown as Entity;

describe('EntitySummaryGrid', () => {
  it('renders four panels', () => {
    const { getByText } = render(
      <TestProviders>
        <EntitySummaryGrid entityRecord={entityWithSource} criticalityLevel="high_impact" />
      </TestProviders>
    );

    expect(getByText('Entity ID')).toBeInTheDocument();
    expect(getByText('Data source')).toBeInTheDocument();
    expect(getByText('Asset criticality')).toBeInTheDocument();
    expect(getByText('Watchlists')).toBeInTheDocument();
  });

  it('displays entity id', () => {
    const { getByText } = render(
      <TestProviders>
        <EntitySummaryGrid entityRecord={entityWithSource} />
      </TestProviders>
    );

    expect(getByText('test-entity-id-host-abc123')).toBeInTheDocument();
  });

  it('displays data source formatted (capitalized, separators replaced with spaces)', () => {
    const { getByText, queryByText } = render(
      <TestProviders>
        <EntitySummaryGrid entityRecord={entityWithSource} />
      </TestProviders>
    );

    expect(getByText('Logs Endpoint')).toBeInTheDocument();
    expect(queryByText('logs-endpoint')).not.toBeInTheDocument();
  });

  it('displays first data source inline and a "+N" overflow badge when entity.source is an array', () => {
    const { getByText, queryByText, getByTestId } = render(
      <TestProviders>
        <EntitySummaryGrid entityRecord={entityWithMultipleSources} />
      </TestProviders>
    );

    expect(getByText('Okta')).toBeInTheDocument();
    expect(queryByText('okta')).not.toBeInTheDocument();
    expect(queryByText('entityanalytics_okta')).not.toBeInTheDocument();
    expect(getByTestId('entitySourceValue-more')).toHaveTextContent('+1');
  });

  it('renders asset criticality badge', () => {
    const { getByTestId } = render(
      <TestProviders>
        <EntitySummaryGrid entityRecord={entityWithSource} criticalityLevel="high_impact" />
      </TestProviders>
    );

    expect(getByTestId('asset-criticality-badge')).toBeInTheDocument();
  });

  it('shows arrow down icon when onCriticalitySave is provided', () => {
    const { container } = render(
      <TestProviders>
        <EntitySummaryGrid
          entityRecord={entityWithSource}
          criticalityLevel="high_impact"
          onCriticalitySave={jest.fn()}
        />
      </TestProviders>
    );

    expect(container.querySelector('[data-euiicon-type="arrowDown"]')).toBeInTheDocument();
  });

  it('does not show arrow down icon when onCriticalitySave is not provided', () => {
    const { container } = render(
      <TestProviders>
        <EntitySummaryGrid entityRecord={entityWithSource} criticalityLevel="high_impact" />
      </TestProviders>
    );

    expect(container.querySelector('[data-euiicon-type="arrowDown"]')).not.toBeInTheDocument();
  });

  it('opens criticality modal on click', () => {
    const { getByTestId } = render(
      <TestProviders>
        <EntitySummaryGrid
          entityRecord={entityWithSource}
          criticalityLevel="high_impact"
          onCriticalitySave={jest.fn()}
        />
      </TestProviders>
    );

    fireEvent.click(getByTestId('asset-criticality-badge'));

    expect(getByTestId('asset-criticality-modal-title')).toBeInTheDocument();
  });

  it('displays first watchlist name', () => {
    const { getByText } = render(
      <TestProviders>
        <EntitySummaryGrid entityRecord={entityWithWatchlists} />
      </TestProviders>
    );

    expect(getByText('First Watchlist')).toBeInTheDocument();
  });

  it('displays a +N overflow badge for additional watchlists', () => {
    const { getByTestId } = render(
      <TestProviders>
        <EntitySummaryGrid entityRecord={entityWithWatchlists} />
      </TestProviders>
    );

    expect(getByTestId('entityWatchlistsCell-more')).toHaveTextContent('+1');
  });
});
