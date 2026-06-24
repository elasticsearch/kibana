/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { ElementClickListener } from '@elastic/charts';
import { ALERT_EPISODE_STATUS } from '@kbn/alerting-v2-schemas';
import type { EpisodeEventRow } from '../../queries/episode_events_query';
import { EpisodeSeverity } from '../severity/severity_utils';
import { AlertEpisodeSeverityHeatmap } from './severity_heatmap';

let capturedHeatmapData: unknown;
let capturedOnElementClick: ElementClickListener | undefined;

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: jest.fn(() => ({
    services: {
      charts: {
        theme: {
          useChartsBaseTheme: () => ({}),
        },
      },
    },
  })),
}));

jest.mock('@elastic/charts', () => ({
  Chart: ({ children }: { children: React.ReactNode }) => (
    <div data-test-subj="mockSeverityHeatmapChart">{children}</div>
  ),
  Settings: ({
    onElementClick,
    children,
  }: {
    onElementClick?: ElementClickListener;
    children?: React.ReactNode;
  }) => {
    capturedOnElementClick = onElementClick;
    return <div data-test-subj="mockSeverityHeatmapSettings">{children}</div>;
  },
  Heatmap: ({ data }: { data: unknown }) => {
    capturedHeatmapData = data;
    return null;
  },
  Tooltip: () => null,
  Predicate: { NumAsc: 'NumAsc' },
  ScaleType: { Ordinal: 'ordinal' },
}));

const createEventRow = (overrides: Partial<EpisodeEventRow> = {}): EpisodeEventRow => ({
  '@timestamp': '2024-01-01T00:00:00.000Z',
  'episode.id': 'ep-1',
  'episode.status': ALERT_EPISODE_STATUS.ACTIVE,
  'rule.id': 'rule-1',
  group_hash: 'hash',
  severity: EpisodeSeverity.High,
  ...overrides,
});

const renderHeatmap = (eventRows: EpisodeEventRow[]) =>
  render(
    <I18nProvider>
      <AlertEpisodeSeverityHeatmap eventRows={eventRows} />
    </I18nProvider>
  );

const clickHeatmapCell = (originalIndex: number) => {
  act(() => {
    capturedOnElementClick?.([[{ datum: { originalIndex } } as never, {} as never]]);
  });
};

describe('AlertEpisodeSeverityHeatmap', () => {
  beforeEach(() => {
    capturedHeatmapData = undefined;
    capturedOnElementClick = undefined;
  });

  it('renders the severity timeline panel', () => {
    renderHeatmap([createEventRow()]);

    expect(screen.getByTestId('alertingV2EpisodeSeverityHeatmap')).toBeInTheDocument();
    expect(screen.getByText('Severity Timeline')).toBeInTheDocument();
    expect(screen.getByTestId('mockSeverityHeatmapChart')).toBeInTheDocument();
  });

  it('builds chart data only from supported-severity rows in timestamp order', () => {
    renderHeatmap([
      createEventRow({ '@timestamp': '2024-01-03T00:00:00.000Z', severity: EpisodeSeverity.Low }),
      createEventRow({ '@timestamp': '2024-01-01T00:00:00.000Z', severity: EpisodeSeverity.High }),
      createEventRow({ '@timestamp': '2024-01-02T00:00:00.000Z', severity: null }),
    ]);

    expect(capturedHeatmapData).toEqual([
      expect.objectContaining({ severity: EpisodeSeverity.High, x: 0 }),
      expect.objectContaining({ severity: EpisodeSeverity.Low, x: 1 }),
    ]);
  });

  it('shows start and end axis labels for multiple events', () => {
    renderHeatmap([
      createEventRow({ '@timestamp': '2024-01-01T00:00:00.000Z', severity: EpisodeSeverity.High }),
      createEventRow({ '@timestamp': '2024-01-02T00:00:00.000Z', severity: EpisodeSeverity.Low }),
    ]);

    const axisLabels = screen.getAllByText(/Jan/);
    expect(axisLabels).toHaveLength(2);
  });

  it('shows only the start axis label for a single event', () => {
    renderHeatmap([
      createEventRow({ '@timestamp': '2024-01-01T00:00:00.000Z', severity: EpisodeSeverity.High }),
    ]);

    const axisLabels = screen.getAllByText(/Jan/);
    expect(axisLabels).toHaveLength(1);
  });

  it('opens the detail panel when a cell is clicked', async () => {
    renderHeatmap([
      createEventRow({ severity: EpisodeSeverity.High, data: { 'host.name': 'h1' } }),
    ]);

    clickHeatmapCell(0);

    await waitFor(() => {
      expect(screen.getByTestId('alertingV2EpisodeSeverityHeatmapDetailPanel')).toBeInTheDocument();
    });
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('host.name')).toBeInTheDocument();
  });

  it('closes the detail panel when the same cell is clicked again', async () => {
    renderHeatmap([
      createEventRow({ severity: EpisodeSeverity.High, data: { 'host.name': 'h1' } }),
    ]);

    clickHeatmapCell(0);
    await waitFor(() => {
      expect(screen.getByTestId('alertingV2EpisodeSeverityHeatmapDetailPanel')).toBeInTheDocument();
    });

    clickHeatmapCell(0);
    await waitFor(() => {
      expect(
        screen.queryByTestId('alertingV2EpisodeSeverityHeatmapDetailPanel')
      ).not.toBeInTheDocument();
    });
  });

  it('shows an empty-state message when the selected event has no evaluation data', async () => {
    renderHeatmap([createEventRow({ severity: EpisodeSeverity.High, data: null })]);

    clickHeatmapCell(0);

    await waitFor(() => {
      expect(screen.getByTestId('alertingV2EpisodeSeverityHeatmapDetailEmpty')).toBeInTheDocument();
    });
    expect(screen.getByText('No evaluation data is available for this event.')).toBeInTheDocument();
  });
});
