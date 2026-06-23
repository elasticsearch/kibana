/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEuiTheme } from '@elastic/eui';
import { SeverityHeatmapDetailPanel } from './severity_heatmap_detail_panel';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    useEuiTheme: jest.fn(),
  };
});

const useEuiThemeMock = jest.mocked(useEuiTheme);

describe('SeverityHeatmapDetailPanel', () => {
  beforeEach(() => {
    useEuiThemeMock.mockReturnValue({
      euiTheme: {
        size: { xs: '4px', s: '8px' },
      },
    } as ReturnType<typeof useEuiTheme>);
  });

  it('renders the detail table and calls onClose when dismissed', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();

    render(
      <SeverityHeatmapDetailPanel
        severityLabel="High"
        timestamp="Jan 1, 2024, 12:00:00 AM"
        eventData={{ 'host.name': 'h1', severity: 'high' }}
        euiTheme={useEuiThemeMock().euiTheme}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('alertingV2EpisodeSeverityHeatmapDetailPanel')).toBeInTheDocument();
    expect(screen.getByTestId('alertingV2EpisodeSeverityHeatmapDetailTable')).toBeInTheDocument();
    expect(screen.getByText('host.name')).toBeInTheDocument();
    expect(screen.getByText('h1')).toBeInTheDocument();

    await user.click(screen.getByTestId('alertingV2EpisodeSeverityHeatmapDetailPanelClose'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an empty message when the event has no evaluation data', () => {
    render(
      <SeverityHeatmapDetailPanel
        severityLabel="High"
        timestamp="Jan 1, 2024, 12:00:00 AM"
        eventData={null}
        euiTheme={useEuiThemeMock().euiTheme}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByTestId('alertingV2EpisodeSeverityHeatmapDetailEmpty')).toBeInTheDocument();
    expect(screen.getByText('No evaluation data is available for this event.')).toBeInTheDocument();
    expect(
      screen.queryByTestId('alertingV2EpisodeSeverityHeatmapDetailTable')
    ).not.toBeInTheDocument();
  });
});
