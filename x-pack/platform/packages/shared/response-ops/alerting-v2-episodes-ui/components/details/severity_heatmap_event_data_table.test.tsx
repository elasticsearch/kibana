/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { useEuiTheme } from '@elastic/eui';
import { SeverityHeatmapEventDataTable } from './severity_heatmap_event_data_table';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    useEuiTheme: jest.fn(),
  };
});

const useEuiThemeMock = jest.mocked(useEuiTheme);

const TestWrapper = ({ eventData }: { eventData: Record<string, unknown> | null }) => {
  const { euiTheme } = useEuiTheme();
  return <SeverityHeatmapEventDataTable eventData={eventData} euiTheme={euiTheme} />;
};

describe('SeverityHeatmapEventDataTable', () => {
  beforeEach(() => {
    useEuiThemeMock.mockReturnValue({
      euiTheme: {
        size: { xs: '4px', s: '8px' },
      },
    } as ReturnType<typeof useEuiTheme>);
  });

  it('renders field and value columns for event data', () => {
    render(<TestWrapper eventData={{ 'host.name': 'h1', severity: 'high' }} />);

    expect(screen.getByTestId('alertingV2EpisodeSeverityHeatmapTooltip')).toBeInTheDocument();
    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByText('host.name')).toBeInTheDocument();
    expect(screen.getByText('h1')).toBeInTheDocument();
    expect(screen.getByText('severity')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('renders an empty table when event data is missing', () => {
    render(<TestWrapper eventData={null} />);

    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });
});
