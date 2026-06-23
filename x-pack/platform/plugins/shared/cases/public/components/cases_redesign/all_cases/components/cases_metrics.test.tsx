/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, within } from '@testing-library/react';
import React from 'react';

import { renderWithTestingProviders } from '../../../../common/mock';
import { useGetCasesMetrics } from '../../../../containers/use_get_cases_metrics';
import { CasesMetrics } from './cases_metrics';

jest.mock('pretty-ms', () => jest.fn().mockReturnValue('2ms'));
jest.mock('../../../../containers/use_get_cases_metrics');

const useGetCasesMetricsMock = useGetCasesMetrics as jest.Mock;

describe('Cases metrics', () => {
  beforeEach(() => {
    useGetCasesMetricsMock.mockReturnValue({
      isLoading: false,
      data: {
        mttr: 2000,
        status: { open: 20, inProgress: 40, closed: 130 },
      },
    });
  });

  it('renders the correct stats', async () => {
    renderWithTestingProviders(<CasesMetrics />);

    expect(await screen.findByTestId('cases-metrics-stats')).toBeInTheDocument();

    expect(
      within(await screen.findByTestId('openStatsHeader')).getByText('20')
    ).toBeInTheDocument();

    expect(
      within(await screen.findByTestId('inProgressStatsHeader')).getByText('40')
    ).toBeInTheDocument();

    expect(
      within(await screen.findByTestId('closedStatsHeader')).getByText('130')
    ).toBeInTheDocument();

    expect(
      within(await screen.findByTestId('mttrStatsHeader')).getByText('2ms')
    ).toBeInTheDocument();
  });

  it('should render the loading spinner when loading stats', async () => {
    useGetCasesMetricsMock.mockReturnValue({
      isLoading: true,
      data: {
        mttr: 2000,
        status: { open: 20, inProgress: 40, closed: 130 },
      },
    });

    renderWithTestingProviders(<CasesMetrics />);

    expect(screen.getByTestId('openStatsHeader-loading-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('inProgressStatsHeader-loading-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('closedStatsHeader-loading-spinner')).toBeInTheDocument();
  });
});
