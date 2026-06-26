/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EntityAnalyticsPage } from './entity_analytics_dashboard';
import { TestProviders } from '../../common/mock';

import { useIsExperimentalFeatureEnabled } from '../../common/hooks/use_experimental_features';
import { useDataView } from '../../data_view_manager/hooks/use_data_view';

jest.mock('../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn(() => false),
}));

jest.mock('../../data_view_manager/hooks/use_data_view_spec', () => ({
  useDataViewSpec: jest.fn(() => ({
    dataViewSpec: { id: 'experimental', matchedIndices: ['index-2'] },
  })),
}));

jest.mock('../../data_view_manager/hooks/use_data_view');

jest.mock('../hooks/use_enabled_entity_types', () => ({
  useEntityAnalyticsTypes: jest.fn(() => ['host', 'user']),
}));

jest.mock('../components/entity_store/components/dashboard_entity_store_panels', () => ({
  EntityStoreDashboardPanels: () => <div data-test-subj="entityStoreDashboardPanels" />,
}));

jest.mock('../components/entity_analytics_header', () => ({
  EntityAnalyticsHeader: () => <div data-test-subj="entityAnalyticsHeader" />,
}));

jest.mock('../components/entity_analytics_anomalies', () => ({
  EntityAnalyticsAnomalies: () => <div data-test-subj="entityAnalyticsAnomalies" />,
}));

jest.mock('../../common/components/empty_prompt', () => ({
  EmptyPrompt: ({ onSkip }: { onSkip: () => void }) => (
    <button type="button" data-test-subj="emptyPrompt" onClick={onSkip}>
      {'EmptyPrompt'}
    </button>
  ),
}));

describe('EntityAnalyticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useDataView as jest.Mock).mockReturnValue({
      dataView: { matchedIndices: ['index-2'] },
      status: 'ready',
    });

    (useIsExperimentalFeatureEnabled as jest.Mock).mockImplementation(() => false);
  });

  it('renders the main sections when indices exist', () => {
    render(
      <MemoryRouter>
        <EntityAnalyticsPage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByTestId('entityStoreDashboardPanels')).toBeInTheDocument();
    expect(screen.getByTestId('entityAnalyticsAnomalies')).toBeInTheDocument();
  });

  it('renders entity analytics title by default', () => {
    render(
      <MemoryRouter>
        <EntityAnalyticsPage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    const continueLink = screen.queryByText('Continue without integrations');
    if (continueLink) {
      userEvent.click(continueLink);
    }

    expect(screen.getByText('Entity analytics')).toBeInTheDocument();
  });

  it('renders Entity analytics title', () => {
    render(
      <MemoryRouter>
        <EntityAnalyticsPage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );
    expect(screen.getByText('Entity analytics')).toBeInTheDocument();
  });

  it('renders loading spinner when data view is loading', () => {
    (useDataView as jest.Mock).mockReturnValue({
      dataView: { matchedIndices: ['index-2'] },
      status: 'loading',
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsPage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByTestId('entityAnalyticsLoader')).toBeInTheDocument();
  });

  it('renders EmptyPrompt when indices do not exist', () => {
    (useDataView as jest.Mock).mockReturnValue({
      dataView: { matchedIndices: [] },
      status: 'loading',
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsPage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    expect(screen.getByTestId('emptyPrompt')).toBeInTheDocument();
    expect(screen.queryByTestId('entityAnalyticsPage')).not.toBeInTheDocument();
  });

  it('skips EmptyPrompt and renders main content when onSkip is called', async () => {
    (useDataView as jest.Mock).mockReturnValue({
      dataView: { matchedIndices: [] },
      status: 'ready',
    });

    render(
      <MemoryRouter>
        <EntityAnalyticsPage />
      </MemoryRouter>,
      { wrapper: TestProviders }
    );

    const emptyPromptButton = screen.getByTestId('emptyPrompt');
    fireEvent.click(emptyPromptButton);

    await waitFor(() => {
      expect(screen.queryByTestId('emptyPrompt')).not.toBeInTheDocument();
      expect(screen.getByTestId('entityAnalyticsPage')).toBeInTheDocument();
    });
  });
});
