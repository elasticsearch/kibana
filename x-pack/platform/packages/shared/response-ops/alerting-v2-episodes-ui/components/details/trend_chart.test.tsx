/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { AlertEpisodeTrendChart } from './trend_chart';
import type { TrendSeries, TrendThreshold } from './trend_types';

// Render @elastic/charts primitives as inspectable stand-ins.
jest.mock('@elastic/charts', () => {
  const actual = jest.requireActual('@elastic/charts');
  return {
    ...actual,
    Chart: ({ children }: { children: React.ReactNode }) => (
      <div data-test-subj="chart">{children}</div>
    ),
    Settings: () => <div data-test-subj="settings" />,
    Tooltip: () => <div data-test-subj="tooltip" />,
    Axis: ({ id, gridLine }: { id: string; gridLine?: { visible?: boolean } }) => (
      <div data-test-subj={`axis-${id}`} data-grid-lines={String(gridLine?.visible ?? true)} />
    ),
    LineSeries: ({ id }: { id: string }) => <div data-test-subj={`line-${id}`} />,
    LineAnnotation: ({
      id,
      marker,
      dataValues,
    }: {
      id: string;
      marker?: React.ReactNode;
      dataValues?: Array<{ details?: unknown }>;
    }) => {
      const details = dataValues?.[0]?.details;
      return (
        <div
          data-test-subj={`annotation-${id}`}
          data-details={typeof details === 'string' ? details : undefined}
        >
          {marker}
        </div>
      );
    },
  };
});

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: () => ({
    services: { charts: { theme: { useChartsBaseTheme: () => ({}) } } },
  }),
}));

const mockSeries: TrendSeries = {
  id: 'count',
  label: 'count',
  points: [{ x: 1, y: 10 }],
};
const mockThresholds: TrendThreshold[] = [
  { id: 't1', metric: 'count', label: 'count > 100', values: [100] },
];

describe('AlertEpisodeTrendChart', () => {
  it('renders a line series for the metric', () => {
    render(<AlertEpisodeTrendChart series={mockSeries} thresholds={mockThresholds} />);
    expect(screen.getByTestId('line-count')).toBeInTheDocument();
  });

  it('renders one annotation per threshold', () => {
    render(<AlertEpisodeTrendChart series={mockSeries} thresholds={mockThresholds} />);
    expect(screen.getByTestId('annotation-t1')).toBeInTheDocument();
  });

  it('exposes the threshold condition as the annotation tooltip detail', () => {
    render(<AlertEpisodeTrendChart series={mockSeries} thresholds={mockThresholds} />);
    expect(screen.getByTestId('annotation-t1')).toHaveAttribute('data-details', 'count > 100');
  });

  it('renders two annotations for a BETWEEN threshold (two values)', () => {
    const betweenThresholds: TrendThreshold[] = [
      { id: 'tb', metric: 'count', label: 'count between 10 and 50', values: [10, 50] },
    ];
    render(<AlertEpisodeTrendChart series={mockSeries} thresholds={betweenThresholds} />);
    expect(screen.getByTestId('annotation-tb-0')).toBeInTheDocument();
    expect(screen.getByTestId('annotation-tb-1')).toBeInTheDocument();
  });

  it('draws gridlines from the left axis', () => {
    render(<AlertEpisodeTrendChart series={mockSeries} thresholds={mockThresholds} />);
    expect(screen.getByTestId('axis-left')).toHaveAttribute('data-grid-lines', 'true');
  });

  it('renders no right axis', () => {
    render(<AlertEpisodeTrendChart series={mockSeries} thresholds={mockThresholds} />);
    expect(screen.queryByTestId('axis-right')).not.toBeInTheDocument();
  });
});
